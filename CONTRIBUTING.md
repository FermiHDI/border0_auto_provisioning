# Contributing to Border0 Coder Glue Logic

Thank you for your interest in contributing to the FermiHDI Border0 Glue App! We welcome contributions from the community to help make this tool more robust and feature-rich.

---

## Getting Started

### 1. Development Prerequisites
- **Node.js**: v20 or later.
- **Docker**: Required for running integration tests via `testcontainers`.
- **Border0 Account**: Access to a Border0 organization and an API token.

### 2. Local Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/FermiHDI/border0_auto_provisioning.git
   cd border0_auto_provisioning
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Setup environment variables:
   Copy `.env.example` to `.env` and fill in your Border0 credentials.
   ```bash
   cp .env.example .env
   ```

### 3. Development Workflow
To run the app in development mode with hot-reloading:
```bash
npm run dev
```

To build the project:
```bash
npm run build
```

---

## Quality Standards

### 1. Code Coverage
We maintain **100% Code Coverage** for all logic. 
- Ensure you add unit or integration tests for every new feature or bug fix.
- Run tests regularly:
  ```bash
  npm test
  ```

### 2. Live API Integration Tests
For deep verification, the project includes a `live_api.test.ts` suite that interacts directly with the live Border0 API. This is the preferred way to verify changes to the API client.
- Ensure your `.env` contains `BORDER0_ADMIN_TOKEN` and `BORDER0_CONNECTOR_ID`.
- Run only the live test suite:
  ```bash
  npm test src/__tests__/live_api.test.ts
  ```

### 3. Coding Style
- **TypeScript**: Use strong typing for all functions and variables.
- **ESM**: This project uses ES Modules (`"type": "module"` in `package.json`). Ensure all imports include the `.js` extension (e.g., `import { foo } from './foo.js'`).
- **Logging**: Use the centralized `logger` from `src/observability.ts` for all application logs. Follow the JSON schema standard.

---

## Submission Process

### 1. Branching
- Create a feature branch from `main`: `feature/your-feature-name` or `fix/your-bug-name`.

### 2. Commit Messages
- Use descriptive, imperative commit messages (e.g., "Add support for TCP sockets").

### 3. Pull Requests
- Ensure all tests pass before submitting.
- Provide a clear description of the changes in the PR.
- Link any related issues.

---

## Security
If you discover a security vulnerability, please do NOT open a public issue. Instead, contact the security team at security@fermihdi.com.

---
**FermiHDI Limited** - Secure Workspace Connectivity
