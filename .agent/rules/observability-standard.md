# Rule: OpenTelemetry JSON Logging Standard

All application logs and traces must adhere to the standardized JSON schema to ensure seamless integration with our OpenTelemetry-based observability stack.

### Context

- **System:** OpenTelemetry (Logs, Traces, Metrics)
- **Standard Version:** 1.0.0
- **Scope:** All application logging, error handling, and tracing spans.

---

### 1. General Logging Format

Use this format for standard application logs. Note the specific key `logging_format_version` for non-traced events.

```json
{
  "logging_format_version": "1.0.0",
  "timestamp": "ISO8601_UTC_TIMESTAMP",
  "level": "info|warn|error|debug",
  "service": {
    "name": "${SERVICE_NAME}",
    "version": "${SERVICE_VERSION}",
    "environment": "${ENV_NAME}",
    "node_name":"${NODE_NAME}"
  },
  "event": {
    "category": "string",
    "action": "string",
    "outcome": "success|failure"
  },
  "opt_in": false,
  "message": "Human readable log message",
  "data": {
    "custom_key": "custom_value"
  }
}
```

### 2. Tracing & Identity Format

Use this format for logs generated within a trace context. This format includes identity and OTel trace identifiers.

```json
{
  "logging_format_version": "1.0.0",
  "timestamp": "ISO8601_UTC_TIMESTAMP",
  "level": "info|warn|error|debug",
  "service": {
    "name": "${SERVICE_NAME}",
    "version": "${SERVICE_VERSION}",
    "environment": "${ENV_NAME}",
    "node_name":"${NODE_NAME}"
  },
  "event": {
    "category": "string",
    "action": "string",
    "outcome": "success|failure"
  },
  "user": {
    "id": "string",
    "email": "string",
    "ip": "string"
  },
  "tracing": {
    "trace_id": "OTEL_TRACE_ID",
    "span_id": "OTEL_SPAN_ID"
  },
  "opt_in": false,
  "message": "Human readable log message",
  "data": {
    "custom_key": "custom_value"
  }
}
```

### 3. Development Mode Enhancements

When the environment variable NODE_ENV, APP_ENV, or ENV is set to "development", the log object must be augmented with debugging metadata:

- **Source Metadata**: Include source.file and source.line.
- **Error Handling**: If the log level is error, include the full error.stack_trace.
- **Example addition to the data block or root level**:

```json
{
  "debug": {
    "file": "src/controllers/userController.ts",
    "line": 42,
    "stack_trace": "Error: ... at src/controllers/userController.ts:42:12"
  }
}
```

### 4. Health Check Standard

All health check functions (CLI, HTTP, or HTTPS) must return a JSON response in the following format. The timestamp must be a high-precision Unix epoch (seconds.microseconds).

```json
{
  "status": "ok",
  "timestamp": 1706767436.123456
}
```

### 5. Prometheus Metrics

If metrics are collected they must be exposed to Prometheus for scraping via HTTP or HTTPS.

- All services must expose a /metrics endpoint.
- This endpoint must serve metrics in the standard Prometheus text-based scraping format.
- Ensure the endpoint is separate from the health check logic to avoid unnecessary load during health probing.

### 6. Agent Instructions

- Validation: When suggesting or generating logging code, ensure the JSON structure matches these schemas exactly.
- Health Checks: Always implement health checks using the specific "status/timestamp" JSON schema provided in Section 4.
- Metrics: When generating service boilerplate, automatically include a HTTP or HTTPS /metrics endpoint compatible with Prometheus if any form of web server or service is included.
- Trace Context: Automatically inject tracing.trace_id and tracing.span_id when the code is within an OpenTelemetry span context.
- Consistency: Ensure the service block is populated via environment variables or central configuration.
- Development Verbosity: If the project environment is detected as "development" (via NODE_ENV, APP_ENV, or ENV), automatically include logic to capture the source file name, line number, and stack traces (for errors) in the log output.
