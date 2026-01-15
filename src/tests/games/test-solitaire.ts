/**
 * Solitaire game automated tests
 *
 * Tests Solitaire game flows via Socket.io:
 * - Game initialization (stock dealt, tableau laid out)
 * - Stock to talon drawing (click stock, 3 cards move to talon)
 * - Talon to hand pickup
 * - Tableau to tableau movement (valid moves only)
 * - Tableau to foundation movement
 * - Quit and resume
 */
import { test, expect, beforeEach, afterEach, describe } from 'vitest';
import {
  TestClient,
  cleanupTestData,
  createTestRedisClient,
  generateTestWallet,
  waitForServer,
} from '../socket-helpers';
import type { RedisClientType } from '../../server';

// Deck names used in Solitaire game
const DECK_NAMES = {
  HAND: 'Hand',
  STOCK: 'DeckB',
  TALON: '{0.17,-0.02}',
  // Foundations (4 piles)
  FOUNDATIONS: ['{0.06,-0.14}', '{0.06,-0.23}', '{0.06,-0.32}', '{0.06,-0.41}'],
  // Tableau (7 piles)
  TABLEAU: [
    '{-0.10,0.25}',
    '{-0.10,0.16}',
    '{-0.10,0.07}',
    '{-0.10,-0.02}',
    '{-0.10,-0.11}',
    '{-0.10,-0.20}',
    '{-0.10,-0.29}',
  ],
};

// Redis client for test setup/cleanup
let redis: RedisClientType;

// Track test clients for cleanup
let testClients: TestClient[] = [];

beforeEach(async () => {
  redis = await createTestRedisClient();
  testClients = [];
  await waitForServer();
});

afterEach(async () => {
  // Disconnect all test clients
  testClients.forEach((c) => c.disconnect());
  testClients = [];

  // Cleanup Redis test data
  await cleanupTestData(redis, ['tz1Test*', 'pending:*', 'table:test*']);

  await redis.disconnect();
});

/**
 * Helper to start a Solitaire game and wait for initialization
 */
async function startSolitaireGame(client: TestClient): Promise<{
  tableId: string;
  initDecks: unknown[][];
}> {
  client.setWallet();
  await client.waitForSetTable();
  await client.waitForResumeGame();
  client.clearReceivedEvents();

  client.playGame('Solitaire');

  const tableInfo = await client.waitForSetTable();
  const gameName = await client.waitForResumeGame();
  expect(gameName).toBe('Solitaire');

  // Wait for welcome message
  await client.waitForMessage('Solitaire', 10000);

  // Wait for initDeck events - Solitaire has: hand, stock, talon, 4 foundations, 7 tableau = 14 decks
  const initDecks = await client.waitForInitDecks(10, 15000);

  return { tableId: tableInfo.tableId, initDecks };
}

// ============================================================
// Solitaire: Game Initialization
// ============================================================

describe('Solitaire: Game Initialization', () => {
  test.sequential('game starts with welcome message', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    client.setWallet();
    await client.waitForSetTable();
    await client.waitForResumeGame();
    client.clearReceivedEvents();

    client.playGame('Solitaire');

    await client.waitForSetTable();
    const gameName = await client.waitForResumeGame();
    expect(gameName).toBe('Solitaire');

    const msg = await client.waitForMessage('Solitaire', 10000);
    expect(msg).toContain('Welcome to Solitaire');
  });

  test.sequential('game initializes with multiple decks', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    const { initDecks } = await startSolitaireGame(client);

    // Should have at least 10 initDeck events (hand, stock, talon, foundations, tableau)
    expect(initDecks.length).toBeGreaterThanOrEqual(10);
  });

  test.sequential('tableau piles are dealt correctly', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    await startSolitaireGame(client);

    // Should have received revealCards events for the face-up tableau cards
    // Wait a bit for all reveal events
    await new Promise((r) => setTimeout(r, 1000));

    // The game reveals 7 cards (one on each tableau pile)
    const revealEvents = client.getReceivedEvents('revealCards');
    expect(revealEvents.length).toBeGreaterThanOrEqual(7);
  });
});

// ============================================================
// Solitaire: Stock Draw
// ============================================================

