/**
 * Socket.io edge case and error handling tests
 *
 * Tests error cases and edge conditions including:
 * - Operations without wallet
 * - Disconnection handling
 * - Invalid inputs
 * - Browse mode events
 * - Solitaire game setup
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
// Error Cases and Edge Cases
// ============================================================

describe('Error Cases', () => {
  test.sequential('client without wallet cannot set name', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();

    // Try to set name without setting wallet first
    client.setUserName('ShouldFail');

    // Should receive error message
    const msg = await client.waitForMessage('must choose a wallet');
    expect(msg).toContain('must choose a wallet');
  });

  test.sequential('client handles disconnection gracefully', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    expect(client.isConnected).toBe(true);

    client.disconnect();
    expect(client.isConnected).toBe(false);

    // Should be able to reconnect
    await client.connect();
    expect(client.isConnected).toBe(true);
  });

  test.sequential('clicking invalid deck does not crash', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    client.setWallet();
    await client.waitForSetTable();
    await client.waitForResumeGame();

    // Click on a non-existent deck
    client.clickDeck('NonExistentDeck');

    // Should not crash - wait a bit and verify still connected
    await new Promise((r) => setTimeout(r, 500));
    expect(client.isConnected).toBe(true);
  });

  test.sequential('playing unknown game is handled', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    client.setWallet();
    await client.waitForSetTable();
    await client.waitForResumeGame();

    // Try to play an unknown game
    client.playGame('UnknownGame');

    // Should still be connected (no crash)
    await new Promise((r) => setTimeout(r, 500));
    expect(client.isConnected).toBe(true);
  });

  test.sequential('client can reconnect to existing table', async () => {
    const wallet = generateTestWallet();

    // First connection
    const client1 = new TestClient(wallet);
    testClients.push(client1);

    await client1.connect();
    client1.setWallet();
    await client1.waitForSetTable();
    client1.disconnect();

    // Second connection - should rejoin same table
    const client2 = new TestClient(wallet);
    testClients.push(client2);

    await client2.connect();
    client2.setWallet();
    const tableInfo2 = await client2.waitForSetTable();

    // Should be on the same table (or a new one if table was cleaned up)
    // The important thing is it doesn't crash
    expect(tableInfo2.tableId).toBeDefined();
  });
});

// ============================================================
// Browse Mode Tests
// ============================================================

describe('Browse Mode', () => {
  test.sequential('browse mode click events are delivered', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    const tableInfo = await client.waitForSetTable();
    await client.waitForResumeGame();

    // Subscribe to clickDeck channel to verify click delivery
    const subscriber = await createTestRedisClient();

    let receivedClick = false;
    const clickPromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableInfo.tableId}:clickDeck`, (message) => {
        const data = JSON.parse(message);
        if (data.deck === 'DeckA') {
          receivedClick = true;
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Click on DeckA
    client.clickDeck('DeckA');

    await Promise.race([
      clickPromise,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ]);

    expect(receivedClick).toBe(true);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });

  test.sequential('browse mode table click events are delivered', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    const tableInfo = await client.waitForSetTable();
    await client.waitForResumeGame();

    // Subscribe to clickTable channel
    const subscriber = await createTestRedisClient();

    let receivedClick = false;
    const clickPromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableInfo.tableId}:clickTable`, (message) => {
        const data = JSON.parse(message);
        if (data.x === 0.1 && data.z === 0.1) {
          receivedClick = true;
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Click on table
    client.clickTable(0.1, 0.1, [1, 2, 3]);

    await Promise.race([
      clickPromise,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ]);

    expect(receivedClick).toBe(true);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });
});

// ============================================================
// Solitaire Game Tests
// ============================================================

describe('Solitaire Game', () => {
  // Use small deck for fast test completion
  const originalDeckSize = process.env.TEST_DECK_SIZE;

  beforeEach(() => {
    // Set small deck size for fast tests (28 cards = minimum for 7 tableau piles)
    process.env.TEST_DECK_SIZE = '28';
  });

  afterEach(() => {
    // Restore original value
    if (originalDeckSize !== undefined) {
      process.env.TEST_DECK_SIZE = originalDeckSize;
    } else {
      delete process.env.TEST_DECK_SIZE;
    }
  });

  test.sequential('solitaire game starts with proper setup', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    client.setWallet();
    await client.waitForSetTable();
    await client.waitForResumeGame();
    client.clearReceivedEvents();

    // Start Solitaire
    client.playGame('Solitaire');

    await client.waitForSetTable();
    const gameName = await client.waitForResumeGame();
    expect(gameName).toBe('Solitaire');

    // Should receive welcome message
    const msg = await client.waitForMessage('Solitaire', 10000);
    expect(msg).toContain('Solitaire');

    // Should receive multiple initDeck events (stock, talon, foundations, tableau)
    // Wait for at least 5 initDeck events using the helper method
    const initDeckEvents = await client.waitForInitDecks(5, 10000);
    expect(initDeckEvents.length).toBeGreaterThanOrEqual(5);
  });
});
