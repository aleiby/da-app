import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.ts'],
    testTimeout: 60000, // 1 minute timeout
    hookTimeout: 60000,
    // Use Node.js environment for server-side tests
    environment: 'node',
    // Don't process server-side node_modules
    server: {
      deps: {
        external: [
          '@taquito/taquito',
          '@taquito/signer',
          '@taquito/beacon-wallet',
          '@taquito/utils',
          'mongodb',
          'nft.storage',
          '@pinata/sdk',
        ],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/tests/**', 'src/index.tsx', 'src/App.tsx'],
      thresholds: {
        lines: 34,
        branches: 30,
        functions: 35,
        statements: 34,
      },
    },
  },
});
