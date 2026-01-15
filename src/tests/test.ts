/**
 * Test suite for Digital Arcana
 *
 * Server startup: This file has both unit tests (Redis-only) and integration tests
 * (require Express/Socket.io server). We import server.ts to start the server for
 * the integration tests at the bottom of this file.
 *
 * Note: cards.ts now imports from redis.ts (not server.ts), so the old import chain
 * no longer triggers server startup. We explicitly import server.ts for that.
 */
import { test, expect, beforeEach } from 'vitest';
import '../server'; // Start server for integration tests
import { initDeck, registerCards, getShuffledDeck, DeckContents } from '../cards';
import { totalCards } from '../tarot';
import { newTable, numPlayers, getPlayerSeat } from '../cardtable';
import { createTestRedisClient } from './socket-helpers';

const tableId = 'table:test';

beforeEach(async () => {
  const redis = await createTestRedisClient();
  // Redis 5.x: use KEYS command for test cleanup (acceptable in test environment)
  const keys = await redis.keys(`${tableId}*`);
  if (keys.length > 0) {
    await redis.del(keys as string[]);
  }
  await redis.disconnect();
});

test('redis connection', async () => {
  const redis = await createTestRedisClient();
  console.log(await redis.info('Server'));
  await redis.disconnect();
});

test('init deck', async () => {
  const deck = await initDeck(tableId, 'test');
  expect(deck).toBeTruthy();
});

test('num cards', async () => {
  const deck = await initDeck(tableId, 'test');
  const cards = await registerCards([1, 2, 3]);
  deck.add(cards);
  expect(await deck.numCards()).toBe(cards.length);
});

test('move cards', async () => {
  const [deckA, deckB] = await Promise.all([
    initDeck(tableId, 'deckA'),
    initDeck(tableId, 'deckB'),
  ]);
  expect([deckA, deckB].every(Boolean)).toBe(true);
  deckA.add(await registerCards([1, 2, 3]));
  deckB.add(await registerCards([4, 5, 6]));
  deckB.moveAll(deckA);
  expect(await deckB.drawCard(deckA)).toBeNull();

  const verifyCard = async (value: number | null) => {
    const card = await deckA.drawCard(deckB);
    const actualValue = card ? card.value : null;
    if (actualValue !== value) {
      console.log({ card });
    }
    expect(actualValue).toBe(value);
  };

  await Promise.all([1, 2, 3, 4, 5, 6, null].map((value) => verifyCard(value)));
});

test('add cards to start', async () => {
  const deck = await initDeck(tableId, 'test-add-start');
  const cards = await registerCards([1, 2, 3]);
  deck.add([cards[0]], true);
  deck.add([cards[1]]);
  deck.add([cards[2]], true);

  const verifyCard = async (value: number) => {
    const card = await deck.drawCard(deck);
    expect(card?.value).toBe(value);
  };

  await Promise.all([3, 1, 2].map((value) => verifyCard(value)));
});

test('peek cards', async () => {
  const deck = await initDeck(tableId, 'test-peek');
  const cards = await registerCards([1, 2, 3]);
  expect(await deck.peekId()).toBeNull();
  deck.add(cards);
  expect(await deck.peekId()).toBe(cards[0].id);
  deck.move([cards[1]], deck, true);
  expect(await deck.peekId()).toBe(cards[1].id);
  await Promise.all([deck.drawCard(deck), deck.drawCard(deck)]);
  const card = await deck.peekCard();
  expect(card).toMatchObject(cards[2]);
});

test('flip card', async () => {
  const deck = await initDeck(tableId, 'test-flip');
  const cards = await registerCards([1, 2, 3]);
  deck.add(cards);
  expect(await deck.areFlipped(cards).then((flipped) => flipped.some(Boolean))).toBe(false);
  deck.flip([cards[0]]); // just the first
  expect(await deck.isFlipped(cards[0])).toBe(true);
  deck.flip(cards); // mixed flip
  expect(await deck.isFlipped(cards[0])).toBe(false);
  expect(await deck.areFlipped(cards.slice(-2)).then((flipped) => flipped.every(Boolean))).toBe(
    true
  );
});

test('players', async () => {
  const userIds = ['PlayerA', 'PlayerB'];
  const tableId = await newTable(userIds);
  expect(await numPlayers(tableId)).toBe(2);
  const [seatA, seatB] = await Promise.all(userIds.map((userId) => getPlayerSeat(tableId, userId)));
  expect(seatA).toBe('A');
  expect(seatB).toBe('B');
  expect(await getPlayerSeat(tableId, 'PlayerC')).not.toBe('C');
});

