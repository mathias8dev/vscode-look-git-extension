import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'node',
        exclude: ['node_modules/**', 'dist/**', 'out/**', 'tests/e2e/**', 'tests/integration/**'],
        // Headroom for real-git integration tests that spawn many git subprocesses (slow on Windows runners).
        testTimeout: 60000,
        hookTimeout: 60000,
        setupFiles: ['tests/setup.ts'],
    },
    resolve: {
        alias: {
            '@application': resolve(root, 'src/application'),
            '@core': resolve(root, 'src/core'),
            '@extension': resolve(root, 'src/extension'),
            '@protocol': resolve(root, 'src/protocol'),
            '@tests': resolve(root, 'tests'),
            '@webview': resolve(root, 'src/webview'),
            vscode: resolve(root, 'tests/mocks/vscode.ts'),
        },
    },
});
