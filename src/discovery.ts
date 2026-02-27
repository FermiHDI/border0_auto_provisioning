import Docker from 'dockerode';
import * as k8s from '@kubernetes/client-node';

export interface DiscoveryInfo {
    ip: string;
    labels: Record<string, string>;
    email?: string;
}

export interface DiscoveryEvent {
    type: 'start' | 'stop';
    containerId: string;
    namespace?: string;
}

export abstract class ContainerDiscovery {
    abstract getContainerInfo(container_id: string, namespace?: string): Promise<DiscoveryInfo | null>;
    abstract startWatching(callback: (event: DiscoveryEvent) => void): Promise<void>;
}

/**
 * Discovery implementation for Docker environments.
 * Interacts with the local Docker daemon to fetch container metadata.
 */
export class DockerDiscovery extends ContainerDiscovery {
    private docker: Docker;

    constructor() {
        super();
        this.docker = new Docker();
    }

    /**
     * Inspects a Docker container to retrieve its IP and labels.
     * 
     * @param {string} container_id - The ID or Name of the container.
     * @returns {Promise<DiscoveryInfo | null>} The discovery details or null if not found.
     */
    async getContainerInfo(container_id: string): Promise<DiscoveryInfo | null> {
        try {
            const container = this.docker.getContainer(container_id);
            const data = await container.inspect();

            const networks = data.NetworkSettings.Networks;
            const firstNetwork = Object.values(networks)[0] as any;
            const ip = firstNetwork?.IPAddress || '';
            const labels = data.Config.Labels || {};

            return {
                ip,
                labels,
                email: labels['border0.io/email'] || labels['com.coder.user_email'] || labels['owner_email']
            };
        } catch (error) {
            console.error(`Error discovering Docker container ${container_id}:`, error);
            return null;
        }
    }
    /**
     * Watches Docker events to detect container start/stop.
     */
    async startWatching(callback: (event: DiscoveryEvent) => void): Promise<void> {
        const stream = await this.docker.getEvents();
        stream.on('data', (chunk) => {
            const event = JSON.parse(chunk.toString());
            // Docker events: 'start' for new containers, 'die' for stop
            if (event.Status === 'start') {
                callback({ type: 'start', containerId: event.id });
            } else if (event.Status === 'die') {
                callback({ type: 'stop', containerId: event.id });
            }
        });
    }
}

/**
 * Discovery implementation for Kubernetes environments.
 * Uses the K8s API to find pods and extract IP/annotations.
 */
export class K8sDiscovery extends ContainerDiscovery {
    private k8sApi: k8s.CoreV1Api;

    private kubeConfig: k8s.KubeConfig;

    constructor() {
        super();
        this.kubeConfig = new k8s.KubeConfig();
        this.kubeConfig.loadFromDefault();
        this.k8sApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    }

    /**
     * Reads pod details from the K8s API.
     * 
     * @param {string} container_id - The name of the pod.
     * @param {string} [namespace='default'] - The namespace where the pod resides.
     * @returns {Promise<DiscoveryInfo | null>} The discovery details or null if not found.
     */
    async getContainerInfo(container_id: string, namespace: string = 'default'): Promise<DiscoveryInfo | null> {
        try {
            const res = await (this.k8sApi as any).readNamespacedPod(container_id, namespace);
            const pod = res.body;

            return {
                ip: pod.status?.podIP || '',
                labels: pod.metadata?.labels || {},
                email: pod.metadata?.labels?.['border0.io/email'] ||
                    pod.metadata?.annotations?.['border0.io/email'] ||
                    pod.metadata?.labels?.['com.coder.user_email'] ||
                    pod.metadata?.annotations?.['com.coder.user_email']
            };
        } catch (error) {
            console.error(`Error discovering K8s pod ${container_id} in namespace ${namespace}:`, error);
            return null;
        }
    }

    /**
     * Watches Kubernetes Pod events to detect creation/deletion.
     */
    async startWatching(callback: (event: DiscoveryEvent) => void): Promise<void> {
        const watch = new k8s.Watch(this.kubeConfig);
        watch.watch(
            '/api/v1/pods',
            { labelSelector: 'border0.io/enable=true' },
            (type, obj) => {
                const pod = obj as k8s.V1Pod;
                const name = pod.metadata?.name;
                const ns = pod.metadata?.namespace;

                if (!name) return;

                if (type === 'ADDED' || (type === 'MODIFIED')) {
                    // Only trigger 'start' if we have an IP and the pod is running
                    if (pod.status?.podIP && pod.status?.phase === 'Running') {
                        callback({ type: 'start', containerId: name, namespace: ns });
                    }
                } else if (type === 'DELETED') {
                    callback({ type: 'stop', containerId: name, namespace: ns });
                }
            },
            (err) => {
                if (err) console.error('K8s Watch Error:', err);
            }
        ).catch(err => {
            console.error('K8s Watch Startup Error:', err);
        });
    }
}