// ============================================================
// getShuffledDeck limit parameter tests
// ============================================================

test('getShuffledDeck with limit returns exactly that many cards', async () => {
  const cards = await getShuffledDeck('tz1TestWallet', DeckContents.AllCards, 5);
  expect(cards.length).toBe(5);
});

test('getShuffledDeck with limit=10 returns 10 cards', async () => {
  const cards = await getShuffledDeck('tz1TestWallet', DeckContents.AllCards, 10);
  expect(cards.length).toBe(10);
});

test('getShuffledDeck without limit returns full deck', async () => {
  const cards = await getShuffledDeck('tz1TestWallet', DeckContents.AllCards);
  expect(cards.length).toBe(totalCards);
});

test('getShuffledDeck with limit=0 returns full deck', async () => {
  // limit=0 is treated as "no limit" due to the > 0 check
  const cards = await getShuffledDeck('tz1TestWallet', DeckContents.AllCards, 0);
  expect(cards.length).toBe(totalCards);
});

test('getShuffledDeck with limit > deck size returns full deck', async () => {
  // Requesting more cards than exist should return all available cards
  const cards = await getShuffledDeck('tz1TestWallet', DeckContents.AllCards, 9999);
  expect(cards.length).toBe(totalCards);
});

test('getShuffledDeck with limit works for MinorOnly deck', async () => {
  const cards = await getShuffledDeck('tz1TestWallet', DeckContents.MinorOnly, 3);
  expect(cards.length).toBe(3);
});

test('getShuffledDeck with limit works for MajorOnly deck', async () => {
  const cards = await getShuffledDeck('tz1TestWallet', DeckContents.MajorOnly, 5);
  expect(cards.length).toBe(5);
});

// ============================================================
// Server Integration Tests
// These tests verify the Express server and Socket.io endpoints
// ============================================================

import { io as ioClient, Socket } from 'socket.io-client';
import { PORT } from '../redis';

const SERVER_URL = `http://localhost:${PORT}`;

// Helper to wait for server to be ready
async function waitForServer(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      const response = await fetch(`${SERVER_URL}/ping`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

test.sequential('server /ping endpoint responds', async () => {
  const ready = await waitForServer();
  expect(ready).toBe(true);

  const response = await fetch(`${SERVER_URL}/ping`);
  const text = await response.text();
  expect(text).toBe('pong');
});

test.sequential('Socket.io default namespace accepts connections', async () => {
  await new Promise<void>((resolve, reject) => {
    const socket: Socket = ioClient(SERVER_URL, {
      transports: ['websocket'],
      timeout: 5000,
    });

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Connection timeout'));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.close();
      resolve();
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });
  });
});

test.sequential('Socket.io /browser namespace accepts connections', async () => {
  await new Promise<void>((resolve, reject) => {
    const socket: Socket = ioClient(`${SERVER_URL}/browser`, {
      transports: ['websocket'],
      timeout: 5000,
    });

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Connection timeout'));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.close();
      resolve();
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });
  });
});

test.sequential('Socket.io /browser namespace emits isDevelopment flag', async () => {
  await new Promise<void>((resolve, reject) => {
    const socket: Socket = ioClient(`${SERVER_URL}/browser`, {
      transports: ['websocket'],
      timeout: 5000,
    });

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('isDevelopment event not received'));
    }, 5000);

    socket.on('isDevelopment', (isDev: boolean) => {
      clearTimeout(timeout);
      expect(isDev).toBe(true);
      socket.close();
      resolve();
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });
  });
});

// ============================================================
// Port Range Validation Tests
// These verify that the server rejects invalid PORT values
// ============================================================

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

test('server rejects PORT below valid range (3000)', async () => {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

  const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = spawn('npx', ['tsx', join(projectRoot, 'src/server.ts')], {
      env: { ...process.env, PORT: '3000' },
      cwd: projectRoot,
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Also capture stdout in case error goes there
    child.stdout.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stderr });
    });

    // Kill after timeout to avoid hanging
    setTimeout(() => child.kill(), 5000);
  });

  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('PORT must be in range 3001-3016');
});

test('server rejects PORT above valid range (3017)', async () => {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

  const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = spawn('npx', ['tsx', join(projectRoot, 'src/server.ts')], {
      env: { ...process.env, PORT: '3017' },
      cwd: projectRoot,
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.stdout.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stderr });
    });

    setTimeout(() => child.kill(), 5000);
  });

  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('PORT must be in range 3001-3016');
});
