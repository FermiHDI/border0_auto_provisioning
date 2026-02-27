<p align="left">
  <img src="https://github.com/FermiHDI/images/blob/main/logos/FermiHDI%20Logo%20Hz%20-%20Dark.png?raw=true" width="500" alt="logo"/>
</p>

# Border0 Coder Glue Logic (Node.js)
Automatically provision Border0 sockets for Coder workspaces with advanced identity-aware security.

## License
UNLICENSED - Private<br />
ALL RIGHTS RESERVED<br />
© COPYRIGHT 2026 FERMIHDI LIMITED<br />

## Project Overview
This project provides a robust REST API that acts as the "glue" between **Coder.com** and **Border0**. It enables dynamic, identity-aware socket management for developer workspaces, ensuring that every remote workspace is securely accessible via SSH or VNC without complex network configuration.  While intended to be used with Coder managed workspace containers, it can be used as is with any container orchestration platform or purpose that exposes the necessary metadata.

### How it Works
When a Coder workspace (Docker container or K8s Pod) is provisioned:
1.  **Discovery**: The Glue App identifies the workspace's metadata (Internal IP, Name, Namespace) and owner identity via environment-aware discovery (Docker or Kubernetes).
2.  **Idempotent Provisioning**: It creates or updates unique sockets of the type requested. If a workspace restarts and its IP changes, the app automatically detects the existing sockets and updates their upstream configuration in Border0.
3.  **Security Policy Enforcement**: It attaches and synchronizes access policies:
    *   **Personal Policy**: Strictly restricts access to the workspace owner's verified email.
    *   **Global Policies**: Automatically attaches organization-wide management or audit policies to every socket.
4.  **Automated Lifecycle Cleanup**: When a workspace stops, the Glue App removes the sockets and garbage-collects any orphaned personal policies or users no longer active in the organization.

### Design Assumptions
*   **Ephemeral Workspaces**: All Coder workspaces managed by this logic are assumed and designed to be **100% ephemeral**. Configuration resides in the image or template, and state is managed externally.
*   **Identity First**: Access is pinned to the developer's verified email, ensuring that only the specific workspace owner can reach their environment.

---

## Prerequisites & Setup

