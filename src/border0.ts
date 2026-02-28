import axios, { type AxiosInstance } from 'axios';

/**
 * Client for interacting with the Border0 API.
 * Aligned with the official Go SDK (border0-go) patterns and structures.
 */
export class Border0Client {
    private sshUsername: string;
    private client: AxiosInstance;

    /**
     * @param {string} token - The Border0 administration token.
     * @param {string} sshUsername - The default SSH username for SSH sockets (defaults to "coder").
     */
    constructor(token: string, sshUsername: string = 'coder') {
        this.client = axios.create({
            baseURL: 'https://api.border0.com/api/v1',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        this.sshUsername = sshUsername;
    }

    /**
     * Helper to extract a list of items from various Border0 API response shapes.
     * @private
     */
    private extractList(data: any, keys: string[]): any[] {
        if (!data) return [];
        let list: any[] = [];
        for (const key of keys) {
            if (data[key]) {
                list = data[key];
                break;
            }
        }
        if (list.length === 0 && Array.isArray(data)) {
            list = data;
        }

        return list.map(item => {
            if (item && typeof item === 'object' && !item.id) {
                // Border0 API uses socket_id / policy_id in some responses and id in others
                item.id = item.id || item.socket_id || item.policy_id;
            }
            return item;
        });
    }

    /**
     * Builds the upstream configuration object based on the socket type.
     * Aligned with border0-go/types/service/configuration.go
     * @private
     */
    private buildUpstreamConfig(socket_type: string, host: string, port: number) {
        const config: any = { service_type: socket_type };

        switch (socket_type) {
            case 'ssh':
                config.ssh_service_configuration = {
                    ssh_service_type: 'standard',
                    standard_ssh_service_configuration: {
                        hostname: host,
                        port: port,
                        ssh_authentication_type: 'border0_certificate',
                        border0_certificate_auth_configuration: {
                            username_provider: 'defined',
                            username: this.sshUsername
                        }
                    }
                };
                break;
            case 'vnc':
                config.vnc_service_configuration = { hostname: host, port: port };
                break;
            case 'http':
                config.http_service_configuration = {
                    http_service_type: 'standard',
                    standard_http_service_configuration: {
                        hostname: host,
                        port: port,
                        scheme: 'http',
                        host_header: host
                    }
                };
                break;
            case 'rdp':
                config.rdp_service_configuration = { hostname: host, port: port };
                break;
            case 'database':
                config.database_service_configuration = {
                    protocol: 'tcp', // Simplified, actual protocol might vary
                    hostname: host,
                    port: port
                };
                break;
        }
        return config;
    }

    /**
     * Creates a new socket using the modern UpstreamConfig structure.
     * 
     * @param {string} name - The name of the socket.
     * @param {string} socket_type - The type of socket (ssh, vnc, http, rdp, database).
     * @param {string} connector_id - The ID of the connector to attach to.
     * @param {string} upstream_host - The internal IP/host of the target.
     * @param {number} upstream_port - The port on the target.
     * @param {Record<string, string>} [tags] - Optional tags.
     * @returns {Promise<any>} The created socket details.
     */
    async createSocket(name: string, socket_type: string, connector_id: string, upstream_host: string, upstream_port: number, tags: Record<string, string> = {}) {
        const payload: any = {
            name,
            socket_type,
            connector_ids: [connector_id],
            upstream_type: (socket_type === 'http') ? 'http' : 'proxy',
            upstream_configuration: this.buildUpstreamConfig(socket_type, upstream_host, upstream_port),
            tags
        };

        const resp = await this.client.post('/socket', payload);
        const data = resp.data;
        if (data && !data.id && data.socket_id) {
            data.id = data.socket_id;
        }
        return data;
    }

    /**
     * Deletes a socket by ID.
     */
    async deleteSocket(socket_id: string) {
        if (!socket_id) throw new Error('socket_id is required');
        await this.client.delete(`/socket/${socket_id}`);
    }

    /**
     * Lists sockets filtered by name using API-side filtering.
     * 
     * @param {string} name - The name pattern to search for.
     * @returns {Promise<any[]>} List of matching sockets.
     */
    async listSocketsByName(name: string) {
        // Use name query parameter as seen in border0-go/client/socket.go
        const resp = await this.client.get('/sockets', { params: { name } });
        return this.extractList(resp.data, ['list', 'sockets']);
    }

    /**
     * Finds a socket by its exact name.
     */
    async findSocketByName(name: string): Promise<any | null> {
        const list = await this.listSocketsByName(name);
        return list.find((s: any) => s.name === name) || null;
    }

    /**
     * Updates an existing socket's configuration.
     * 
     * @param {string} socket_id - The ID of the socket to update.
     * @param {object} payload - The fields to update.
     * @returns {Promise<any>} The updated socket details.
     */
    async updateSocket(socket_id: string, payload: any) {
        if (!socket_id) throw new Error('socket_id is required');

        // If updating upstream details, wrap them in upstream_configuration if type is present
        if (payload.upstream_host && payload.upstream_port && payload.socket_type) {
            payload.upstream_configuration = this.buildUpstreamConfig(payload.socket_type, payload.upstream_host, payload.upstream_port);
            delete payload.upstream_host;
            delete payload.upstream_port;
            delete payload.socket_type;
        }

        const resp = await this.client.put(`/socket/${socket_id}`, payload);
        const data = resp.data;
        if (data && !data.id && data.socket_id) {
            data.id = data.socket_id;
        }
        return data;
    }

    /**
     * Finds an existing policy by its exact name.
     */
    async findPolicyByName(name: string): Promise<any | null> {
        // Go SDK uses /policies/find?name= for single policy lookup
        try {
            const resp = await this.client.get('/policies/find', { params: { name } });
            const data = resp.data;
            if (data && !data.id && data.policy_id) data.id = data.policy_id;
            return data;
        } catch (error: any) {
            if (error.response?.status === 404) return null;
            throw error;
        }
    }

    /**
     * Deletes a policy by its unique ID.
     */
    async deletePolicy(policy_id: string) {
        if (!policy_id) throw new Error('policy_id is required');
        await this.client.delete(`/policy/${policy_id}`);
    }

    /**
     * Counts how many sockets are currently using a specific policy.
     * Optimized to use the socket_ids field in the policy object.
     */
    async getSocketCountByPolicy(policy_id: string): Promise<number> {
        try {
            const resp = await this.client.get(`/policy/${policy_id}`);
            return resp.data.socket_ids?.length || 0;
        } catch (error: any) {
            if (error.response?.status === 404) return 0;
            throw error;
        }
    }

    /**
     * Performs a background maintenance check.
     */
    async performPolicyMaintenance(): Promise<{ success: boolean, duration: number }> {
        console.log('[Border0] Starting background policy maintenance...');
        const start = Date.now();
        try {
            const resp = await this.client.get('/policies');
            const list = this.extractList(resp.data, ['list', 'policies']);

            for (const policy of list) {
                if (policy.name.startsWith('user-policy-')) {
                    // socket_ids is typically returned in the policy list
                    const attachmentCount = policy.socket_ids?.length ?? (await this.getSocketCountByPolicy(policy.id));
                    if (attachmentCount === 0) {
                        console.log(`[Border0] Personal policy ${policy.name} is orphaned. Cleaning up...`);
                        await this.deletePolicy(policy.id);
                    }
                }
            }
            return { success: true, duration: Date.now() - start };
        } catch (error) {
            console.error('[Border0] Error during policy maintenance:', error);
            return { success: false, duration: Date.now() - start };
        }
    }

    /**
     * Attaches policies to a socket.
     * Aligned with border0-go/client/policy.go AttachPoliciesToSocket
     */
    async attachPolicies(socket_id: string, user_email?: string, predefined_policy_ids: string[] = []) {
        const policyIds = [...predefined_policy_ids];

        if (user_email) {
            const sanitizedEmail = user_email.replace(/[^a-zA-Z0-9]/g, '-');
            const policy_name = `user-policy-${sanitizedEmail}`;

            let existingPolicy = await this.findPolicyByName(policy_name);

            if (!existingPolicy) {
                try {
                    const policy_data = {
                        name: policy_name,
                        policy_data: {
                            version: 'v1',
                            action: ['database', 'ssh', 'http', 'tls', 'vnc', 'rdp', 'kubernetes'],
                            condition: {
                                who: { email: [user_email] }
                            }
                        }
                    };
                    const p_resp = await this.client.post('/policies', policy_data);
                    policyIds.push(p_resp.data.id || p_resp.data.policy_id);
                } catch (error: any) {
                    console.error(`[Border0] Failed to create policy ${policy_name} for ${user_email}:`, error.response?.data || error.message);
                }
            } else {
                policyIds.push(existingPolicy.id);
            }
        }

        if (policyIds.length > 0) {
            // Field name in JSON is 'id' for PolicySocketAttachment as per Go SDK 'json:"id"'
            const actions = policyIds.map(id => ({ action: 'add', id: id }));
            await this.client.put(`/socket/${socket_id}/policy`, { actions });
        }
    }
}

