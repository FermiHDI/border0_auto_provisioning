import { jest } from '@jest/globals';
import nock from 'nock';

// 1. Mock process.env BEFORE anything else
process.env.BORDER0_CONNECTOR_ID = 'conn-1';
process.env.AUTO_PROVISION = 'true';
process.env.DEPLOYMENT_MODE = 'docker';
process.env.NODE_ENV = 'test';

const mockDiscoveryInstance = {
    getContainerInfo: jest.fn(),
    startWatching: jest.fn()
};

const mockBorder0Instance = {
    findSocketByName: jest.fn(),
    updateSocket: jest.fn(),
    createSocket: jest.fn(),
    attachPolicies: jest.fn(),
    listSocketsByName: jest.fn(),
    deleteSocket: jest.fn(),
    getSocketCountByPolicy: jest.fn(),
    deletePolicy: jest.fn(),
    performPolicyMaintenance: jest.fn().mockImplementation(() => Promise.resolve({ success: true, duration: 100 }))
};

// 2. Mock modules using unstable_mockModule for ESM support
jest.unstable_mockModule('dotenv', () => ({
    config: jest.fn(),
    default: { config: jest.fn() }
}));

jest.unstable_mockModule('../discovery.js', () => ({
    DockerDiscovery: jest.fn().mockImplementation(() => mockDiscoveryInstance),
    K8sDiscovery: jest.fn().mockImplementation(() => mockDiscoveryInstance),
    ContainerDiscovery: class { }
}));

jest.unstable_mockModule('../border0.js', () => ({
    Border0Client: jest.fn().mockImplementation(() => mockBorder0Instance)
}));

jest.unstable_mockModule('../config.js', () => ({
    getSecret: (key: string) => (key === 'BORDER0_ADMIN_TOKEN' ? 'test-token' : 'test-id')
}));

// 3. Dynamic imports for modules that should use the mocks
import request from 'supertest';
const { app } = await import('../index.js');

describe('App API and Auto-Provisioning', () => {
    let autoWatcher: any;

    beforeAll(() => {
        // Capture the watcher passed to startWatching during init
        const calls = (mockDiscoveryInstance.startWatching as jest.Mock).mock.calls;
        if (calls.length > 0) {
            autoWatcher = calls[0][0];
        }
    });

    beforeEach(() => {
        nock.cleanAll();
        // Clear mocks but KEEP startWatching calls since they happen once at startup
        mockDiscoveryInstance.getContainerInfo.mockClear();
        mockBorder0Instance.createSocket.mockClear();
        mockBorder0Instance.findSocketByName.mockClear();
        mockBorder0Instance.listSocketsByName.mockClear();
        mockBorder0Instance.deleteSocket.mockClear();
    });

    it('provisions sockets via /provision endpoint', async () => {
        mockDiscoveryInstance.getContainerInfo.mockImplementation(() => Promise.resolve({
            ip: '1.2.3.4',
            labels: { 'border0.io/ssh_port': '2222' },
            email: 'user@test.com'
        }));
        mockBorder0Instance.findSocketByName.mockImplementation(() => Promise.resolve(null));
        mockBorder0Instance.createSocket.mockImplementation(() => Promise.resolve({ id: 's1', dnsname: 'ssh.io' }));
        mockBorder0Instance.attachPolicies.mockImplementation(() => Promise.resolve());

        const res = await request(app)
            .post('/provision')
            .send({ container_id: 'c12345678' });

        expect(res.status).toBe(200);
        expect(res.body.urls.ssh).toBe('ssh.io');
    });

    it('deprovisions sockets via /deprovision endpoint', async () => {
        mockBorder0Instance.listSocketsByName.mockImplementation(() => Promise.resolve([{ id: 's1', policies: [{ id: 'p1', name: 'user-policy-x' }] }]));
        mockBorder0Instance.getSocketCountByPolicy.mockImplementation(() => Promise.resolve(0));
        mockBorder0Instance.deleteSocket.mockImplementation(() => Promise.resolve());
        mockBorder0Instance.deletePolicy.mockImplementation(() => Promise.resolve());

        const res = await request(app)
            .post('/deprovision')
            .send({ container_id: 'c12345678' });

        expect(res.status).toBe(200);
        expect(res.body.deleted_count).toBe(1);
    });

    it('triggers auto-provisioning on discovery event', async () => {
        expect(autoWatcher).toBeDefined();

        mockDiscoveryInstance.getContainerInfo.mockImplementation(() => Promise.resolve({
            ip: '5.5.5.5',
            labels: { 'border0.io/enable': 'true', 'border0.io/email': 'auto@test.com' }
        }));
        mockBorder0Instance.findSocketByName.mockImplementation(() => Promise.resolve(null));
        mockBorder0Instance.createSocket.mockImplementation(() => Promise.resolve({ id: 's-auto', dnsname: 'auto.io' }));
        mockBorder0Instance.attachPolicies.mockImplementation(() => Promise.resolve());

        await autoWatcher({ type: 'start', containerId: 'c-auto' });
        expect(mockBorder0Instance.createSocket).toHaveBeenCalled();
    });

    it('triggers auto-deprovisioning on stop event', async () => {
        expect(autoWatcher).toBeDefined();
        mockBorder0Instance.listSocketsByName.mockImplementation(() => Promise.resolve([]));

        await autoWatcher({ type: 'stop', containerId: 'c-stop' });
        expect(mockBorder0Instance.listSocketsByName).toHaveBeenCalledWith('c-stop');
    });
});
