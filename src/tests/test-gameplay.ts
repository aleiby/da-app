/**
 * Socket.io gameplay tests
 *
 * Tests game interaction flows including:
 * - Click events (deck, table, right-click)
 * - Chat messages and commands
 * - Redis pub/sub integration
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
    const subscriber = await createTestRedisClient();

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
    const subscriber = await createTestRedisClient();

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
    const subscriber = await createTestRedisClient();

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
    const subscriber = await createTestRedisClient();

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
