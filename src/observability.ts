import winston from 'winston';
import { register, Counter, Histogram } from 'prom-client';
import express from 'express';
import os from 'os';

// Service Info (populated via env vars as per standard)
const SERVICE_NAME = process.env.SERVICE_NAME || 'border0-glue';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const ENVIRONMENT = process.env.APP_ENV || process.env.NODE_ENV || 'production';
const NODE_NAME = os.hostname();

/**
 * Standardized Logger matching FermiHDI Observability Standard
 */
export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.printf((info) => {
                const logEntry = {
                    logging_format_version: "1.0.0",
                    timestamp: new Date().toISOString(),
                    level: info.level,
                    service: {
                        name: SERVICE_NAME,
                        version: SERVICE_VERSION,
                        environment: ENVIRONMENT,
                        node_name: NODE_NAME
                    },
                    event: {
                        category: info.category || 'application',
                        action: info.action || 'log',
                        outcome: info.outcome || 'success'
                    },
                    message: info.message,
                    data: info.data || {},
                    opt_in: false
                };

                // Tracing info if available
                if (info.trace_id) {
                    (logEntry as any).tracing = {
                        trace_id: info.trace_id,
                        span_id: info.span_id
                    };
                }

                // Development mode enhancements
                if (ENVIRONMENT === 'development') {
                    (logEntry as any).debug = {
                        file: info.file,
                        line: info.line,
                        stack_trace: info.level === 'error' ? info.stack : undefined
                    };
                }

                return JSON.stringify(logEntry);
            })
        })
    ]
});

/**
 * Metrics Implementation
 */
export const provisionCounter = new Counter({
    name: 'border0_provision_total',
    help: 'Total number of socket provisions',
    labelNames: ['outcome']
});

export const requestDuration = new Histogram({
    name: 'border0_request_duration_seconds',
    help: 'Duration of Border0 Glue requests',
    labelNames: ['method', 'path']
});

/**
 * Observability Server (Port 8080)
 * Handles Health Checks and Metrics
 */
export function startObservabilityServer() {
    const obsApp = express();

    // Section 4: Health Check Standard
    obsApp.get('/healthz', (req, res) => {
        const now = Date.now() / 1000;
        res.json({
            status: "ok",
            timestamp: parseFloat(now.toFixed(6))
        });
    });

    // Section 5: Prometheus Metrics
    obsApp.get('/metrics', async (req, res) => {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    });

    const OBS_PORT = 8080;
    obsApp.listen(OBS_PORT, () => {
        logger.info(`Observability server running on port ${OBS_PORT}`, {
            action: 'startup',
            category: 'observability'
        });
    });
}
