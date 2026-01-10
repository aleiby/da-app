import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['events', 'stream', 'crypto', 'buffer', 'util', 'process', 'http', 'https'],
    }),
  ],
  optimizeDeps: {
    include: [
      '@airgap/beacon-sdk',
      '@airgap/beacon-types',
      '@airgap/beacon-core',
      '@airgap/beacon-dapp',
      '@airgap/beacon-utils',
      '@taquito/beacon-wallet',
    ],
  },
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
