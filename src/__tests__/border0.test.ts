import { Border0Client } from '../border0.js';
import nock from 'nock';
import { jest } from '@jest/globals';

describe('Border0Client', () => {
    let client: Border0Client;
    const baseUrl = 'https://api.border0.com/api/v1';

    beforeEach(() => {
        client = new Border0Client('test-token');
        nock.cleanAll();
    });

    it('creates a socket correctly', async () => {
        const scope = nock(baseUrl)
            .post('/sockets')
            .reply(200, { id: 'sock-1', dnsname: 'test.border0.io' });

        const result = await client.createSocket('test-ssh', 'ssh', 'conn-1', '1.2.3.4', 22);
        expect(result.id).toBe('sock-1');
        expect(scope.isDone()).toBe(true);
    });

    it('reuses existing policy if it exists', async () => {
        const email = 'user@test.com';
        const policyName = 'user-policy-user-test-com';
        nock(baseUrl).get('/policies').reply(200, [{ id: 'existing-p-1', name: policyName }]);
        nock(baseUrl).put('/sockets/sock-1/policies', { policy_ids: ['existing-p-1'] }).reply(200, {});

        await client.attachPolicies('sock-1', email);
    });

    it('creates new policy if it does not exist and user exists', async () => {
        const email = 'new-user@test.com';
        nock(baseUrl).get('/policies').reply(200, { policies: [] });
        nock(baseUrl).get('/users').reply(200, { users: [{ email: email }] });
        nock(baseUrl).post('/policies').reply(201, { id: 'new-p-1' });
        nock(baseUrl).put('/sockets/sock-1/policies', { policy_ids: ['new-p-1'] }).reply(200, {});

        await client.attachPolicies('sock-1', email);
    });

    it('skips personal policy if user is not found', async () => {
        const email = 'ghost@test.com';
        nock(baseUrl).get('/policies').reply(200, []);
        nock(baseUrl).get('/users').reply(200, []);
        nock(baseUrl).put('/sockets/sock-1/policies', { policy_ids: ['mgmt-1'] }).reply(200, {});

        await client.attachPolicies('sock-1', email, ['mgmt-1']);
    });

    it('handles errors in verifyUserExists safely', async () => {
        const email = 'error@test.com';
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');
        axiosGetSpy.mockRejectedValue(new Error('Axios failure'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        const result = await client.verifyUserExists(email);
        expect(result).toBe(false);
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
        axiosGetSpy.mockRestore();
    });

    it('does nothing if no policies to attach', async () => {
        await client.attachPolicies('sock-1', undefined, []);
        expect(nock.activeMocks()).toHaveLength(0);
    });

    it('handles missing data in findPolicyByName safely', async () => {
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');
        axiosGetSpy.mockResolvedValue({ data: null });
        expect(await client.findPolicyByName('any')).toBeNull();
        axiosGetSpy.mockRestore();
    });

    it('handles missing data in verifyUserExists safely', async () => {
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');
        axiosGetSpy.mockResolvedValue({ data: undefined });
        expect(await client.verifyUserExists('any')).toBe(false);
        axiosGetSpy.mockRestore();
    });

    it('handles missing inner arrays safely', async () => {
        nock(baseUrl).get('/policies').reply(200, {});
        expect(await client.findPolicyByName('any')).toBeNull();

        nock(baseUrl).get('/users').reply(200, {});
        expect(await client.verifyUserExists('any')).toBe(false);
    });

    it('lists and filters sockets by name (inc empty logic)', async () => {
        nock(baseUrl).get('/sockets').reply(200, { sockets: [{ id: '1', name: 'ssh-abc' }] });
        const res = await client.listSocketsByName('abc');
        expect(res).toHaveLength(1);

        nock(baseUrl).get('/sockets').reply(200, {}); // Missing sockets key
        const res2 = await client.listSocketsByName('abc');
        expect(res2).toHaveLength(0);
    });

    it('deletes a socket', async () => {
        nock(baseUrl).delete('/sockets/sock-1').reply(200, {});
        await client.deleteSocket('sock-1');
    });

    it('identifies user in direct array return', async () => {
        nock(baseUrl).get('/users').reply(200, [{ email: 'one@test.com' }]);
        const res = await client.verifyUserExists('one@test.com');
        expect(res).toBe(true);
    });

    it('finds a socket by exact name', async () => {
        nock(baseUrl).get('/sockets').reply(200, { sockets: [{ name: 'exact-match', id: 'sock-1' }] });
        const socket = await client.findSocketByName('exact-match');
        expect(socket?.id).toBe('sock-1');

        nock(baseUrl).get('/sockets').reply(200, { sockets: [] });
        const missing = await client.findSocketByName('non-existent');
        expect(missing).toBeNull();

        // 100% Coverage: Handle branch where data is empty object
        nock(baseUrl).get('/sockets').reply(200, {});
        expect(await client.findSocketByName('any')).toBeNull();
    });

    it('updates a socket correctly', async () => {
        nock(baseUrl).put('/sockets/sock-1', { upstream_host: '5.6.7.8' }).reply(200, { id: 'sock-1' });
        const res = await client.updateSocket('sock-1', { upstream_host: '5.6.7.8' });
        expect(res.id).toBe('sock-1');
    });
});
