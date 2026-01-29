/**
 * Deck operation tests for Digital Arcana
 *
 * Tests deck initialization, card registration, movement, and shuffling.
 * Requires Redis - no Express/Socket.io server needed.
 */
import { test, expect, beforeEach } from 'vitest';
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
// War game deck size tests
// ============================================================

test('War game deck size: each player gets exactly 20 cards', async () => {
  // Verify getShuffledDeck with limit=20 returns exactly 20 cards
  // This tests the same configuration used by the War game's WAR_DECK_SIZE constant
  const playerACards = await getShuffledDeck('tz1TestPlayerA', DeckContents.AllCards, 20);
  const playerBCards = await getShuffledDeck('tz1TestPlayerB', DeckContents.AllCards, 20);

  expect(playerACards.length).toBe(20);
  expect(playerBCards.length).toBe(20);
});

test('War game deck: cards are randomly selected from full tarot deck', async () => {
  // Get two decks with same parameters
  const deck1 = await getShuffledDeck('tz1TestPlayerA', DeckContents.AllCards, 20);
  const deck2 = await getShuffledDeck('tz1TestPlayerB', DeckContents.AllCards, 20);

  // Cards should be different between players (shuffled randomly)
  const values1 = deck1.map((c) => c.value).sort((a, b) => a - b);
  const values2 = deck2.map((c) => c.value).sort((a, b) => a - b);

  // It's extremely unlikely (but not impossible) that two random 20-card selections
  // from a 78-card deck would be identical. If they're the same, the shuffle isn't working.
  const areIdentical = values1.every((v, i) => v === values2[i]);
  expect(areIdentical).toBe(false);
});
