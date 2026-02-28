export interface ProvisionRequest {
    container_id: string;
    user_email?: string;
    namespace?: string; // For K8s
    ssh?: boolean;
    ssh_port?: number;
    vnc?: boolean;
    vnc_port?: number;
    web?: boolean;
    web_port?: number;
    tcp?: boolean;
    tcp_port?: number;
    rdp?: boolean;
    rdp_port?: number;
    tags?: Record<string, string>;
}

export interface ProvisionResponse {
    urls: {
        ssh?: string;
        vnc?: string;
        web?: string;
        tcp?: string;
        rdp?: string;
    };
    socket_ids: string[];
}

export interface DeprovisionRequest {
    container_id: string;
}
