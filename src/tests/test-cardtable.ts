/**
 * Unit tests for cardtable.ts - requiredPlayers and getPlayerSeat
 *
 * requiredPlayers is a pure lookup function.
 * getPlayerSeat uses Redis (existing test infra).
 */
import { test, expect } from 'vitest';
import { getPlayerSeat, requiredPlayers } from '../cardtable';
import { createTestRedisClient } from './socket-helpers';

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
