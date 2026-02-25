import { getSecret } from '../config.js';
import fs from 'fs';
import { jest } from '@jest/globals';

jest.mock('fs');

describe('config util', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        jest.clearAllMocks();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    /**
     * Test loading a literal secret value.
     */
    it('returns literal value when not a path', () => {
        process.env.TEST_VAR = 'literal-secret';
        expect(getSecret('TEST_VAR')).toBe('literal-secret');
    });

    /**
     * Test loading a secret from a file.
     */
    it('returns file content when value is a valid path', () => {
        const filePath = '/etc/secrets/token';
        process.env.TEST_VAR = filePath;

        const existsSpy = jest.spyOn(fs, 'existsSync');
        const readSpy = jest.spyOn(fs, 'readFileSync');

        existsSpy.mockReturnValue(true);
        readSpy.mockReturnValue('file-secret\n');

        expect(getSecret('TEST_VAR')).toBe('file-secret');
    });

    /**
     * Test failure case when reading a file.
     */
    it('returns path if file read fails', () => {
        const filePath = '/etc/secrets/error';
        process.env.TEST_VAR = filePath;

        const existsSpy = jest.spyOn(fs, 'existsSync');
        const readSpy = jest.spyOn(fs, 'readFileSync');

        existsSpy.mockReturnValue(true);
        readSpy.mockImplementation((() => {
            throw new Error('Read failed');
        }) as any);

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        expect(getSecret('TEST_VAR')).toBe(filePath);
        consoleSpy.mockRestore();
    });

    /**
     * Test case for missing environment variable.
     */
    it('returns empty string if env var is missing', () => {
        expect(getSecret('NON_EXISTENT')).toBe('');
    });

    /**
     * Test case for path that does not exist.
     */
    it('returns original value if path does not exist', () => {
        const filePath = '/non/existent/path';
        process.env.TEST_VAR = filePath;
        const existsSpy = jest.spyOn(fs, 'existsSync');
        existsSpy.mockReturnValue(false);
        expect(getSecret('TEST_VAR')).toBe(filePath);
    });
});
