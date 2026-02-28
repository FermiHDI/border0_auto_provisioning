import { jest } from '@jest/globals';

// Increasing timeout for downloading/starting container
jest.setTimeout(30000);

// Use dynamic imports for ESM compatibility
const { GenericContainer } = await import('testcontainers');
const { DockerDiscovery } = await import('../discovery.js');

describe('DockerDiscovery Integration', () => {
    let container: any;
    let discovery: any;

    beforeAll(async () => {
        // Start a lightweight alpine container with specific labels
        container = await new GenericContainer('alpine')
            .withCommand(['sleep', '3600'])
            .withLabels({
                'border0.io/enable': 'true',
                'border0.io/email': 'integration-test@fermihdi.com',
                'border0.io/tag.env': 'integration',
                'project': 'border0-glue'
            })
            .start();

        discovery = new DockerDiscovery();
    });

    afterAll(async () => {
        if (container) {
            await container.stop();
        }
    });

    /**
     * Test that we can discover a real running container and extract its info.
     */
    it('should discover real container IP and labels', async () => {
        const containerId = container.getId();
        const info = await discovery.getContainerInfo(containerId);

        expect(info).not.toBeNull();
        expect(info?.ip).toMatch(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/); // Validates IP format
        expect(info?.email).toBe('integration-test@fermihdi.com');
        expect(info?.labels['project']).toBe('border0-glue');
        expect(info?.tags['env']).toBe('integration');
    });

    /**
     * Test behavior when container ID does not exist.
     */
    it('should return null for non-existent container', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        const info = await discovery.getContainerInfo('non-existent-id-12345');

        expect(info).toBeNull();
        consoleSpy.mockRestore();
    });
});
