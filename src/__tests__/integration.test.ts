import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DockerDiscovery } from '../discovery.js';
import { jest } from '@jest/globals';

describe('DockerDiscovery Integration', () => {
    let container: StartedTestContainer;
    let discovery: DockerDiscovery;

    // Increasing timeout for downloading/starting container
    jest.setTimeout(30000);

    beforeAll(async () => {
        // Start a lightweight alphine container with specific labels
        container = await new GenericContainer('alpine')
            .withCommand(['sleep', '3600'])
            .withLabels({
                'com.coder.user_email': 'integration-test@fermihdi.com',
                'owner_email': 'fallback@fermihdi.com',
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
