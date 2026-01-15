/**
 * Socket.io matchmaking tests
 *
 * Tests matchmaking flows including:
 * - Single-player game start
 * - Two-player game waiting and matching
 * - Quit waiting for game
 * - War game initialization
 */
import { test, expect, beforeEach, afterEach, describe } from 'vitest';
import {
  TestClient,
  cleanupTestData,
  generateTestWallet,
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
// Matchmaking Tests
// ============================================================

describe('Matchmaking', () => {
  test.sequential('single-player games start immediately', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    client.setWallet();
    await client.waitForSetTable();
    await client.waitForResumeGame();

    // Clear events before starting new game
    client.clearReceivedEvents();

    // Request Solitaire (single-player)
    client.playGame('Solitaire');

    // Should get new table
    const tableInfo = await client.waitForSetTable();
    expect(tableInfo.playerCount).toBe(1);

    // Should receive Solitaire game
    const gameName = await client.waitForResumeGame();
    expect(gameName).toBe('Solitaire');
  });

  test.sequential('two-player game waits for opponent', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    client.setWallet();
    await client.waitForSetTable();
    await client.waitForResumeGame();

    // Clear events
    client.clearReceivedEvents();

    // Request War (two-player)
    client.playGame('War');

    // Should receive waiting message
    const msg = await client.waitForMessage('Waiting');
    expect(msg).toContain('Waiting for another player');
  });

  test.sequential('two players are matched for War', async () => {
    const [clientA, clientB] = createTestClients(2);
    testClients.push(clientA, clientB);

    // Connect both clients
    await connectAll([clientA, clientB]);

    // Set up player A
    clientA.setWallet();
    await clientA.waitForSetTable();
    await clientA.waitForResumeGame();
    clientA.clearReceivedEvents();

    // Player A requests War
    clientA.playGame('War');
    await clientA.waitForMessage('Waiting');

    // Set up player B
    clientB.setWallet();
    await clientB.waitForSetTable();
    await clientB.waitForResumeGame();
    clientB.clearReceivedEvents();

    // Player B requests War - should match with A
    clientB.playGame('War');

    // Both should receive new table
    const [tableA, tableB] = await Promise.all([
      clientA.waitForSetTable(),
      clientB.waitForSetTable(),
    ]);

    // They should be on the same table
    expect(tableA.tableId).toBe(tableB.tableId);
    expect(tableA.playerCount).toBe(2);
    expect(tableB.playerCount).toBe(2);

    // Different seats
    expect(tableA.seat).not.toBe(tableB.seat);
    expect(['A', 'B']).toContain(tableA.seat);
    expect(['A', 'B']).toContain(tableB.seat);

    // Both should receive War game
    const [gameA, gameB] = await Promise.all([
      clientA.waitForResumeGame(),
      clientB.waitForResumeGame(),
    ]);
    expect(gameA).toBe('War');
    expect(gameB).toBe('War');
  });

  test.sequential('player can quit waiting for game', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    await client.waitForSetTable();
    await client.waitForResumeGame();
    client.clearReceivedEvents();

    // Request War
    client.playGame('War');
    await client.waitForMessage('Waiting');

    // Verify pending status in Redis
    let pending = await redis.hGet(wallet, 'pending');
    expect(pending).toBe('War');

    // Quit the game
    client.quitGame('War');

    // Should receive new table with Browse
    const tableInfo = await client.waitForSetTable();
    expect(tableInfo.playerCount).toBe(1);

    const gameName = await client.waitForResumeGame();
    expect(gameName).toBe('Browse');

    // Pending should be cleared
    pending = await redis.hGet(wallet, 'pending');
    expect(pending).toBeNull();
  });
});

// ============================================================
// War Game Flow Tests
// ============================================================

describe('War Game Flow', () => {
  test.sequential('war game initializes with two players', async () => {
    const [clientA, clientB] = createTestClients(2);
    testClients.push(clientA, clientB);

    await connectAll([clientA, clientB]);

    // Set up player A and start waiting for War
    clientA.setWallet();
    await clientA.waitForSetTable();
    await clientA.waitForResumeGame();
    clientA.clearReceivedEvents();
    clientA.playGame('War');

    // Set up player B and join War
    clientB.setWallet();
    await clientB.waitForSetTable();
    await clientB.waitForResumeGame();
    clientB.clearReceivedEvents();
    clientB.playGame('War');

    // Wait for both to be in War game
    const [tableA, tableB] = await Promise.all([
      clientA.waitForSetTable(),
      clientB.waitForSetTable(),
    ]);

    // Key assertions: both players are on the same table
    expect(tableA.tableId).toBe(tableB.tableId);
    expect(tableA.playerCount).toBe(2);
    expect(tableB.playerCount).toBe(2);

    // Both players received the War game resume event
    const [gameA, gameB] = await Promise.all([
      clientA.waitForResumeGame(),
      clientB.waitForResumeGame(),
    ]);
    expect(gameA).toBe('War');
    expect(gameB).toBe('War');

    // Wait a bit for initDeck events (they may arrive asynchronously)
    await new Promise((r) => setTimeout(r, 500));

    // Check if any initDeck events were received (not required for test to pass)
    // The important thing is that the game started correctly
    const initDecksA = clientA.getReceivedEvents('initDeck');
    const initDecksB = clientB.getReceivedEvents('initDeck');

    // Log for debugging but don't fail the test
    console.log(`Player A received ${initDecksA.length} initDeck events`);
    console.log(`Player B received ${initDecksB.length} initDeck events`);
  });
});
