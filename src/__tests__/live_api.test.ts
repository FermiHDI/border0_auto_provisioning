import { Border0Client } from '../border0.js';
import dotenv from 'dotenv';

// Load .env if present
dotenv.config();

const BORDER0_TOKEN = process.env.BORDER0_ADMIN_TOKEN || '';
const BORDER0_CONNECTOR_ID = process.env.BORDER0_CONNECTOR_ID || '';

/**
 * Live API Integration Test
 * This test runs ONLY if BORDER0_ADMIN_TOKEN and BORDER0_CONNECTOR_ID are present.
 * It verifies the actual API response formats and the singular resource pathing logic.
 */
describe('Border0 Live API Integration (Conditional)', () => {
    let client: Border0Client;
    const hasCreds = BORDER0_TOKEN !== '' && BORDER0_CONNECTOR_ID !== '';

    if (!hasCreds) {
        it('skipping live integration tests (missing BORDER0_ADMIN_TOKEN or BORDER0_CONNECTOR_ID)', () => {
            console.log('[SKIP] Live API tests skipped: No credentials found.');
        });
        return;
    }

    beforeAll(() => {
        client = new Border0Client(BORDER0_TOKEN, 'coder-test');
    });

    it('verifies the format of listed sockets', async () => {
        const sockets = await client.listSocketsByName('');
        expect(Array.isArray(sockets)).toBe(true);

        if (sockets.length > 0) {
            const s = sockets[0];
            // Ensure our normalization of socket_id -> id works
            expect(s.id).toBeDefined();
            expect(typeof s.id).toBe('string');
            // Border0 API actually returns socket_id
            expect(s.socket_id).toBeDefined();
            expect(s.id).toBe(s.socket_id);
        }
    });

    it('verifies the format of listed policies', async () => {
        const policies = await client.findPolicyByName('non-existent-policy-name-' + Date.now());
        expect(policies).toBeNull();

        // Check if we can find any policy
        // (Assuming at least one policy exists in a configured account)
        const allPolicies = await (client as any).client.get('/policies');
        const list = (client as any).extractList(allPolicies.data, ['list', 'policies']);

        if (list.length > 0) {
            const p = list[0];
            expect(p.id).toBeDefined();
            expect(typeof p.id).toBe('string');
        }
    });

    it('performs a full lifecycle of a temporary socket using singular paths', async () => {
        const socketName = `api-test-${Math.floor(Math.random() * 100000)}`;
        const upstreamHost = '127.0.0.1';
        const upstreamPort = 80;

        // 1. Create Socket (POST /socket)
        let socket: any;
        try {
            socket = await client.createSocket(socketName, 'http', BORDER0_CONNECTOR_ID, upstreamHost, upstreamPort);
        } catch (error: any) {
            const body = error.response?.data;
            console.error('[LIVE-TEST-ERROR] POST /socket Failed:', JSON.stringify(body));
            throw error;
        }
        expect(socket.id).toBeDefined();
        expect(socket.name).toBe(socketName);
        const socketId = socket.id;

        try {
            // 2. Update Socket (PUT /socket/:id)
            // This verifies our SINGULAR path fix (/socket vs /sockets)
            const updated = await client.updateSocket(socketId, { upstream_port: 8080 });
            expect(updated.id).toBe(socketId);

            // 3. Find Socket by name (GET /sockets + filter)
            const found = await client.findSocketByName(socketName);
            expect(found).not.toBeNull();
            expect(found?.id).toBe(socketId);

            // 4. Attach Policy (PUT /socket/:id/policy)
            // This verifies the singular path AND the newer 'actions' format
            const globalPolicyId = process.env.BORDER0_GLOBAL_POLICY_ID;
            if (globalPolicyId) {
                await client.attachPolicies(socketId, undefined, [globalPolicyId]);
            }

        } finally {
            // 5. Delete Socket (DELETE /socket/:id)
            await client.deleteSocket(socketId);

            // Verify deletion
            const deleted = await client.findSocketByName(socketName);
            expect(deleted).toBeNull();
        }
    });
});
