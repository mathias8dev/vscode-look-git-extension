import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import react from '@vitejs/plugin-react';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'node',
        environmentMatchGlobs: [
            ['tests/webview/**', 'jsdom'],
        ],
        exclude: ['node_modules/**', 'dist/**', 'out/**', 'tests/e2e/**', 'tests/integration/**'],
        testTimeout: 30000,
        hookTimeout: 30000,
        setupFiles: ['tests/setup.ts'],
    },
    resolve: {
        alias: {
            vscode: resolve(root, 'tests/mocks/vscode.ts'),
        },
    },
});
