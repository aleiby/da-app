/**
 * Unit tests for cards.ts - getDeckName coordinate formatting
 *
 * Pure function, no dependencies.
 */
import { test, expect } from 'vitest';
import { getDeckName } from '../cards';

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