### 1. Border0 Configuration
Before deploying the Glue App, you must set up your Border0 environment:
1.  **Connector**: Install and run a [Border0 Connector](https://portal.border0.com/connectors) in your network (Docker, K8s, or Linux). Note its `Connector ID`.
2.  **Service Account & Token**: 
    *   Navigate to **Team** > **Service Accounts** in the Border0 Portal.
    *   Create a new Service Account (e.g., `coder-glue-app`) and assign it the **Member** or **Administrator** role.
    *   Click on the Service Account name and navigate to the **Tokens** tab.
    *   Create a new **Token** and copy the resulting string. This is your `BORDER0_ADMIN_TOKEN`.
3.  **(Optional) Global Policy**: Create a policy you'd like to reach all sockets (e.g., for admins) and note its `Policy ID`. This can be used as `BORDER0_GLOBAL_POLICY_ID`.  You may need to get this from the policy's URL in the browser.  For example: `https://portal.border0.com/policies/c89...` -> `c89...`

### 2. Environment Variables
Configure the app using these variables:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `BORDER0_ADMIN_TOKEN` | Border0 Admin API Token (or path to a secret file) | `ey...` or `/run/secrets/token` |
| `BORDER0_CONNECTOR_ID` | The ID of your Border0 Connector (or path to file) | `b78...` |
| `BORDER0_SSH_USERNAME` | The SSH user to login to workspaces (defaults to `coder`) | `coder` |
| `BORDER0_GLOBAL_POLICY_ID` | (Optional) Global Policy ID to attach to all sockets | `c89...` |
| `AUTO_PROVISION` | Enable automatic socket creation via labels/events (`true`/`false`) | `true` |
| `DEPLOYMENT_MODE` | Set to `docker` or `k8s` based on your host environment | `k8s` |
| `PORT` | Listening port for the Glue App | `8000` |
| `NODE_ENV` | Set to `production` or `development` | `production` |

---

## API Reference

### POST `/provision`
Provisions or updates Border0 sockets for a container or pod.

**Request Body:**
```json
{
  "container_id": "string",       // Required. Unique ID or name of the workspace container/pod.
  "user_email": "string",         // Optional. Owner email for personal policy attachment.
  "namespace": "string",          // Optional. K8s namespace (only for DEPLOYMENT_MODE=k8s).
  "ssh": boolean,                 // Optional. Enable/Disable SSH socket (defaults to true).
  "ssh_port": number,             // Optional. Custom SSH port (defaults to 22).
  "vnc": boolean,                 // Optional. Enable/Disable VNC socket (defaults to false).
  "vnc_port": number,             // Optional. Custom VNC port (defaults to 5901).
  "web": boolean,                 // Optional. Enable/Disable Web App socket (defaults to false).
  "web_port": number,             // Optional. Custom Web port (defaults to 80).
  "tcp": boolean,                 // Optional. Enable/Disable TCP socket (defaults to false).
  "tcp_port": number,             // Optional. Custom TCP port (Required if TCP enabled).
  "rdp": boolean,                 // Optional. Enable/Disable RDP socket (defaults to false).
  "rdp_port": number              // Optional. Custom RDP port (defaults to 3389).
}
```

**Response (Success 200 OK):**
```json
{
  "urls": {
    "ssh": "ssh-xxx.border0.io",
    "vnc": "vnc-xxx.border0.io",
    "web": "web-xxx.border0.io",
    "tcp": "tcp-xxx.border0.io",
    "rdp": "rdp-xxx.border0.io"
  },
  "socket_ids": ["s1", "s2"]
}
```

### POST `/deprovision`
Removes all Border0 sockets and clean up orphaned personal policies associated with a workspace.

**Request Body:**
```json
{
  "container_id": "string"        // Required. Unique ID or name of the workspace.
}
```

**Response (Success 200 OK):**
```json
{
  "status": "success",
  "deleted_count": 2
}
```

### GET `/health` & `/healthz`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "mode": "docker"
}
```

---

## Deployment Guides

### Option A: Docker (Novice Friendly)
1.  Clone this repository.
2.  Create a `.env` file based on `.env.example`.
3.  Run:
    ```bash
    docker-compose up -d --build
    ```
    *This automatically mounts the host Docker socket for container discovery.*

### Option B: Kubernetes
1.  Create a secret with your Border0 credentials:
    ```bash
    kubectl create secret generic border0-secrets \
      --from-literal=admin-token="YOUR_TOKEN" \
      --from-literal=connector-id="YOUR_CONNECTOR_ID"
    ```
2.  Update `k8s/manifest.yaml` with your image name.
3.  Apply the manifest:
    ```bash
    kubectl apply -f k8s/manifest.yaml
    ```

---

## Coder Integration (Terraform)
Add the following snippets to your Coder template to bridge the gap between workspace creation and Border0 access.

### 1. Fetch Sockets & UI Metadata
Use the `http` provider to call the Glue App during workspace deployment.

```hcl
data "http" "border0_provision" {
  url    = "http://border0-glue.internal:8000/provision"
  method = "POST"
  request_headers = { "Content-Type" = "application/json" }
  request_body = jsonencode({
    container_id = "${data.coder_workspace.me.owner}-${data.coder_workspace.me.name}"
    user_email   = data.coder_workspace.me.owner_email
    ssh          = true
    vnc          = true
  })
}

locals {
  border0 = jsondecode(data.http.border0_provision.response_body)
}
```

### 2. Workspace Provisioning & Deprovisioning Script
To ensure that sockets are cleaned up immediately when a workspace is stopped, add a `coder_script` resource. This is the recommended way to handle the lifecycle.

```hcl
resource "coder_script" "border0_lifecycle" {
  agent_id     = coder_agent.main.id
  display_name = "Border0 Lifecycle"
  icon         = "https://border0.com/favicon.ico"
  
  # Provision on Startup (Optional fallback)
  script = <<EOT
    curl -s -X POST http://border0-glue.internal:8000/provision \
      -H "Content-Type: application/json" \
      -d "{\"container_id\": \"$HOSTNAME\", \"user_email\": \"${data.coder_workspace.me.owner_email}\"}"
  EOT

  # Deprovision on Shutdown (CRITICAL for cleanup)
  run_on_stop = true
  stop_script = <<EOT
    echo "[FermiHDI] Cleaning up Border0 sockets..."
    curl -s -X POST http://border0-glue.internal:8000/deprovision \
      -H "Content-Type: application/json" \
      -d "{\"container_id\": \"$HOSTNAME\"}"
  EOT
}
```

### 3. UI Buttons in Coder Dashboard
Provide one-click access for your developers:

```hcl
resource "coder_app" "antigravity_access" {
  agent_id     = coder_agent.main.id
  slug         = "antigravity"
  display_name = "Remote Antigravity (via Border0)"
  url          = "antigravity://vscode.remote-ssh/connect_via_host?host=coder@${local.border0.urls.ssh}"
  icon         = "https://i.logos-download.com/114435/32684-s640-bbd06cfd03fab93d4546b17773b1f94f.png/Google_Antigravity_Logo_2025-s640.png?dl"
}

