import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/test*.ts'],
    testTimeout: 60000, // 1 minute timeout
    hookTimeout: 60000,
    // Use Node.js environment for server-side tests
    environment: 'node',
    // Run tests in sequence to avoid port conflicts (server side effects)
    // The server.ts module has side effects that start the server on import
    // Use forks pool with single fork to avoid module isolation issues
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
    // Setup files for test environment
    setupFiles: ['./src/tests/setup.ts'],
    // Global setup runs in main vitest process before tests
    globalSetup: './vitest.global-setup.ts',
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
