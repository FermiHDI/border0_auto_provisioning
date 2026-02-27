import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// 1. Setup ESM mocks using unstable_mockModule before any other imports
// This is required for experimental-vm-modules to mock cross-module ESM imports.
jest.unstable_mockModule('@kubernetes/client-node', () => ({
    KubeConfig: jest.fn().mockImplementation(() => ({
        loadFromDefault: jest.fn(),
        makeApiClient: jest.fn()
    })),
    Watch: jest.fn()
}));

jest.unstable_mockModule('dockerode', () => {
    const mockContainer = {
        inspect: jest.fn()
    };
    const mockDocker = jest.fn().mockImplementation(() => {
        const inst = {
            getContainer: jest.fn().mockReturnValue(mockContainer),
            getEvents: jest.fn().mockImplementation(() => Promise.resolve(new EventEmitter()))
        };
        return inst;
    });
    (mockDocker as any).prototype = { getContainer: jest.fn() }; // dummy for instanceof
    return {
        default: mockDocker
    };
});

// 2. Import the modules that will use the mocks
// We use dynamic imports because the mocks must be registered first in the ESM lifecycle.
const k8s: any = await import('@kubernetes/client-node');
const Docker: any = (await import('dockerode')).default;
const { DockerDiscovery, K8sDiscovery } = await import('../discovery.js');

describe('Discovery Engines', () => {

    describe('DockerDiscovery', () => {
        let discovery: any;
        let mockDockerInstance: any;

        beforeEach(() => {
            (Docker as any).mockClear();
            discovery = new DockerDiscovery();
            // Capture the instance from the last (most recent) mock constructor call
            const calls = (Docker as any).mock.results;
            mockDockerInstance = calls[calls.length - 1].value;
        });

        it('returns container info correctly', async () => {
            const mockContainer = mockDockerInstance.getContainer();
            mockContainer.inspect.mockResolvedValue({
                NetworkSettings: {
                    Networks: { bridge: { IPAddress: '172.17.0.2' } }
                },
                Config: {
                    Labels: { 'com.coder.user_email': 'docker@test.com' }
                }
            });

            const info = await discovery.getContainerInfo('test-id');
            expect(info?.ip).toBe('172.17.0.2');
            expect(info?.email).toBe('docker@test.com');
        });

        it('watches docker events', async () => {
            const mockStream = new EventEmitter();
            mockDockerInstance.getEvents.mockImplementation(() => Promise.resolve(mockStream));

            const events: any[] = [];
            await discovery.startWatching((e: any) => events.push(e));

            mockStream.emit('data', Buffer.from(JSON.stringify({ Status: 'start', id: 'c1' })));
            mockStream.emit('data', Buffer.from(JSON.stringify({ Status: 'die', id: 'c1' })));

            expect(events).toHaveLength(2);
            expect(events[0]).toEqual({ type: 'start', containerId: 'c1' });
            expect(events[1]).toEqual({ type: 'stop', containerId: 'c1' });
        });
    });

    describe('K8sDiscovery', () => {
        let discovery: any;
        let mockK8sApi: any;

        beforeEach(() => {
            mockK8sApi = {
                readNamespacedPod: jest.fn()
            };
            k8s.KubeConfig.mockImplementation(() => ({
                loadFromDefault: jest.fn(),
                makeApiClient: jest.fn().mockReturnValue(mockK8sApi)
            }));
            discovery = new K8sDiscovery();
        });

        it('returns pod info correctly from labels', async () => {
            mockK8sApi.readNamespacedPod.mockResolvedValue({
                body: {
                    status: { podIP: '10.0.0.1' },
                    metadata: {
                        labels: { 'com.coder.user_email': 'k8s@test.com' }
                    }
                }
            });

            const info = await discovery.getContainerInfo('pod-id', 'ns');
            expect(info?.ip).toBe('10.0.0.1');
            expect(info?.email).toBe('k8s@test.com');
        });

        it('watches k8s pod events', async () => {
            const mockWatchInstance = {
                watch: jest.fn().mockImplementation(((_p: string, _o: any, cb: any, _e: any) => {
                    cb('ADDED', {
                        metadata: { name: 'p1', namespace: 'ns1' },
                        status: { podIP: '1.1.1.1', phase: 'Running' }
                    });
                    cb('DELETED', {
                        metadata: { name: 'p1', namespace: 'ns1' }
                    });
                    return Promise.resolve();
                }) as any)
            };
            k8s.Watch.mockImplementation(() => mockWatchInstance);

            const events: any[] = [];
            await discovery.startWatching((e: any) => events.push(e));

            expect(events).toHaveLength(2);
            expect(events[0].type).toBe('start');
            expect(events[1].type).toBe('stop');
        });
    });
});
