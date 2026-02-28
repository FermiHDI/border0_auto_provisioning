import axios, { type AxiosInstance } from 'axios';

/**
 * Client for interacting with the Border0 API.
 * Follows Google-style documentation standards for FermiHDI.
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
                item.id = item.socket_id || item.policy_id;
            }
            return item;
        });
    }

    /**
     * Creates a new socket (SSH or VNC).
     * 
     * @param {string} name - The name of the socket.
     * @param {string} socket_type - The type of socket (ssh, vnc, http).
     * @param {string} connector_id - The ID of the connector to attach to.
     * @param {string} upstream_host - The internal IP/host of the target container.
     * @param {number} upstream_port - The port on the target container.
     * @returns {Promise<any>} The created socket details.
     */
    async createSocket(name: string, socket_type: string, connector_id: string, upstream_host: string, upstream_port: number) {
        const payload: any = {
            name,
            socket_type,
            connector_id,
            upstream_type: (socket_type === 'http') ? 'http' : 'proxy',
            upstream_host,
            upstream_port
        };

        // Standardized SSH Configuration for FermiHDI
        if (socket_type === 'ssh') {
            payload.ssh_authentication_type = 'border0_certificate';
            payload.ssh_username = this.sshUsername;
        }

        const resp = await this.client.post('/socket', payload);
        const data = resp.data;
        if (data && !data.id && data.socket_id) {
            data.id = data.socket_id;
        }
        return data;
    }

    /**
     * Deletes a socket by ID.
     * 
     * @param {string} socket_id - The unique ID of the socket.
     */
    async deleteSocket(socket_id: string) {
        if (!socket_id) throw new Error('socket_id is required for deleteSocket');
        await this.client.delete(`/socket/${socket_id}`);
    }

    /**
     * Lists sockets filtered by name.
     * 
     * @param {string} namePattern - The string to search for in socket names.
     * @returns {Promise<any[]>} List of matching sockets.
     */
    async listSocketsByName(namePattern: string) {
        const resp = await this.client.get('/sockets');
        const list = this.extractList(resp.data, ['list', 'sockets']);
        return list.filter((s: any) => s.name.includes(namePattern));
    }

    /**
     * Finds a socket by its exact name.
     * 
     * @param {string} name - The exact name of the socket.
     * @returns {Promise<any | null>} The socket details or null.
     */
    async findSocketByName(name: string): Promise<any | null> {
        const resp = await this.client.get('/sockets');
        const list = this.extractList(resp.data, ['list', 'sockets']);
        return list.find((s: any) => s.name === name) || null;
    }

    /**
     * Updates an existing socket's configuration (e.g. upstream host).
     * 
     * @param {string} socket_id - The ID of the socket to update.
     * @param {object} payload - The fields to update.
     * @returns {Promise<any>} The updated socket details.
     */
    async updateSocket(socket_id: string, payload: any) {
        if (!socket_id) throw new Error('socket_id is required for updateSocket');
        const resp = await this.client.put(`/socket/${socket_id}`, payload);
        const data = resp.data;
        if (data && !data.id && data.socket_id) {
            data.id = data.socket_id;
        }
        return data;
    }

    /**
     * Finds an existing policy by its exact name.
     * 
     * @param {string} name - The name of the policy to find.
     * @returns {Promise<any | null>} The policy object or null.
     */
    async findPolicyByName(name: string): Promise<any | null> {
        const resp = await this.client.get('/policies');
        const list = this.extractList(resp.data, ['list', 'policies']);
        return list.find((p: any) => p.name === name) || null;
    }



    /**
     * Deletes a policy by its unique ID.
     * 
     * @param {string} policy_id - The ID of the policy to delete.
     */
    async deletePolicy(policy_id: string) {
        if (!policy_id) throw new Error('policy_id is required for deletePolicy');
        await this.client.delete(`/policy/${policy_id}`);
    }

    /**
     * Counts how many sockets are currently using a specific policy.
     * 
     * @param {string} policy_id - The ID of the policy to check.
     * @returns {Promise<number>} Number of attached sockets.
     */
    async getSocketCountByPolicy(policy_id: string): Promise<number> {
        const resp = await this.client.get('/sockets');
        const list = this.extractList(resp.data, ['list', 'sockets']);

        // Count sockets that have this policy_id in their policies array
        return list.filter((s: any) =>
            s.policies && s.policies.some((p: any) => p.id === policy_id)
        ).length;
    }

    /**
     * Performs a background maintenance check.
     * Deletes personal policies if they are no longer attached to any sockets.
     * 
     * @returns {Promise<{success: boolean, duration: number}>} Stats about the run.
     */
    async performPolicyMaintenance(): Promise<{ success: boolean, duration: number }> {
        console.log('[FermiHDI] Starting background policy maintenance...');
        const start = Date.now();
        try {
            const resp = await this.client.get('/policies');
            const list = this.extractList(resp.data, ['list', 'policies']);

            for (const policy of list) {
                // Garbage collect orphaned personal policies (those with 0 sockets attached)
                if (policy.name.startsWith('user-policy-')) {
                    const attachmentCount = await this.getSocketCountByPolicy(policy.id);
                    if (attachmentCount === 0) {
                        console.log(`[FermiHDI] Personal policy ${policy.name} is orphaned. Cleaning up...`);
                        await this.deletePolicy(policy.id);
                    }
                }
            }
            return { success: true, duration: Date.now() - start };
        } catch (error) {
            console.error('[FermiHDI] Error during policy maintenance:', error);
            return { success: false, duration: Date.now() - start };
        }
    }

    async attachPolicies(socket_id: string, user_email?: string, predefined_policy_ids: string[] = []) {
        const policyIds = [...predefined_policy_ids];

        if (user_email) {
            const sanitizedEmail = user_email.replace(/[^a-zA-Z0-9]/g, '-');
            const policy_name = `user-policy-${sanitizedEmail}`;

            // 1. Check if Policy already exists
            let existingPolicy = await this.findPolicyByName(policy_name);

            if (!existingPolicy) {
                // 2. Create the Personal Policy (Border0 will enforce user existence or permissions)
                try {
                    const policy_data = {
                        name: policy_name,
                        policy_data: {
                            action: 'allow',
                            condition: {
                                who: { email: [user_email] }
                            }
                        }
                    };
                    const p_resp = await this.client.post('/policies', policy_data);
                    policyIds.push(p_resp.data.id || p_resp.data.policy_id);
                } catch (error: any) {
                    console.error(`[FermiHDI] Failed to create policy ${policy_name} for ${user_email}:`, error.response?.data || error.message);
                }
            } else {
                policyIds.push(existingPolicy.id);
            }
        }

        // 3. Attach all to Socket
        if (policyIds.length > 0) {
            // Updated to use singular /policy and the actions array format required by newer Border0 API
            const actions = policyIds.map(id => ({ action: 'add', policy_id: id }));
            await this.client.put(`/socket/${socket_id}/policy`, { actions });
        }
    }
}
