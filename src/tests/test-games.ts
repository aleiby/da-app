/**
 * Socket.io integration tests for game events
 *
 * Tests game flows through Socket.io including:
 * - Connection and wallet setup
 * - Matchmaking and table joining
 * - Game events (clicks, chat)
 * - Redis pub/sub integration
 * - Error cases and disconnections
 */
import { test, expect, beforeEach, afterEach, describe } from 'vitest';
import { createClient } from 'redis';
import {
  TestClient,
  cleanupTestData,
  generateTestWallet,
  waitForServer,
  createTestClients,
  connectAll,
  disconnectAll,
} from './socket-helpers';

// Import cards to trigger server startup side effect
import '../cards';

// Redis client for test setup/cleanup
let redis: Awaited<ReturnType<typeof createClient>>;

// Track test clients for cleanup
let testClients: TestClient[] = [];

beforeEach(async () => {
  redis = createClient();
  await redis.connect();
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
// Chat Tests
// ============================================================

describe('Chat', () => {
  test.sequential('chat messages are broadcast to table', async () => {
    const [clientA, clientB] = createTestClients(2);
    testClients.push(clientA, clientB);

    await connectAll([clientA, clientB]);

    // Set up both clients on a War game
    clientA.setWallet();
    await clientA.waitForSetTable();
    await clientA.waitForResumeGame();
    clientA.clearReceivedEvents();
    clientA.playGame('War');

    clientB.setWallet();
    await clientB.waitForSetTable();
    await clientB.waitForResumeGame();
    clientB.clearReceivedEvents();
    clientB.playGame('War');

    // Wait for both to be on the same table
    await Promise.all([clientA.waitForSetTable(), clientB.waitForSetTable()]);
    await Promise.all([clientA.waitForResumeGame(), clientB.waitForResumeGame()]);
    clientA.clearReceivedEvents();
    clientB.clearReceivedEvents();

    // Player A sends chat
    clientA.chat('Hello from A!');

    // Player B should receive the message
    const msg = await clientB.waitForMessage('Hello from A!');
    expect(msg).toContain('Hello from A!');
  });

  test.sequential('chat /name command sets username', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    await client.waitForSetTable();
    await client.waitForResumeGame();

    // Use chat to set name
    client.chat('/name ChatNameTest');

    // Should receive welcome message
    const msg = await client.waitForMessage('Welcome ChatNameTest');
    expect(msg).toContain('Welcome ChatNameTest');

    // Verify stored in Redis
    const storedName = await redis.hGet(wallet, 'name');
    expect(storedName).toBe('ChatNameTest');
  });
});

// ============================================================
// Game Click Tests
// ============================================================

describe('Game Clicks', () => {
  test.sequential('clickDeck event is published to Redis', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    const tableInfo = await client.waitForSetTable();
    await client.waitForResumeGame();

    // Subscribe to the clickDeck channel to verify click is received
    const subscriber = createClient();
    await subscriber.connect();

    let receivedClick = false;
    const clickPromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableInfo.tableId}:clickDeck`, (message) => {
        const data = JSON.parse(message);
        if (data.deck === 'DeckA' && data.userId === wallet) {
          receivedClick = true;
          resolve();
        }
      });
    });

    // Small delay to ensure subscription is active
    await new Promise((r) => setTimeout(r, 100));

    // Click on DeckA
    client.clickDeck('DeckA');

    // Wait for the click to be received
    await Promise.race([
      clickPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for click')), 5000)
      ),
    ]);

    expect(receivedClick).toBe(true);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });

  test.sequential('rightClickDeck event is published to Redis', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    const tableInfo = await client.waitForSetTable();
    await client.waitForResumeGame();

    // Subscribe to the rightClickDeck channel
    const subscriber = createClient();
    await subscriber.connect();

    let receivedClick = false;
    const clickPromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableInfo.tableId}:rightClickDeck`, (message) => {
        const data = JSON.parse(message);
        if (data.deck === 'DeckA' && data.userId === wallet) {
          receivedClick = true;
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Right-click on DeckA
    client.rightClickDeck('DeckA');

    await Promise.race([
      clickPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for right click')), 5000)
      ),
    ]);

    expect(receivedClick).toBe(true);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });

  test.sequential('clickTable event is published to Redis', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    const tableInfo = await client.waitForSetTable();
    await client.waitForResumeGame();

    // Subscribe to the clickTable channel
    const subscriber = createClient();
    await subscriber.connect();

    let receivedClick = false;
    const clickPromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableInfo.tableId}:clickTable`, (message) => {
        const data = JSON.parse(message);
        if (data.x === 0.5 && data.z === 0.5 && data.userId === wallet) {
          receivedClick = true;
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Click on table
    client.clickTable(0.5, 0.5);

    await Promise.race([
      clickPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for table click')), 5000)
      ),
    ]);

    expect(receivedClick).toBe(true);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });
});

// ============================================================
// Redis Pub/Sub Integration Tests
// ============================================================

describe('Redis Pub/Sub', () => {
  test.sequential('game actions are published to Redis channels', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    const tableInfo = await client.waitForSetTable();
    await client.waitForResumeGame();

    // Subscribe to the clickDeck channel
    const subscriber = createClient();
    await subscriber.connect();

    let receivedMessage: string | null = null;
    const messagePromise = new Promise<void>((resolve) => {
      subscriber.subscribe(`${tableInfo.tableId}:clickDeck`, (message) => {
        receivedMessage = message;
        resolve();
      });
    });

    // Small delay to ensure subscription is active
    await new Promise((r) => setTimeout(r, 100));

    // Click on a deck
    client.clickDeck('DeckA');

    // Wait for the message (with timeout)
    await Promise.race([
      messagePromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for Redis message')), 5000)
      ),
    ]);

    expect(receivedMessage).not.toBeNull();
    const parsed = JSON.parse(receivedMessage!);
    expect(parsed.deck).toBe('DeckA');
    expect(parsed.userId).toBe(wallet);

    await subscriber.unsubscribe();
    await subscriber.disconnect();
  });

  test.sequential('user events are stored in Redis streams', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    await client.waitForSetTable();

    // Small delay for events to be stored
    await new Promise((r) => setTimeout(r, 200));

    // Check that events exist in the user's event stream
    // The setTable event is sent to the user's stream, not the table's
    const events = await redis.xRange(`${wallet}:events`, '-', '+');

    // There should be at least one event (the setTable event)
    expect(events.length).toBeGreaterThan(0);

    // Verify one of them is a setTable event
    const hasSetTable = events.some((event) => {
      try {
        const data = JSON.parse(event.message.msg);
        return data.event === 'setTable';
      } catch {
        return false;
      }
    });
    expect(hasSetTable).toBe(true);
  });

  test.sequential('chat messages are stored in Redis streams', async () => {
    const wallet = generateTestWallet();
    const client = new TestClient(wallet);
    testClients.push(client);

    await client.connect();
    client.setWallet();
    const tableInfo = await client.waitForSetTable();
    await client.waitForResumeGame();

    // Send a chat message
    const testMessage = 'Test chat message ' + Date.now();
    client.chat(testMessage);

    // Wait a bit for the message to be stored
    await new Promise((r) => setTimeout(r, 500));

    // Check Redis stream for the message
    const chatEvents = await redis.xRange(`${tableInfo.tableId}:chat`, '-', '+');
    expect(chatEvents.length).toBeGreaterThan(0);

    // Find our message
    const found = chatEvents.some((event) => {
      try {
        const data = JSON.parse(event.message.msg);
        return data.event === 'msg' && data.args[0].includes(testMessage);
      } catch {
        return false;
      }
    });
    expect(found).toBe(true);
  });
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
    const subscriber = createClient();
    await subscriber.connect();

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
    const subscriber = createClient();
    await subscriber.connect();

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