resource "coder_app" "vscode_access" {
  agent_id     = coder_agent.main.id
  slug         = "vscode"
  display_name = "Remote VSCode (via Border0)"
  url          = "vscode://vscode.remote-ssh/connect_via_host?host=coder@${local.border0.urls.ssh}"
  icon         = "https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg"
}

resource "coder_app" "vnc_access" {
  agent_id     = coder_agent.main.id
  slug         = "desktop"
  display_name = "Remote Desktop (via Border0)"
  url          = local.border0.urls.vnc
  icon         = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/microsoft-remote-desktop.png"
}
```

---

## Workspace Configuration
For Border0 to facilitate secure, passwordless logins using Identity-aware SSH, the target Coder workspace needs to trust the Border0 SSH Certificate Authority.

### 1. SSH Socket Standards
The Glue App automatically provisions SSH sockets with the following configuration:
*   **Connection Type**: Standard SSH (Proxy Mode)
*   **Authentication Type**: Border0 Certificate
*   **Assigned SSH Username**: Configurable via `BORDER0_SSH_USERNAME` (default: `coder`)

### 2. Dockerfile Requirements
Update your Coder workspace `Dockerfile` to accept Border0 certificate logins. This eliminates the need for managing SSH keys manually.

To get the border0_ca.pub for your SSH server, log in to the Border0 portal and navigate to Organization Settings > Details. Copy the SSH CA public key shown there and save it into a file that you then copy into your Docker image.

Alternatively you can use the Border0 CLI to fetch the SSH CA public key and save it into a file that you then copy into your Docker image. For example: ```border0 organization show --format json | jq -r '.border0_ca.pub'```

```dockerfile
# Replace 'coder' with your desired SSH username
ARG BORDER0_SSH_USERNAME=coder

# 1. Install SSH Server
RUN apt-get update && apt-get install -y openssh-server

# 2. Configure SSHD to trust the Border0 CA
# This allows Border0 to issue temporary certificates for your developers
COPY border0_ca.pub /etc/ssh/border0_ca.pub
RUN echo "TrustedUserCAKeys /etc/ssh/border0_ca.pub" >> /etc/ssh/sshd_config && \
    echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config && \
    echo "PasswordAuthentication no" >> /etc/ssh/sshd_config && \
    echo "AuthorizedPrincipalsFile /etc/ssh/authorized_principals/%u" >> /etc/ssh/sshd_config && \
    mkdir -p /etc/ssh/authorized_principals/ && \
    echo "border0_ssh_signed" >> /etc/ssh/authorized_principals/${BORDER0_SSH_USERNAME} && \
    chmod 600 /etc/ssh/authorized_principals/${BORDER0_SSH_USERNAME}

# 3. Ensure the target user exists (matching BORDER0_SSH_USERNAME)
RUN useradd -m -s /bin/bash ${BORDER0_SSH_USERNAME} && \
    mkdir -p /home/${BORDER0_SSH_USERNAME}/.ssh && \
    chown -R ${BORDER0_SSH_USERNAME}:${BORDER0_SSH_USERNAME} /home/${BORDER0_SSH_USERNAME}

