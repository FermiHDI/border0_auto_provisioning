import { Border0Client } from '../border0.js';
import nock from 'nock';
import { jest } from '@jest/globals';

describe('Border0Client', () => {
    let client: Border0Client;
    const baseUrl = 'https://api.border0.com/api/v1';

    beforeEach(() => {
        client = new Border0Client('test-token', 'coder');
        nock.cleanAll();
    });

    it('creates a vnc socket correctly', async () => {
        const scope = nock(baseUrl)
            .post('/sockets', {
                name: 'test-vnc',
                socket_type: 'vnc',
                connector_id: 'conn-1',
                upstream_type: 'proxy',
                upstream_host: '1.2.3.4',
                upstream_port: 5901
            })
            .reply(200, { id: 'sock-vnc', dnsname: 'vnc.border0.io' });

        const result = await client.createSocket('test-vnc', 'vnc', 'conn-1', '1.2.3.4', 5901);
        expect(result.id).toBe('sock-vnc');
        expect(scope.isDone()).toBe(true);
    });

    it('creates an ssh socket with certificate auth correctly', async () => {
        const scope = nock(baseUrl)
            .post('/sockets', {
                name: 'test-ssh',
                socket_type: 'ssh',
                connector_id: 'conn-1',
                upstream_type: 'proxy',
                upstream_host: '1.2.3.4',
                upstream_port: 22,
                ssh_authentication_type: 'border0_certificate',
                ssh_username: 'coder'
            })
            .reply(200, { id: 'sock-ssh', dnsname: 'ssh.border0.io' });

        const result = await client.createSocket('test-ssh', 'ssh', 'conn-1', '1.2.3.4', 22);
        expect(result.id).toBe('sock-ssh');
        expect(scope.isDone()).toBe(true);
    });

    it('reuses existing policy if it exists', async () => {
        const email = 'user@test.com';
        const policyName = 'user-policy-user-test-com';
        nock(baseUrl).get('/policies').reply(200, [{ id: 'existing-p-1', name: policyName }]);
        nock(baseUrl).put('/sockets/sock-1/policies', { policy_ids: ['existing-p-1'] }).reply(200, {});

        await client.attachPolicies('sock-1', email);
    });

    it('creates new policy if it does not exist (testing id)', async () => {
        const email = 'new-user@test.com';
        nock(baseUrl).get('/policies').reply(200, { policies: [] });
        nock(baseUrl).post('/policies').reply(201, { id: 'new-p-1' });
        nock(baseUrl).put('/sockets/sock-1/policies', { policy_ids: ['new-p-1'] }).reply(200, {});

        await client.attachPolicies('sock-1', email);
    });

    it('creates new policy if it does not exist (testing policy_id and direct array)', async () => {
        const email = 'other-user@test.com';
        nock(baseUrl).get('/policies').reply(200, []); // direct array
        nock(baseUrl).post('/policies').reply(201, { policy_id: 'new-p-2' });
        nock(baseUrl).put('/sockets/sock-1/policies', { policy_ids: ['new-p-2'] }).reply(200, {});

        await client.attachPolicies('sock-1', email);
    });

    it('handles personal policy creation failure gracefully', async () => {
        const email = 'ghost@test.com';
        nock(baseUrl).get('/policies').reply(200, []);
        nock(baseUrl).post('/policies').reply(403, { error: 'Not allowed' });
        // Only mgmt-1 should be attached if personal creation fails
        nock(baseUrl).put('/sockets/sock-1/policies', { policy_ids: ['mgmt-1'] }).reply(200, {});

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await client.attachPolicies('sock-1', email, ['mgmt-1']);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('handles generic errors gracefully', async () => {
        const email = 'msg@test.com';
        nock(baseUrl).get('/policies').reply(200, []);
        nock(baseUrl).post('/policies').replyWithError('Network failed');
        nock(baseUrl).put('/sockets/sock-1/policies', { policy_ids: [] }).reply(200, {});

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await client.attachPolicies('sock-1', email);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('does nothing if no policies to attach', async () => {
        await client.attachPolicies('sock-1', undefined, []);
        expect(nock.activeMocks()).toHaveLength(0);
    });

    it('handles missing data in findPolicyByName safely', async () => {
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');

        // Coverage for resp.data being null/undefined (axios can return this on certain mocks)
        axiosGetSpy.mockResolvedValueOnce({ data: undefined });
        expect(await client.findPolicyByName('any')).toBeNull();

        // Coverage for resp.data being a non-array, non-object thing
        axiosGetSpy.mockResolvedValueOnce({ data: "string" });
        expect(await client.findPolicyByName('any')).toBeNull();

        axiosGetSpy.mockRestore();
    });

    it('lists and filters sockets by name (multiple response formats)', async () => {
        // Test .list branch
        nock(baseUrl).get('/sockets').reply(200, { list: [{ id: '1', name: 'ssh-abc' }] });
        let res = await client.listSocketsByName('abc');
        expect(res).toHaveLength(1);

        // Test missing list/sockets key (empty object) branch
        nock(baseUrl).get('/sockets').reply(200, {});
        res = await client.listSocketsByName('abc');
        expect(res).toHaveLength(0);

        // Test resp.data being "falsy" (covered by empty object for now in nock context)
        nock(baseUrl).get('/sockets').reply(200); // 200 with no body
        res = await client.listSocketsByName('abc');
        expect(res).toHaveLength(0);

        // Test direct array branch
        nock(baseUrl).get('/sockets').reply(200, [{ id: '2', name: 'ssh-xyz' }]);
        res = await client.listSocketsByName('xyz');
        expect(res).toHaveLength(1);
    });

    it('deletes a socket', async () => {
        nock(baseUrl).delete('/sockets/sock-1').reply(200, {});
        await client.deleteSocket('sock-1');
    });

    it('finds a socket by exact name (multiple response formats)', async () => {
        // Test .sockets branch
        nock(baseUrl).get('/sockets').reply(200, { sockets: [{ name: 'exact-match', id: 'sock-1' }] });
        const socket = await client.findSocketByName('exact-match');
        expect(socket?.id).toBe('sock-1');

        nock(baseUrl).get('/sockets').reply(200, { list: [] });
        const missing = await client.findSocketByName('non-existent');
        expect(missing).toBeNull();

        // Testing no-body branch for findSocketByName
        nock(baseUrl).get('/sockets').reply(200, "");
        expect(await client.findSocketByName('any')).toBeNull();
    });

    it('updates a socket correctly', async () => {
        nock(baseUrl).put('/sockets/sock-1', { upstream_host: '5.6.7.8' }).reply(200, { id: 'sock-1' });
        const res = await client.updateSocket('sock-1', { upstream_host: '5.6.7.8' });
        expect(res.id).toBe('sock-1');
    });

    it('uses default ssh username if not provided', () => {
        const tempClient = new Border0Client('token');
        expect((tempClient as any).sshUsername).toBe('coder');
    });
});
