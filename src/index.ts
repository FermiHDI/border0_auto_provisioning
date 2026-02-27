import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { Border0Client } from './border0.js';
import { DockerDiscovery, K8sDiscovery, type ContainerDiscovery } from './discovery.js';
import { type ProvisionRequest, type ProvisionResponse, type DeprovisionRequest } from './models.js';
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
export { app };
app.use(express.json());
app.use(cors());

// Load Config & Secrets
const BORDER0_TOKEN = getSecret('BORDER0_ADMIN_TOKEN');
const BORDER0_CONNECTOR_ID = getSecret('BORDER0_CONNECTOR_ID');
const BORDER0_SSH_USERNAME = getSecret('BORDER0_SSH_USERNAME') || 'coder';
const GLOBAL_POLICY_ID = process.env.BORDER0_GLOBAL_POLICY_ID; // Predefined Mgmt Policy
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'docker';

const border0 = new Border0Client(BORDER0_TOKEN, BORDER0_SSH_USERNAME);

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
 * Standalone logic to provision sockets for a container/pod.
 */
async function performProvision(container_id: string, user_email?: string, namespace?: string, options?: ProvisionRequest) {
    const info = await discovery.getContainerInfo(container_id, namespace);
    if (!info || !info.ip) {
        throw new Error(`Container/Pod ${container_id} not found in ${DEPLOYMENT_MODE}`);
    }

    // Resolve User Email (Explicit >> Labels/Annotations)
    const email = user_email || info.email || info.labels['border0.io/email'];

    const shortId = container_id.substring(0, 8);
    const policies = GLOBAL_POLICY_ID ? [GLOBAL_POLICY_ID] : [];

    // Helper to determine if a socket type should be enabled and which port to use
    const getSocketConfig = (type: string, defaultPort: number) => {
        const optionEnabled = (options as any)?.[type];
        const labelEnabled = info.labels[`border0.io/${type}`];
        const enable = optionEnabled !== undefined ? optionEnabled :
            (labelEnabled !== undefined ? labelEnabled === 'true' : (type === 'ssh'));

        const optionPort = (options as any)?.[`${type}_port`];
        const labelPort = info.labels[`border0.io/${type}_port`];
        const port = optionPort || parseInt(labelPort || defaultPort.toString());

        return { enable, port };
    };

    const configs = {
        ssh: getSocketConfig('ssh', 22),
        vnc: getSocketConfig('vnc', 5901),
        web: getSocketConfig('web', 80),
        tcp: getSocketConfig('tcp', 0), // Default 0 means must be specified if enabled
        rdp: getSocketConfig('rdp', 3389)
    };

    logger.info(`Provisioning sockets for ${container_id}`, {
        category: 'provisioning',
        action: 'create_sockets',
        data: { ip: info.ip, mode: DEPLOYMENT_MODE, email, configs }
    });

    const setupSocket = async (name: string, type: string, port: number) => {
        const border0Type = type === 'web' ? 'http' : type;
        let socket = await border0.findSocketByName(name);
        if (socket) {
            logger.info(`Socket ${name} already exists. Updating configuration...`, { data: { socket_id: socket.id } });
            const updatePayload: any = { upstream_host: info.ip, upstream_port: port };
            if (border0Type === 'ssh') {
                updatePayload.ssh_authentication_type = 'border0_certificate';
                updatePayload.ssh_username = BORDER0_SSH_USERNAME;
            }
            socket = await border0.updateSocket(socket.id, updatePayload);
        } else {
            logger.info(`Creating new ${border0Type} socket: ${name} on port ${port}`);
            socket = await border0.createSocket(name, border0Type, BORDER0_CONNECTOR_ID, info.ip, port);
        }
        await border0.attachPolicies(socket.id, email, policies);
        return socket;
    };

    const result: ProvisionResponse = { urls: {}, socket_ids: [] };

    for (const [type, cfg] of Object.entries(configs)) {
        if (cfg.enable) {
            if (cfg.port === 0 && type !== 'ssh') { // Quick validation if someone enables TCP without a port
                logger.warn(`Socket type ${type} enabled but port is 0. Skipping.`);
                continue;
            }
            const name = `${type}-${shortId}`;
            const socket = await setupSocket(name, type, cfg.port);
            (result.urls as any)[type] = socket.dnsname;
            result.socket_ids.push(socket.id);
        }
    }

    return result;
}

