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
            .post('/socket', {
                name: 'test-vnc',
                socket_type: 'vnc',
                connector_ids: ['conn-1'],
                upstream_type: 'proxy',
                upstream_configuration: {
                    service_type: 'vnc',
                    vnc_service_configuration: {
                        hostname: '1.2.3.4',
                        port: 5901
                    }
                },
                tags: {}
            })
            .reply(200, { id: 'sock-vnc', dnsname: 'vnc.border0.io' });

        const result = await client.createSocket('test-vnc', 'vnc', 'conn-1', '1.2.3.4', 5901);
        expect(result.id).toBe('sock-vnc');
        expect(scope.isDone()).toBe(true);
    });

    it('creates a socket and normalizes socket_id to id', async () => {
        nock(baseUrl)
            .post('/socket')
            .reply(200, { socket_id: 'sock-123', dnsname: 'test.border0.io' });

        const result = await client.createSocket('test', 'http', 'conn-1', '1.2.3.4', 80);
        expect(result.id).toBe('sock-123');
    });

    it('creates a socket with tags correctly', async () => {
        const scope = nock(baseUrl)
            .post('/socket', {
                name: 'test-tags',
                socket_type: 'http',
                connector_ids: ['conn-1'],
                upstream_type: 'http',
                upstream_configuration: {
                    service_type: 'http',
                    http_service_configuration: {
                        http_service_type: 'standard',
                        standard_http_service_configuration: {
                            hostname: '1.2.3.4',
                            port: 80,
                            scheme: 'http',
                            host_header: '1.2.3.4'
                        }
                    }
                },
                tags: { env: 'prod', team: 'infra' }
            })
            .reply(200, { id: 'sock-tags', dnsname: 'tags.border0.io' });

        const result = await client.createSocket('test-tags', 'http', 'conn-1', '1.2.3.4', 80, { env: 'prod', team: 'infra' });
        expect(result.id).toBe('sock-tags');
        expect(scope.isDone()).toBe(true);
    });

    it('creates an ssh socket with certificate auth correctly', async () => {
        const scope = nock(baseUrl)
            .post('/socket', {
                name: 'test-ssh',
                socket_type: 'ssh',
                connector_ids: ['conn-1'],
                upstream_type: 'proxy',
                upstream_configuration: {
                    service_type: 'ssh',
                    ssh_service_configuration: {
                        ssh_service_type: 'standard',
                        standard_ssh_service_configuration: {
                            hostname: '1.2.3.4',
                            port: 22,
                            ssh_authentication_type: 'border0_certificate',
                            border0_certificate_auth_configuration: {
                                username_provider: 'defined',
                                username: 'coder'
                            }
                        }
                    }
                },
                tags: {}
            })
            .reply(200, { id: 'sock-ssh', dnsname: 'ssh.border0.io' });

        const result = await client.createSocket('test-ssh', 'ssh', 'conn-1', '1.2.3.4', 22);
        expect(result.id).toBe('sock-ssh');
        expect(scope.isDone()).toBe(true);
    });

    it('reuses existing policy if it exists', async () => {
        const email = 'user@test.com';
        const policyName = 'user-policy-user-test-com';
        nock(baseUrl)
            .get('/policies/find')
            .query({ name: policyName })
            .reply(200, { id: 'existing-p-1', name: policyName });

        nock(baseUrl).put('/socket/sock-1/policy', {
            actions: [{ action: 'add', id: 'existing-p-1' }]
        }).reply(200, {});

        await client.attachPolicies('sock-1', email);
    });

    it('creates new policy if it does not exist', async () => {
        const email = 'new-user@test.com';
        const policyName = 'user-policy-new-user-test-com';
        nock(baseUrl)
            .get('/policies/find')
            .query({ name: policyName })
            .reply(404);

        nock(baseUrl).post('/policies').reply(201, { id: 'new-p-1' });
        nock(baseUrl).put('/socket/sock-1/policy', {
            actions: [{ action: 'add', id: 'new-p-1' }]
        }).reply(200, {});

        await client.attachPolicies('sock-1', email);
    });

    it('handles personal policy creation failure gracefully', async () => {
        const email = 'ghost@test.com';
        nock(baseUrl).get('/policies/find').query(true).reply(404);
        nock(baseUrl).post('/policies').reply(403, { error: 'Not allowed' });
        nock(baseUrl).put('/socket/sock-1/policy', {
            actions: [{ action: 'add', id: 'mgmt-1' }]
        }).reply(200, {});

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        await client.attachPolicies('sock-1', email, ['mgmt-1']);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('handles missing data in findPolicyByName safely', async () => {
        nock(baseUrl).get('/policies/find').query({ name: 'any' }).reply(404);
        expect(await client.findPolicyByName('any')).toBeNull();
    });

    it('lists and filters sockets by name using query params', async () => {
        const scope = nock(baseUrl)
            .get('/sockets')
            .query({ name: 'abc' })
            .reply(200, { list: [{ id: '1', name: 'ssh-abc' }] });

        let res = await client.listSocketsByName('abc');
        expect(res).toHaveLength(1);
        expect(scope.isDone()).toBe(true);
    });

    it('deletes a socket', async () => {
        nock(baseUrl).delete('/socket/sock-1').reply(200, {});
        await client.deleteSocket('sock-1');
    });

    it('finds a socket by exact name', async () => {
        nock(baseUrl)
            .get('/sockets')
            .query({ name: 'exact-match' })
            .reply(200, { sockets: [{ name: 'exact-match', id: 'sock-1' }] });

        const socket = await client.findSocketByName('exact-match');
        expect(socket?.id).toBe('sock-1');
    });

    it('updates a socket with upstream config correctly', async () => {
        const scope = nock(baseUrl)
            .put('/socket/sock-1', {
                upstream_configuration: {
                    service_type: 'http',
                    http_service_configuration: {
                        http_service_type: 'standard',
                        standard_http_service_configuration: {
                            hostname: '5.6.7.8',
                            port: 80,
                            scheme: 'http',
                            host_header: '5.6.7.8'
                        }
                    }
                }
            })
            .reply(200, { id: 'sock-1' });

        const res = await client.updateSocket('sock-1', {
            upstream_host: '5.6.7.8',
            upstream_port: 80,
            socket_type: 'http'
        });
        expect(res.id).toBe('sock-1');
        expect(scope.isDone()).toBe(true);
    });

    it('getSocketCountByPolicy uses dedicated endpoint', async () => {
        nock(baseUrl)
            .get('/policy/p1')
            .reply(200, { id: 'p1', socket_ids: ['s1', 's2'] });

        const count = await client.getSocketCountByPolicy('p1');
        expect(count).toBe(2);
    });

    it('performPolicyMaintenance is efficient', async () => {
        nock(baseUrl)
            .get('/policies')
            .reply(200, [
                { id: 'p1', name: 'user-policy-a', socket_ids: ['s1'] },
                { id: 'p2', name: 'user-policy-b', socket_ids: [] }
            ]);

        const deleteScope = nock(baseUrl)
            .delete('/policy/p2')
            .reply(200);

        const stats = await client.performPolicyMaintenance();
        expect(stats.success).toBe(true);
        expect(deleteScope.isDone()).toBe(true);
    });
});
