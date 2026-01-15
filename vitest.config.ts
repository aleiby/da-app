import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/test*.ts'],
    testTimeout: 60000, // 1 minute timeout
    hookTimeout: 60000,
    // Use Node.js environment for server-side tests
    environment: 'node',
    // Enable file-level parallelism with isolated workers.
    // Each worker gets a unique PORT based on VITEST_POOL_ID (see redis.ts).
    // This maps to isolated Redis DBs (port 3001 = DB 0, 3002 = DB 1, etc).
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        minForks: 1,
        maxForks: 4, // Limit to 4 workers (ports 3001-3004, Redis DBs 0-3)
      },
    },
    fileParallelism: true,
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
