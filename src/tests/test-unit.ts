/**
 * Unit tests for Digital Arcana
 *
 * These tests only require Redis - no Express/Socket.io server needed.
 * Imports are from redis.ts and cards.ts only (not server.ts).
 */
import { test, expect, beforeEach } from 'vitest';
import { initDeck, registerCards, getShuffledDeck, DeckContents, getDeckName } from '../cards';
import { totalCards } from '../tarot';
import { newTable, numPlayers, getPlayerSeat, requiredPlayers } from '../cardtable';
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
// tarot.ts tests - card generation and formatting
// ============================================================

import { allCards, minorArcana, minorCards, minorSuits, majorArcana, totalMinor } from '../tarot';

test('allCards returns exactly 78 cards', () => {
  const cards = allCards();
  expect(cards.length).toBe(78);
  expect(cards.length).toBe(totalCards);
});

test('allCards returns no duplicates', () => {
  const cards = allCards();
  const uniqueCards = new Set(cards);
  expect(uniqueCards.size).toBe(cards.length);
});

test('allCards contains exactly 56 minor arcana cards', () => {
  const cards = allCards();
  // Filter for minor arcana: contains '_of_' but excludes 'wheel_of_fortune' (major arcana)
  const minorArcanaCards = cards.filter(
    (card) => card.includes('_of_') && !majorArcana.includes(card)
  );
  expect(minorArcanaCards.length).toBe(56);
  expect(minorArcanaCards.length).toBe(totalMinor);
});

test('allCards contains all 4 suits with 14 cards each', () => {
  const cards = allCards();
  for (const suit of minorSuits) {
    const suitCards = cards.filter((card) => card.endsWith(`_of_${suit}`));
    expect(suitCards.length).toBe(14);
  }
});

test('allCards contains all 22 major arcana', () => {
  const cards = allCards();
  for (const major of majorArcana) {
    expect(cards).toContain(major);
  }
  const majorInDeck = cards.filter((card) => majorArcana.includes(card));
  expect(majorInDeck.length).toBe(22);
});

test('minorArcana formats card and suit correctly', () => {
  expect(minorArcana('ace', 'pentacles')).toBe('ace_of_pentacles');
  expect(minorArcana('king', 'swords')).toBe('king_of_swords');
  expect(minorArcana('page', 'cups')).toBe('page_of_cups');
});

test('minorArcana handles all card-suit combinations', () => {
  for (const card of minorCards) {
    for (const suit of minorSuits) {
      const result = minorArcana(card, suit);
      expect(result).toBe(`${card}_of_${suit}`);
      expect(result).toContain('_of_');
    }
  }
});

test('minorCards array has exactly 14 cards', () => {
  expect(minorCards.length).toBe(14);
});

test('minorSuits array has exactly 4 suits', () => {
  expect(minorSuits.length).toBe(4);
});

test('majorArcana array has exactly 22 cards', () => {
  expect(majorArcana.length).toBe(22);
});

// ============================================================
// getDeckName coordinate formatting tests
// ============================================================

test('getDeckName with positive coordinates', () => {
  expect(getDeckName(1.5, 2.5)).toBe('{1.50,2.50}');
});

test('getDeckName with negative coordinates', () => {
  expect(getDeckName(-1.5, -2.5)).toBe('{-1.50,-2.50}');
});

test('getDeckName with zero values', () => {
  expect(getDeckName(0, 0)).toBe('{0.00,0.00}');
});

test('getDeckName with very small decimals', () => {
  expect(getDeckName(0.001, 0.009)).toBe('{0.00,0.01}');
});

test('getDeckName with large numbers', () => {
  expect(getDeckName(12345.6789, 99999.9999)).toBe('{12345.68,100000.00}');
});

test('getDeckName with mixed positive and negative', () => {
  expect(getDeckName(-0.17, 0.02)).toBe('{-0.17,0.02}');
});

// ============================================================
// requiredPlayers tests
// ============================================================

test('requiredPlayers returns 2 for War', () => {
  expect(requiredPlayers('War')).toBe(2);
});

test('requiredPlayers returns 1 for Solitaire', () => {
  expect(requiredPlayers('Solitaire')).toBe(1);
});

test('requiredPlayers returns 1 for Browse', () => {
  expect(requiredPlayers('Browse')).toBe(1);
});

test('requiredPlayers returns 0 for unknown game', () => {
  expect(requiredPlayers('Unknown')).toBe(0);
});

// ============================================================
// getPlayerSeat tests (direct Redis setup)
// ============================================================

test('getPlayerSeat returns A for first player (slot 0)', async () => {
  const redis = await createTestRedisClient();
  const testTable = 'table:seat-test-1';
  await redis.del(`${testTable}:players`);
  await redis.zAdd(`${testTable}:players`, { score: 0, value: 'user1' });

  expect(await getPlayerSeat(testTable, 'user1')).toBe('A');

  await redis.del(`${testTable}:players`);
  await redis.disconnect();
});

test('getPlayerSeat returns B for second player (slot 1)', async () => {
  const redis = await createTestRedisClient();
  const testTable = 'table:seat-test-2';
  await redis.del(`${testTable}:players`);
  await redis.zAdd(`${testTable}:players`, [
    { score: 0, value: 'user1' },
    { score: 1, value: 'user2' },
  ]);

  expect(await getPlayerSeat(testTable, 'user2')).toBe('B');

  await redis.del(`${testTable}:players`);
  await redis.disconnect();
});

test('getPlayerSeat returns undefined for unknown player', async () => {
  const redis = await createTestRedisClient();
  const testTable = 'table:seat-test-3';
  await redis.del(`${testTable}:players`);
  await redis.zAdd(`${testTable}:players`, { score: 0, value: 'user1' });

  expect(await getPlayerSeat(testTable, 'unknown-user')).toBe('undefined');

  await redis.del(`${testTable}:players`);
  await redis.disconnect();
});
