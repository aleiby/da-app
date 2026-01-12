/**
 * War game automated tests
 *
 * Tests War game flows via Socket.io:
 * - Chat commands (Bye exit)
 * - Player disconnect handling
 * - Game mechanics
 */
import { test, expect, beforeEach, afterEach, describe } from 'vitest';
import { createClient } from 'redis';
import {
  TestClient,
  cleanupTestData,
  createTestClients,
  connectAll,
  disconnectAll,
  waitForServer,
} from '../socket-helpers';

// Import cards to trigger server startup side effect
import '../../cards';

// Redis client for test setup/cleanup
let redis: Awaited<ReturnType<typeof createClient>>;

// Track test clients for cleanup
let testClients: TestClient[] = [];

beforeEach(async () => {
  redis = createClient();
  await redis.connect();
  testClients = [];
  await waitForServer();
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
// War: Chat Commands
// ============================================================

describe('War: Chat Commands', () => {
  test.sequential('Bye chat message is received by other player', async () => {
    const [clientA, clientB] = createTestClients(2);
    testClients.push(clientA, clientB);

    await connectAll([clientA, clientB]);

    // Set up player A
    clientA.setWallet();
    await clientA.waitForSetTable();
    await clientA.waitForResumeGame();
    clientA.clearReceivedEvents();
    clientA.playGame('War');

    // Set up player B
    clientB.setWallet();
    await clientB.waitForSetTable();
    await clientB.waitForResumeGame();
    clientB.clearReceivedEvents();
    clientB.playGame('War');

    // Wait for both to be on the same War table
    const [tableA, tableB] = await Promise.all([
      clientA.waitForSetTable(),
      clientB.waitForSetTable(),
    ]);
    expect(tableA.tableId).toBe(tableB.tableId);
    expect(tableA.playerCount).toBe(2);

    // Wait for War game to start
    const [gameA, gameB] = await Promise.all([
      clientA.waitForResumeGame(),
      clientB.waitForResumeGame(),
    ]);
    expect(gameA).toBe('War');
    expect(gameB).toBe('War');

    // Clear events before chat test
    clientA.clearReceivedEvents();
    clientB.clearReceivedEvents();

    // Player A says Bye
    clientA.chat('Bye');

    // Player B should receive the Bye message
    const msg = await clientB.waitForMessage('Bye');
    expect(msg).toContain('Bye');

    // Both players should still be connected (Bye is informational, not a disconnect)
    expect(clientA.isConnected).toBe(true);
    expect(clientB.isConnected).toBe(true);
  });
});