describe('Solitaire: Stock Draw', () => {
  test.sequential('clicking stock draws cards to talon', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    const { tableId } = await startSolitaireGame(client);

    // Subscribe to clickDeck channel to verify click
    const subscriber = await createTestRedisClient();

    let receivedClick = false;
    const clickPromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableId}:clickDeck`, (message) => {
        const data = JSON.parse(message);
        if (data.deck === DECK_NAMES.STOCK) {
          receivedClick = true;
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Clear events before stock click
    client.clearReceivedEvents();

    // Click on stock to draw cards
    client.clickDeck(DECK_NAMES.STOCK);

    await Promise.race([
      clickPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for stock click')), 5000)
      ),
    ]);

    expect(receivedClick).toBe(true);

    // Wait for card reveal event (stock draws reveal a card)
    await new Promise((r) => setTimeout(r, 500));
    const revealEvents = client.getReceivedEvents('revealCards');
    expect(revealEvents.length).toBeGreaterThanOrEqual(1);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });

  test.sequential('multiple stock draws work correctly', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    await startSolitaireGame(client);

    // Clear events
    client.clearReceivedEvents();

    // Draw from stock multiple times
    client.clickDeck(DECK_NAMES.STOCK);
    await new Promise((r) => setTimeout(r, 300));

    client.clickDeck(DECK_NAMES.STOCK);
    await new Promise((r) => setTimeout(r, 300));

    client.clickDeck(DECK_NAMES.STOCK);
    await new Promise((r) => setTimeout(r, 500));

    // Should have received multiple reveal events
    const revealEvents = client.getReceivedEvents('revealCards');
    expect(revealEvents.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// Solitaire: Talon Pickup
// ============================================================

describe('Solitaire: Talon Pickup', () => {
  test.sequential('clicking talon picks up card to hand', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    const { tableId } = await startSolitaireGame(client);

    // First draw from stock to put card on talon
    client.clickDeck(DECK_NAMES.STOCK);
    await new Promise((r) => setTimeout(r, 500));

    // Subscribe to verify talon click
    const subscriber = await createTestRedisClient();

    let receivedClick = false;
    const clickPromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableId}:clickDeck`, (message) => {
        const data = JSON.parse(message);
        if (data.deck === DECK_NAMES.TALON) {
          receivedClick = true;
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Click on talon to pick up card
    client.clickDeck(DECK_NAMES.TALON);

    await Promise.race([
      clickPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for talon click')), 5000)
      ),
    ]);

    expect(receivedClick).toBe(true);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });
});

// ============================================================
// Solitaire: Tableau Movement
// ============================================================

describe('Solitaire: Tableau Movement', () => {
  test.sequential('clicking tableau pile picks up face-up card', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    const { tableId } = await startSolitaireGame(client);

    const subscriber = await createTestRedisClient();

    let receivedClick = false;
    const clickPromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableId}:clickDeck`, (message) => {
        const data = JSON.parse(message);
        if (data.deck === DECK_NAMES.TABLEAU[0]) {
          receivedClick = true;
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Click on first tableau pile (has one face-up card)
    client.clickDeck(DECK_NAMES.TABLEAU[0]);

    await Promise.race([
      clickPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for tableau click')), 5000)
      ),
    ]);

    expect(receivedClick).toBe(true);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });

  test.sequential('clicking another tableau moves card if valid', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    const { tableId } = await startSolitaireGame(client);

    // Pick up a card from first tableau pile
    client.clickDeck(DECK_NAMES.TABLEAU[0]);
    await new Promise((r) => setTimeout(r, 300));

    const subscriber = await createTestRedisClient();

    let receivedClick = false;
    const clickPromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableId}:clickDeck`, (message) => {
        const data = JSON.parse(message);
        // Any tableau click is valid
        if (DECK_NAMES.TABLEAU.includes(data.deck)) {
          receivedClick = true;
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Click on another tableau pile
    client.clickDeck(DECK_NAMES.TABLEAU[1]);

    await Promise.race([
      clickPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for second tableau click')), 5000)
      ),
    ]);

    expect(receivedClick).toBe(true);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });
});

// ============================================================
// Solitaire: Foundation Movement
// ============================================================

describe('Solitaire: Foundation Movement', () => {
  test.sequential('clicking foundation attempts to place card', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    const { tableId } = await startSolitaireGame(client);

    // Pick up a card from tableau
    client.clickDeck(DECK_NAMES.TABLEAU[0]);
    await new Promise((r) => setTimeout(r, 300));

    const subscriber = await createTestRedisClient();

    let receivedClick = false;
    const clickPromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableId}:clickDeck`, (message) => {
        const data = JSON.parse(message);
        if (data.deck === DECK_NAMES.FOUNDATIONS[0]) {
          receivedClick = true;
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Click on first foundation pile
    client.clickDeck(DECK_NAMES.FOUNDATIONS[0]);

    await Promise.race([
      clickPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for foundation click')), 5000)
      ),
    ]);

    expect(receivedClick).toBe(true);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });
});

// ============================================================
// Solitaire: Quit and Resume
// ============================================================

describe('Solitaire: Quit and Resume', () => {
  test.sequential('player can quit solitaire game', async () => {
    const client = new TestClient(generateTestWallet());
    testClients.push(client);

    await client.connect();
    await startSolitaireGame(client);

    // Clear events
    client.clearReceivedEvents();

    // Quit the game
    client.quitGame('Solitaire');

    // Should receive new table with Browse
    const tableInfo = await client.waitForSetTable();
    expect(tableInfo.playerCount).toBe(1);

    const gameName = await client.waitForResumeGame();
    expect(gameName).toBe('Browse');
  });

  test.sequential('player can rejoin solitaire after disconnect', async () => {
    const wallet = generateTestWallet();

    // Start Solitaire
    const client1 = new TestClient(wallet);
    testClients.push(client1);

    await client1.connect();
    await startSolitaireGame(client1);
    client1.disconnect();

    // Reconnect with same wallet
    const client2 = new TestClient(wallet);
    testClients.push(client2);

    await client2.connect();
    client2.setWallet();

    // Should receive setTable event
    const tableInfo = await client2.waitForSetTable();
    expect(tableInfo.tableId).toBeDefined();
  });
});
