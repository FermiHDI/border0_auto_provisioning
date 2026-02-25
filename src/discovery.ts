import Docker from 'dockerode';
import * as k8s from '@kubernetes/client-node';

export interface DiscoveryInfo {
    ip: string;
    labels: Record<string, string>;
    email?: string;
}

export abstract class ContainerDiscovery {
    abstract getContainerInfo(container_id: string, namespace?: string): Promise<DiscoveryInfo | null>;
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
                email: labels['com.coder.user_email'] || labels['owner_email']
            };
        } catch (error) {
            console.error(`Error discovering Docker container ${container_id}:`, error);
            return null;
        }
    }
}

/**
 * Discovery implementation for Kubernetes environments.
 * Uses the K8s API to find pods and extract IP/annotations.
 */
export class K8sDiscovery extends ContainerDiscovery {
    private k8sApi: k8s.CoreV1Api;

    constructor() {
        super();
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
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
                email: pod.metadata?.labels?.['com.coder.user_email'] || pod.metadata?.annotations?.['com.coder.user_email']
            };
        } catch (error) {
            console.error(`Error discovering K8s pod ${container_id} in namespace ${namespace}:`, error);
            return null;
        }
    }
}
