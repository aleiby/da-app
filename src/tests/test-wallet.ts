/**
 * Socket.io wallet and user setup tests
 *
 * Tests wallet and user initialization including:
 * - Setting wallet and receiving welcome
 * - Browse mode initialization
 * - Username setting and persistence
 */
import { test, expect, beforeEach, afterEach, describe } from 'vitest';
import {
  TestClient,
  cleanupTestData,
  generateTestWallet,
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
// Wallet and User Setup Tests
// ============================================================

describe('Wallet and User Setup', () => {
  test.sequential('client receives welcome message after setting wallet', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    client.setWallet();

    // Should receive setTable event (Browse mode starts automatically)
    const tableInfo = await client.waitForSetTable();
    expect(tableInfo.tableId).toMatch(/^table:\d+$/);
    expect(tableInfo.seat).toBe('A');
    expect(tableInfo.playerCount).toBe(1);
  });

  test.sequential('client receives resumeGame event for Browse mode', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    client.setWallet();

    // Wait for table setup and game resume
    await client.waitForSetTable();
    const gameName = await client.waitForResumeGame();
    expect(gameName).toBe('Browse');
  });

  test.sequential('client can set username', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    await client.waitForSetTable();

    // Set a name
    client.setUserName('TestPlayer');

    // Should receive welcome message
    const welcomeMsg = await client.waitForMessage('Welcome TestPlayer');
    expect(welcomeMsg).toContain('Welcome TestPlayer');

    // Verify name is stored in Redis
    const storedName = await redis.hGet(wallet, 'name');
    expect(storedName).toBe('TestPlayer');
  });

  test.sequential('username persists across reconnection', async () => {
    const wallet = generateTestWallet();

    // First connection - set name
    const client1 = new TestClient(wallet);
    testClients.push(client1);

    await client1.connect();
    client1.setWallet();
    await client1.waitForSetTable();
    client1.setUserName('PersistentName');
    await client1.waitForMessage('Welcome PersistentName');
    client1.disconnect();

    // Second connection - should receive cached name
    const client2 = new TestClient(wallet);
    testClients.push(client2);

    await client2.connect();
    client2.setWallet();

    // Should receive userName event with cached name
    const args = await client2.waitForEvent('userName');
    expect(args[0]).toBe('PersistentName');
  });
});
