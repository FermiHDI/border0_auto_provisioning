import { Border0Client } from '../border0.js';
import nock from 'nock';
import { jest } from '@jest/globals';

describe('Border0Client Advanced Maintenance', () => {
    let client: Border0Client;
    const baseUrl = 'https://api.border0.com/api/v1';

    beforeEach(() => {
        client = new Border0Client('test-token', 'coder');
        nock.cleanAll();
    });

    it('deletes a policy correctly', async () => {
        const scope = nock(baseUrl).delete('/policy/p1').reply(200, {});
        await client.deletePolicy('p1');
        expect(scope.isDone()).toBe(true);
    });

    it('counts socket attachments for a policy correctly', async () => {
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');

        axiosGetSpy.mockResolvedValueOnce({ data: null });
        expect(await client.getSocketCountByPolicy('any')).toBe(0);

        axiosGetSpy.mockResolvedValueOnce({ data: { sockets: [] } });
        expect(await client.getSocketCountByPolicy('any')).toBe(0);

        // Branch coverage: socket with no policies key
        axiosGetSpy.mockResolvedValueOnce({
            data: {
                list: [{ id: 's1' }] // missing policies key
            }
        });
        expect(await client.getSocketCountByPolicy('any')).toBe(0);

        axiosGetSpy.mockResolvedValueOnce({
            data: {
                sockets: [{ id: 's1', policies: [{ id: 'target-p' }] }]
            }
        });
        expect(await client.getSocketCountByPolicy('target-p')).toBe(1);

        axiosGetSpy.mockRestore();
    });

    it('removes personal policies if they have 0 sockets attached (Direct Array branch)', async () => {
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');

        // Initial fetch of policies - Test direct array branch
        axiosGetSpy.mockResolvedValueOnce({
            data: [
                { id: 'p-orphan', name: 'user-policy-orphaned' },
                { id: 'p-active', name: 'user-policy-active' },
                { id: 'p-mgmt', name: 'mgmt-policy' }
            ]
        });

        // 1st getSocketCountByPolicy call (for p-orphan) -> returns 0
        axiosGetSpy.mockResolvedValueOnce({ data: { list: [] } });
        // 2nd getSocketCountByPolicy call (for p-active) -> returns 1
        axiosGetSpy.mockResolvedValueOnce({ data: { sockets: [{ policies: [{ id: 'p-active' }] }] } });

        const deleteScope = nock(baseUrl).delete('/policy/p-orphan').reply(200, {});

        await client.performPolicyMaintenance();

        expect(deleteScope.isDone()).toBe(true);
        axiosGetSpy.mockRestore();
    });

    it('handles maintenance with .policies key branch', async () => {
        nock(baseUrl).get('/policies').reply(200, { policies: [{ id: 'p1', name: 'user-policy-x' }] });
        // getSocketCountByPolicy call
        nock(baseUrl).get('/sockets').reply(200, { list: [] });
        nock(baseUrl).delete('/policy/p1').reply(200, {});

        await client.performPolicyMaintenance();
    });

    it('handles maintenance error safely', async () => {
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');
        axiosGetSpy.mockRejectedValue(new Error('API Down'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        const res = await client.performPolicyMaintenance();
        expect(res.success).toBe(false);
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
        axiosGetSpy.mockRestore();
    });

    it('returns success and duration stats after maintenance', async () => {
        nock(baseUrl).get('/policies').reply(200, []);
        const res = await client.performPolicyMaintenance();
        expect(res.success).toBe(true);
        expect(res.duration).toBeGreaterThanOrEqual(0);
    });
});
