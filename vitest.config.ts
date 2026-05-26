import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        environment: 'node',
        exclude: ['node_modules/**', 'dist/**', 'out/**', 'tests/integration/**'],
        testTimeout: 30000,
        hookTimeout: 30000,
    },
    resolve: {
        alias: {
            vscode: resolve(root, 'tests/mocks/vscode.ts'),
        },
    },
});
