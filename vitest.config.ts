import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import react from '@vitejs/plugin-react';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'node',
        environmentMatchGlobs: [
            ['tests/webview/**', 'jsdom'],
        ],
        exclude: ['node_modules/**', 'dist/**', 'out/**', 'tests/e2e/**', 'tests/integration/**'],
        // Headroom for real-git integration tests that spawn many git subprocesses (slow on Windows runners).
        testTimeout: 60000,
        hookTimeout: 60000,
        setupFiles: ['tests/setup.ts'],
    },
    resolve: {
        alias: {
            vscode: resolve(root, 'tests/mocks/vscode.ts'),
        },
    },
});
