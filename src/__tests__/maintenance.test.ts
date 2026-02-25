import { Border0Client } from '../border0.js';
import nock from 'nock';
import { jest } from '@jest/globals';

describe('Border0Client Advanced GC & Maintenance', () => {
    let client: Border0Client;
    const baseUrl = 'https://api.border0.com/api/v1';

    beforeEach(() => {
        client = new Border0Client('test-token');
        nock.cleanAll();
    });

    it('deletes a policy correctly', async () => {
        const scope = nock(baseUrl).delete('/policies/p1').reply(200, {});
        await client.deletePolicy('p1');
        expect(scope.isDone()).toBe(true);
    });

    it('counts socket attachments for a policy correctly', async () => {
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');

        axiosGetSpy.mockResolvedValueOnce({ data: null });
        expect(await client.getSocketCountByPolicy('any')).toBe(0);

        axiosGetSpy.mockResolvedValueOnce({ data: { sockets: [] } });
        expect(await client.getSocketCountByPolicy('any')).toBe(0);

        axiosGetSpy.mockResolvedValueOnce({ data: {} });
        expect(await client.getSocketCountByPolicy('any')).toBe(0);

        axiosGetSpy.mockResolvedValueOnce({
            data: {
                sockets: [{ id: 's1', policies: [{ id: 'target-p' }] }]
            }
        });
        expect(await client.getSocketCountByPolicy('target-p')).toBe(1);

        axiosGetSpy.mockRestore();
    });

    it('removes policies if the user no longer exists in border0', async () => {
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');

        axiosGetSpy.mockResolvedValueOnce({ data: null });
        axiosGetSpy.mockResolvedValueOnce({ data: null });
        await client.performPolicyMaintenance();

        axiosGetSpy.mockResolvedValueOnce({ data: {} });
        axiosGetSpy.mockResolvedValueOnce({ data: {} });
        await client.performPolicyMaintenance();

        axiosGetSpy.mockResolvedValueOnce({
            data: [
                {
                    id: 'p-orphaned',
                    name: 'user-policy-dead-user',
                    policy_data: { condition: { who: { email: ['dead@test.com'] } } }
                },
                {
                    id: 'p-mgmt',
                    name: 'mgmt-policy'
                }
            ]
        });
        axiosGetSpy.mockResolvedValueOnce({ data: { users: [] } });

        const deleteScope = nock(baseUrl).delete('/policies/p-orphaned').reply(200, {});
        await client.performPolicyMaintenance();
        expect(deleteScope.isDone()).toBe(true);

        axiosGetSpy.mockRestore();
    });

    it('handles maintenance with weird policy data shapes', async () => {
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');

        axiosGetSpy.mockResolvedValueOnce({
            data: {
                policies: [
                    { name: 'user-policy-no-data', id: 'p1' },
                    { name: 'user-policy-no-emails', id: 'p2', policy_data: { condition: { who: {} } } },
                    { name: 'user-policy-no-who', id: 'p3', policy_data: { condition: {} } }
                ]
            }
        });
        axiosGetSpy.mockResolvedValueOnce({ data: [] });

        nock(baseUrl).delete('/policies/p1').reply(200, {});
        nock(baseUrl).delete('/policies/p2').reply(200, {});
        nock(baseUrl).delete('/policies/p3').reply(200, {});

        await client.performPolicyMaintenance();
        axiosGetSpy.mockRestore();
    });

    it('continues maintenance even if one user check fails', async () => {
        const axiosGetSpy = jest.spyOn((client as any).client, 'get');
        axiosGetSpy.mockResolvedValueOnce({ data: [{ name: 'user-policy-err', policy_data: {} }] });
        axiosGetSpy.mockRejectedValue(new Error('User list failed'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await client.performPolicyMaintenance();
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
        axiosGetSpy.mockRestore();
    });

    it('returns success and duration stats after maintenance', async () => {
        nock(baseUrl).get('/policies').reply(200, []);
        nock(baseUrl).get('/users').reply(200, []);

        const res = await client.performPolicyMaintenance();
        expect(res.success).toBe(true);
        expect(res.duration).toBeGreaterThanOrEqual(0);
    });
});
