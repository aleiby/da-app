/**
 * Socket.io connection tests
 *
 * Tests basic connection flows including:
 * - Default namespace connection
 * - Browser namespace connection
 * - Multiple simultaneous connections
 */
import { test, expect, beforeEach, afterEach, describe } from 'vitest';
import {
  TestClient,
  cleanupTestData,
  generateTestWallet,
  waitForServer,
  createTestClients,
  connectAll,
  disconnectAll,
  createTestRedisClient,
} from './socket-helpers';

// Import server to trigger server startup side effect
import '../server';
import type { RedisClientType } from '../server';

// Redis client for test setup/cleanup
let redis: RedisClientType;

// Track test clients for cleanup
let testClients: TestClient[] = [];

beforeEach(async () => {
  redis = await createTestRedisClient();
  testClients = [];
});

afterEach(async () => {
  // Disconnect all test clients
  disconnectAll(testClients);
  testClients = [];

  // Cleanup Redis test data
  await cleanupTestData(redis, ['tz1Test*', 'pending:*', 'table:test*']);

  await redis.disconnect();
});

// ============================================================
// Connection Tests
// ============================================================

describe('Connection', () => {
  test.sequential('client can connect to default namespace', async () => {
    const ready = await waitForServer();
    expect(ready).toBe(true);

    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    expect(client.isConnected).toBe(true);

    client.disconnect();
    expect(client.isConnected).toBe(false);
  });

  test.sequential('client can connect to browser namespace', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connectBrowser();
    expect(client.isConnected).toBe(true);

    // Should receive isDevelopment flag
    const args = await client.waitForEvent('isDevelopment');
    expect(args[0]).toBe(true);
  });

  test.sequential('multiple clients can connect simultaneously', async () => {
    const clients = createTestClients(3);
    testClients.push(...clients);

    await connectAll(clients);

    expect(clients.every((c) => c.isConnected)).toBe(true);
  });
});
