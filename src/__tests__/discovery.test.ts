import { DockerDiscovery, K8sDiscovery } from '../discovery.js';
import Docker from 'dockerode';
import * as k8s from '@kubernetes/client-node';
import { jest } from '@jest/globals';

jest.mock('dockerode');
jest.mock('@kubernetes/client-node');

describe('Discovery Engines', () => {

    describe('DockerDiscovery', () => {
        let discovery: DockerDiscovery;
        let mockContainer: any;

        beforeEach(() => {
            mockContainer = {
                inspect: jest.fn()
            };
            // Mock constructor logic that actually works in ESM
            (Docker as any).prototype.getContainer = jest.fn().mockReturnValue(mockContainer);
            discovery = new DockerDiscovery();
        });

        it('returns container info correctly', async () => {
            mockContainer.inspect.mockResolvedValue({
                NetworkSettings: {
                    Networks: {
                        bridge: { IPAddress: '172.17.0.2' }
                    }
                },
                Config: {
                    Labels: {
                        'com.coder.user_email': 'docker@test.com'
                    }
                }
            });

            const info = await discovery.getContainerInfo('test-id');
            expect(info?.ip).toBe('172.17.0.2');
            expect(info?.email).toBe('docker@test.com');
        });

        it('handles missing network or labels safely', async () => {
            mockContainer.inspect.mockResolvedValue({
                NetworkSettings: { Networks: {} },
                Config: {}
            });

            const info = await discovery.getContainerInfo('test-id');
            expect(info?.ip).toBe('');
            expect(info?.labels).toEqual({});
        });

        it('returns null on docker error', async () => {
            mockContainer.inspect.mockRejectedValue(new Error('Docker error'));
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            const info = await discovery.getContainerInfo('bad-id');
            expect(info).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('K8sDiscovery', () => {
        let discovery: K8sDiscovery;
        let mockK8sApi: any;

        beforeEach(() => {
            mockK8sApi = {
                readNamespacedPod: jest.fn()
            };
            (k8s.KubeConfig as any).prototype.loadFromDefault = jest.fn();
            (k8s.KubeConfig as any).prototype.makeApiClient = jest.fn().mockReturnValue(mockK8sApi);
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

        it('returns pod info from annotations if label is missing', async () => {
            mockK8sApi.readNamespacedPod.mockResolvedValue({
                body: {
                    status: { podIP: '10.0.0.2' },
                    metadata: {
                        labels: {},
                        annotations: { 'com.coder.user_email': 'anno@test.com' }
                    }
                }
            });

            const info = await discovery.getContainerInfo('pod-id');
            expect(info?.email).toBe('anno@test.com');
        });

        it('returns pod info with empty defaults if metadata is missing', async () => {
            mockK8sApi.readNamespacedPod.mockResolvedValue({
                body: {
                    status: {},
                    metadata: {}
                }
            });

            const info = await discovery.getContainerInfo('pod-id');
            expect(info?.ip).toBe('');
            expect(info?.email).toBeUndefined();
        });

        it('returns null on k8s error', async () => {
            mockK8sApi.readNamespacedPod.mockRejectedValue(new Error('K8s error'));
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            const info = await discovery.getContainerInfo('bad-pod');
            expect(info).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
});
