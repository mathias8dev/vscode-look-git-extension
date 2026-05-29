import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    emptyOutDir: false,
    outDir: 'dist/webview',
    sourcemap: true,
    rollupOptions: {
      input: {
        changes: resolve(__dirname, 'src/webview/changes/main.tsx'),
        graph: resolve(__dirname, 'src/webview/graph/main.tsx'),
        history: resolve(__dirname, 'src/webview/history/main.tsx'),
      },
      output: {
        assetFileNames: '[name][extname]',
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: '[name].js',
      },
    },
  },
});
