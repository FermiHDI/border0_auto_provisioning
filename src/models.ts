export interface ProvisionRequest {
    container_id: string;
    user_email?: string;
    namespace?: string; // For K8s
}

export interface ProvisionResponse {
    urls: {
        ssh: string;
        vnc: string;
    };
    socket_ids: string[];
}

export interface DeprovisionRequest {
    container_id: string;
}
