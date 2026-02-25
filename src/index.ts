import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { Border0Client } from './border0.js';
import { DockerDiscovery, K8sDiscovery, type ContainerDiscovery } from './discovery.js';
import { type ProvisionRequest, type DeprovisionRequest } from './models.js';
import { getSecret } from './config.js';
import { logger, startObservabilityServer, provisionCounter, requestDuration } from './observability.js';
import { initTracing } from './tracing.js';

// Initialize OpenTelemetry Tracing
initTracing();

/**
 * Main application for FermiHDI Border0 Coder Glue Logic.
 * This app manages dynamic socket provisioning for Coder workspaces.
 */

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Load Config & Secrets
const BORDER0_TOKEN = getSecret('BORDER0_ADMIN_TOKEN');
const BORDER0_CONNECTOR_ID = getSecret('BORDER0_CONNECTOR_ID');
const GLOBAL_POLICY_ID = process.env.BORDER0_GLOBAL_POLICY_ID; // Predefined Mgmt Policy
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'docker';

const border0 = new Border0Client(BORDER0_TOKEN);

/**
 * Factory for creating the appropriate discovery engine based on deployment mode.
 */
function getDiscoveryEngine(): ContainerDiscovery {
    if (DEPLOYMENT_MODE.toLowerCase() === 'k8s') {
        return new K8sDiscovery();
    }
    return new DockerDiscovery();
}

const discovery = getDiscoveryEngine();

/**
 * POST /provision
 * Provisions SSH and VNC sockets for a given container.
 */
app.post('/provision', async (req: Request<{}, {}, ProvisionRequest>, res: Response) => {
    const { container_id, user_email, namespace } = req.body;

    // 1. Discover Container/Pod
    const info = await discovery.getContainerInfo(container_id, namespace);
    if (!info || !info.ip) {
        return res.status(404).json({ error: `Container/Pod ${container_id} not found in ${DEPLOYMENT_MODE}` });
    }

    // 2. Resolve User Email (Request Body >> Labels/Annotations)
    const email = user_email || info.email;

    try {
        const shortId = container_id.substring(0, 8);
        const sshName = `ssh-${shortId}`;
        const vncName = `vnc-${shortId}`;

        logger.info(`Provisioning sockets for ${container_id}`, {
            category: 'provisioning',
            action: 'create_sockets',
            data: { ip: info.ip, mode: DEPLOYMENT_MODE }
        });
        const policies = GLOBAL_POLICY_ID ? [GLOBAL_POLICY_ID] : [];

        // 3. Create or Update Sockets (Idempotent)
        const setupSocket = async (name: string, type: string, port: number) => {
            let socket = await border0.findSocketByName(name);
            if (socket) {
                logger.info(`Socket ${name} already exists. Updating upstream host...`, { data: { socket_id: socket.id } });
                socket = await border0.updateSocket(socket.id, { upstream_host: info.ip });
            } else {
                logger.info(`Creating new ${type} socket: ${name}`);
                socket = await border0.createSocket(name, type, BORDER0_CONNECTOR_ID, info.ip, port);
            }
            // 4. Attach Policies (User + Optional Global Policy)
            await border0.attachPolicies(socket.id, email, policies);
            return socket;
        };

        const sshSocket = await setupSocket(sshName, 'ssh', 22);
        const vncSocket = await setupSocket(vncName, 'vnc', 5901);

        provisionCounter.inc({ outcome: 'success' });
        res.json({
            urls: {
                ssh: sshSocket.dnsname,
                vnc: vncSocket.dnsname
            },
            socket_ids: [sshSocket.id, vncSocket.id]
        });
    } catch (error: any) {
        provisionCounter.inc({ outcome: 'failure' });
        const errMsg = error.response?.data || error.message;
        logger.error(`Provisioning failed`, { category: 'provisioning', data: { error: errMsg } });
        res.status(500).json({ error: errMsg });
    }
});

/**
 * POST /deprovision
 * Removes sockets associated with a workspace container.
 * Also cleans up personal policies if no other sockets are using them.
 */
app.post('/deprovision', async (req: Request<{}, {}, DeprovisionRequest>, res: Response) => {
    const { container_id } = req.body;
    const shortId = container_id.substring(0, 8);

    try {
        const sockets = await border0.listSocketsByName(shortId);
        console.log(`[FermiHDI] Deprovisioning ${sockets.length} sockets for ${shortId}`);

        for (const s of sockets) {
            // Capture policies before deletion to check for orphans
            const personalPolicies = (s.policies || []).filter((p: any) => p.name.startsWith('user-policy-'));

            await border0.deleteSocket(s.id);

            // Potential Garbage Collection: Check if personal policies are now orphaned
            for (const p of personalPolicies) {
                const attachmentCount = await border0.getSocketCountByPolicy(p.id);
                if (attachmentCount === 0) {
                    console.log(`[FermiHDI] Personal policy ${p.name} is now orphaned. Cleaning up...`);
                    await border0.deletePolicy(p.id).catch(e => console.error('Failed to delete orphaned policy:', e));
                }
            }
        }

        res.json({ status: 'success', deleted_count: sockets.length });
    } catch (error: any) {
        const errMsg = error.response?.data || error.message;
        console.error(`[FermiHDI] Deprovisioning failed:`, errMsg);
        res.status(500).json({ error: errMsg });
    }
});

/**
 * GET /
 * Health check endpoint for monitoring and K8s probes.
 */
app.get('/', (req: Request, res: Response) => {
    res.json({ status: 'healthy', mode: DEPLOYMENT_MODE });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    logger.info(`Border0 Glue App running on port ${PORT}`, { data: { mode: DEPLOYMENT_MODE } });

    // Start Observability Server (Port 8080) for Health/Metrics
    startObservabilityServer();

    /**
     * Adaptive maintenance scheduler.
     * Starts at a random interval and adjusts frequency based on API latency.
     */
    async function scheduleMaintenance() {
        const stats = await border0.performPolicyMaintenance();

        let nextDelay: number;

        // "Overly latent" threshold (e.g. > 5 seconds for simple list/delete ops)
        // If latent, we assume API stress/exhaustion and jitter next run within 5 mins.
        if (stats.duration > 5000 || !stats.success) {
            nextDelay = Math.floor(Math.random() * 5 * 60 * 1000);
            logger.warn(`Maintenance was latent (${stats.duration}ms). Rescheduling in ${Math.round(nextDelay / 1000)}s to avoid exhaustion.`);
        } else {
            // Normal hourly interval
            nextDelay = 60 * 60 * 1000;
        }

        setTimeout(scheduleMaintenance, nextDelay);
    }

    // Start with a random initial delay (between 0 and 60 minutes) to avoid thundering herd
    const initialDelay = Math.floor(Math.random() * 60 * 60 * 1000);
    logger.info(`Initial maintenance scheduled in ${Math.round(initialDelay / 60000)} minutes.`);
    setTimeout(scheduleMaintenance, initialDelay);
});
