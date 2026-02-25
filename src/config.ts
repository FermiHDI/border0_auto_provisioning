import fs from 'fs';
import path from 'path';

/**
 * Loads a secret from an environment variable or a file path.
 * If the value of the environment variable looks like an absolute path and the file exists,
 * it reads the content of that file.
 * 
 * @param {string} envVar - The name of the environment variable.
 * @returns {string} The secret value.
 */
export function getSecret(envVar: string): string {
    const value = process.env[envVar] || '';
    if (value.startsWith('/') && fs.existsSync(value)) {
        try {
            return fs.readFileSync(value, 'utf8').trim();
        } catch (err) {
            console.error(`Error reading secret from file ${value}:`, err);
        }
    }
    return value;
}