# 4. Standard Coder setup (Ensure sudo access)
RUN echo "${BORDER0_SSH_USERNAME} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
```

---

## Auto-Provisioning Mode (Optional)
As an alternative to using the Coder Terraform provider, the Glue App can listen directly to the Docker engine or Kubernetes API for new containers/pods. When a container starts with the appropriate labels, the Glue App will automatically provision the corresponding Border0 sockets.

### 1. Enabling Auto-Provisioning
Set the `AUTO_PROVISION=true` environment variable in your Glue App deployment.

### 2. Supported Labels & Annotations
The app scans for the following metadata on containers (Docker) or pods (Kubernetes):

| Label/Annotation | Description | Example |
| :--- | :--- | :--- |
| `border0.io/enable` | Must be set to `true` to trigger provisioning | `true` |
| `border0.io/ssh` | Enable/Disable SSH socket generation (defaults to `true`) | `false` |
| `border0.io/ssh_port` | Overrides the default SSH port (22) | `2222` |
| `border0.io/vnc` | Enable/Disable VNC socket generation (defaults to `false`) | `true` |
| `border0.io/vnc_port` | Overrides the default VNC port (5901) | `5900` |
| `border0.io/web` | Enable/Disable Web App (HTTP) socket generation (defaults to `false`) | `true` |
| `border0.io/web_port` | Set the port for the Web App (defaults to 80) | `8080` |
| `border0.io/tcp` | Enable/Disable generic TCP socket generation (defaults to `false`) | `true` |
| `border0.io/tcp_port` | Set the port for the TCP service (required if enabled) | `5432` |
| `border0.io/rdp` | Enable/Disable RDP socket generation (defaults to `false`) | `true` |
| `border0.io/rdp_port` | Set the port for the RDP service (defaults to 3389) | `3389` |
| `border0.io/email` | Overrides the default owner email discovery | `dev@example.com` |

### 3. Usage Examples

#### Docker Compose
```yaml
services:
  my-workspace:
    image: my-coder-image
    labels:
      - "border0.io/enable=true"
      - "border0.io/email=dev@example.com"
```

#### Kubernetes Pod
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-workspace
  labels:
    border0.io/enable: "true"
  annotations:
    border0.io/email: "dev@example.com"
spec:
  containers:
    - name: workspace
      image: my-coder-image
```

---

## Observability & Monitoring
The FermiHDI Glue App is fully instrumented for enterprise-grade observability:

- **Standardized JSON Logging**: All logs follow the OpenTelemetry-compatible JSON schema on `stdout`.
- **Metrics (Port 8080)**: Exposes a `/metrics` endpoint on port `8080` for Prometheus scraping.
- **Health Checks (Port 8080)**: Provides a Section-4 compliant `/healthz` endpoint on port `8080`.
- **Distributed Tracing**: Automatically generates traces for OpenTelemetry collectors (configured via `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable).

## Maintenance & Garbage Collection
The FermiHDI Glue App includes advanced features to keep your Border0 organization clean:

1.  **Socket Removal**: On `/deprovision`, all sockets associated with the workspace are deleted.
2.  **Automated Policy Cleanup**:
    *   **Shared Personal Policies**: The app creates a dedicated policy for each developer, shared across their SSH and VNC workspaces.
    *   **Hourly Garbage Collection**: The app performs a maintenance scan every hour. If it finds a personal policy that is no longer attached to any active sockets, it is automatically deleted to keep the organization clean.
    *   **Adaptive Scheduling**: If the Border0 API exhibits latency, the app automatically jitters the next maintenance run to optimize load management.

> [!NOTE]
> **Technical Note on User Discovery**: Border0 Service Account tokens (even with Administrator roles) are restricted from accessing certain identity-management endpoints like `/users` or `/user`. 
> 
> **Impact**: The app cannot verify if a user exists in Border0 before attempting to create a policy for them.
> 
> **Workaround**: The app is designed to be **optimistic**. It attempts to create the required personal policy directly. If the user doesn't exist or permissions fail, it logs the event and degrades gracefully by only attaching the Global policies. Cleanup is performed by counting active socket attachments rather than querying a user list, ensuring 100% reliability without requiring additional API scopes.

## Development & Testing
### Quality Standard
We maintain **100% Code Coverage**.
```bash
npm install
npm test
```
*Note: Tests include integration checks using `testcontainers` which require Docker.*

---
**FermiHDI Limited** - Secure Workspace Connectivity
