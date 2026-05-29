import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
    outDir: 'dist/webview',
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/webview/main.tsx'),
      output: {
        assetFileNames: 'style[extname]',
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: 'main.js',
      },
    },
  },
});
