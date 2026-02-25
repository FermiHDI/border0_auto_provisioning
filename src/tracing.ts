import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { logger } from './observability.js';

/**
 * OpenTelemetry Tracing Initialization
 */
export function initTracing() {
    const traceExporter = new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    });

    const sdk = new NodeSDK({
        resource: resourceFromAttributes({
            [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME || 'border0-glue',
            [ATTR_SERVICE_VERSION]: '1.0.0',
        }),
        traceExporter,
        instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();

    logger.info('OpenTelemetry Tracing initialized', {
        action: 'tracing_init',
        category: 'observability'
    });

    process.on('SIGTERM', () => {
        sdk.shutdown()
            .then(() => logger.info('Tracing terminated'))
            .catch((error) => logger.error('Error terminating tracing', { data: { error } }))
            .finally(() => process.exit(0));
    });
}
