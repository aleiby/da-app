/**
 * Unit tests for random.ts
 *
 * Pure function tests - no Redis or server dependencies.
 */
import { test, expect, describe } from 'vitest';
import { xmur3, sfc32, sfc32_max, randrange } from '../random';

describe('xmur3', () => {
  test('same input produces consistent output (deterministic)', () => {
    const seed1 = xmur3('test-seed');
    const seed2 = xmur3('test-seed');

    // Both should produce identical sequences
    const results1 = [seed1(), seed1(), seed1()];
    const results2 = [seed2(), seed2(), seed2()];

    expect(results1).toEqual(results2);
  });

  test('different inputs produce different outputs', () => {
    const seed1 = xmur3('seed-a');
    const seed2 = xmur3('seed-b');

    // Different seeds should produce different first values
    expect(seed1()).not.toBe(seed2());
  });

  test('returns unsigned 32-bit integers', () => {
    const seed = xmur3('test');
    for (let i = 0; i < 100; i++) {
      const value = seed();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(sfc32_max);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  test('empty string edge case produces valid output', () => {
    const seed = xmur3('');
    const value = seed();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(sfc32_max);
  });
});

describe('sfc32', () => {
  test('same seeds produce consistent output (deterministic)', () => {
    const rand1 = sfc32(1, 2, 3, 4);
    const rand2 = sfc32(1, 2, 3, 4);

    // Both should produce identical sequences
    const results1 = [rand1(), rand1(), rand1(), rand1(), rand1()];
    const results2 = [rand2(), rand2(), rand2(), rand2(), rand2()];

    expect(results1).toEqual(results2);
  });

  test('different seeds produce different outputs', () => {
    const rand1 = sfc32(1, 2, 3, 4);
    const rand2 = sfc32(5, 6, 7, 8);

    // Different seeds should produce different sequences
    const results1 = [rand1(), rand1(), rand1()];
    const results2 = [rand2(), rand2(), rand2()];

    expect(results1).not.toEqual(results2);
  });

  test('returns unsigned 32-bit integers', () => {
    const rand = sfc32(100, 200, 300, 400);
    for (let i = 0; i < 100; i++) {
      const value = rand();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(sfc32_max);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  test('produces varied output over multiple calls', () => {
    const rand = sfc32(42, 42, 42, 42);
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) {
      values.add(rand());
    }
    // Should have many unique values (not stuck or cycling quickly)
    expect(values.size).toBeGreaterThan(90);
  });

  test('zero seeds produce valid output', () => {
    const rand = sfc32(0, 0, 0, 0);
    // Even with all-zero seeds, counter increments so we get output
    const value = rand();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(sfc32_max);
  });
});

describe('randrange', () => {
  test('respects boundaries', () => {
    const rand = sfc32(1, 2, 3, 4);
    const getRange = randrange(5, 10, rand);

    for (let i = 0; i < 100; i++) {
      const value = getRange();
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  test('equal min/max returns that value', () => {
    const rand = sfc32(1, 2, 3, 4);
    const getRange = randrange(7, 7, rand);

    for (let i = 0; i < 10; i++) {
      expect(getRange()).toBe(7);
    }
  });

  test('reversed range gets corrected (a > b swaps them)', () => {
    const rand1 = sfc32(1, 2, 3, 4);
    const rand2 = sfc32(1, 2, 3, 4);

    const getRange1 = randrange(10, 5, rand1); // reversed
    const getRange2 = randrange(5, 10, rand2); // normal

    // Both should produce the same values since they use identical rand functions
    for (let i = 0; i < 10; i++) {
      expect(getRange1()).toBe(getRange2());
    }
  });

  test('covers the full range over many iterations', () => {
    const rand = sfc32(42, 43, 44, 45);
    const getRange = randrange(1, 6, rand);
    const seen = new Set<number>();

    for (let i = 0; i < 1000; i++) {
      seen.add(getRange());
    }

    // Should have seen all values from 1 to 6
    expect(seen.size).toBe(6);
    for (let v = 1; v <= 6; v++) {
      expect(seen.has(v)).toBe(true);
    }
  });

  test('works with negative ranges', () => {
    const rand = sfc32(1, 2, 3, 4);
    const getRange = randrange(-5, -1, rand);

    for (let i = 0; i < 50; i++) {
      const value = getRange();
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThanOrEqual(-1);
    }
  });

  test('works with range crossing zero', () => {
    const rand = sfc32(1, 2, 3, 4);
    const getRange = randrange(-3, 3, rand);

    for (let i = 0; i < 50; i++) {
      const value = getRange();
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(3);
    }
  });
});
