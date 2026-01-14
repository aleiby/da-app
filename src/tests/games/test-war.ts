/**
 * War game automated tests
 *
 * Tests War game flows via Socket.io:
 * - Chat commands (Bye exit)
 * - Player disconnect handling
 * - Game mechanics
 * - Game completion with small decks
 */
import { test, expect, beforeEach, afterEach, describe, vi } from 'vitest';
import { createClient } from 'redis';
import {
  TestClient,
  cleanupTestData,
  createTestClients,
  connectAll,
  disconnectAll,
  waitForServer,
} from '../socket-helpers';

// Import cards module for mocking
import * as cardsModule from '../../cards';

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

// ============================================================
// War: Game Completion (Small Deck)
// ============================================================

describe('War: Game Completion', () => {
  test.sequential('game completes with small deck (2 cards each)', async () => {
    // Mock getShuffledDeck to use limit parameter for small deck
    const originalGetShuffledDeck = cardsModule.getShuffledDeck;
    const getShuffledDeckSpy = vi
      .spyOn(cardsModule, 'getShuffledDeck')
      .mockImplementation(async (walletAddress, contents = cardsModule.DeckContents.AllCards) => {
        // Use limit=2 for fast game completion
        return originalGetShuffledDeck(walletAddress, contents, 2);
      });

    try {
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

      // Verify mock was called (2 players = 2 calls)
      expect(getShuffledDeckSpy).toHaveBeenCalledTimes(2);

      // Wait for deck initialization (6 decks: DeckA, DeckB, PlayedA, PlayedB, WonA, WonB)
      await clientA.waitForInitDecks(6, 10000);

      // Get deck names from the init events
      const deckEvents = clientA.getReceivedEvents('initDeck');
      const deckKeys = deckEvents.map((e) => e[0] as string);

      // Find the player deck keys (contain 'DeckA' or 'DeckB')
      const deckAKey = deckKeys.find((k) => k.includes(':deck:DeckA'));
      const deckBKey = deckKeys.find((k) => k.includes(':deck:DeckB'));
      expect(deckAKey).toBeDefined();
      expect(deckBKey).toBeDefined();

      // Play rounds until game completes (with 2 cards each, max 4 rounds)
      // Each round: both players click their deck, cards are played, winner takes cards
      clientA.clearReceivedEvents();
      clientB.clearReceivedEvents();

      let roundsPlayed = 0;
      const maxRounds = 10; // Safety limit

      while (roundsPlayed < maxRounds) {
        // Both players click their decks
        clientA.clickDeck(deckAKey!);
        clientB.clickDeck(deckBKey!);

        // Wait for round result message
        try {
          const msg = await clientA.waitForMessage('wins round', 5000);
          expect(msg).toContain('wins round');
          roundsPlayed++;
        } catch {
          // Could be a tie or game over
          try {
            await clientA.waitForMessage("It's a tie!", 1000);
            roundsPlayed++;
          } catch {
            // No more cards to play - game should be over
            break;
          }
        }
      }

      // Game should complete within expected rounds
      expect(roundsPlayed).toBeGreaterThan(0);
      expect(roundsPlayed).toBeLessThanOrEqual(maxRounds);
    } finally {
      // Restore original implementation
      getShuffledDeckSpy.mockRestore();
    }
  });
});