/**
 * Standalone logic to deprovision sockets.
 */
async function performDeprovision(container_id: string) {
    const shortId = container_id.substring(0, 8);
    const sockets = await border0.listSocketsByName(shortId);

    logger.info(`Deprovisioning ${sockets.length} sockets for ${shortId}`);

    for (const s of sockets) {
        const personalPolicies = (s.policies || []).filter((p: any) => p.name.startsWith('user-policy-'));
        await border0.deleteSocket(s.id);

        for (const p of personalPolicies) {
            const attachmentCount = await border0.getSocketCountByPolicy(p.id);
            if (attachmentCount === 0) {
                logger.info(`Personal policy ${p.name} is now orphaned. Cleaning up...`);
                await border0.deletePolicy(p.id).catch(e => logger.error('Failed to delete orphaned policy', { data: { error: e.message } }));
            }
        }
    }
    return sockets.length;
}

/**
 * POST /provision
 */
app.post('/provision', async (req: Request<{}, {}, ProvisionRequest>, res: Response) => {
    try {
        const { container_id, user_email, namespace } = req.body;
        const result = await performProvision(container_id, user_email, namespace, req.body);
        provisionCounter.inc({ outcome: 'success' });
        res.json(result);
    } catch (error: any) {
        provisionCounter.inc({ outcome: 'failure' });
        const errMsg = error.response?.data || error.message;
        logger.error(`Provisioning failed`, { category: 'provisioning', data: { error: errMsg } });
        res.status(500).json({ error: errMsg });
    }
});

/**
 * POST /deprovision
 */
app.post('/deprovision', async (req: Request<{}, {}, DeprovisionRequest>, res: Response) => {
    try {
        const { container_id } = req.body;
        const count = await performDeprovision(container_id);
        res.json({ status: 'success', deleted_count: count });
    } catch (error: any) {
        const errMsg = error.response?.data || error.message;
        logger.error(`Deprovisioning failed`, { category: 'provisioning', data: { error: errMsg } });
        res.status(500).json({ error: errMsg });
    }
});

/**
 * GET /health and /healthz
 * Health check endpoint for monitoring and K8s probes.
 */
app.get(['/health', '/healthz'], (req: Request, res: Response) => {
    res.json({ status: 'healthy', mode: DEPLOYMENT_MODE });
});

const PORT = process.env.PORT || 8000;

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
if (process.env.NODE_ENV !== 'test') {
    logger.info(`Initial maintenance scheduled in ${Math.round(initialDelay / 60000)} minutes.`);
    setTimeout(scheduleMaintenance, initialDelay);
}

// Optional Auto-Discovery / Auto-Provisioning
if (process.env.AUTO_PROVISION === 'true') {
    logger.info(`Auto-Provisioning mode enabled. Listening for ${DEPLOYMENT_MODE} events...`);
    discovery.startWatching(async (event) => {
        const { type, containerId, namespace } = event;
        try {
            if (type === 'start') {
                const info = await discovery.getContainerInfo(containerId, namespace);
                if (info?.labels['border0.io/enable'] === 'true') {
                    await performProvision(containerId, undefined, namespace);
                }
            } else if (type === 'stop') {
                await performDeprovision(containerId);
            }
        } catch (err: any) {
            logger.error('Auto-provisioning logic failed', { data: { error: err.message, containerId } });
        }
    });
}

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        logger.info(`Border0 Glue App running on port ${PORT}`, { data: { mode: DEPLOYMENT_MODE } });
        startObservabilityServer();
    });
}
