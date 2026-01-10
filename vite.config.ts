import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['events', 'stream', 'crypto', 'buffer', 'util', 'process'],
    }),
  ],
  build: {
    outDir: 'build',
    assetsDir: 'static',
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:8080',
        ws: true,
      },
    },
  },
});
