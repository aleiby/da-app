/**
 * Unit tests for War rarity tiebreaker and card comparison functions
 *
 * Tests the new functions added in da-1nw:
 * - getLotPriority() - lot code to priority value mapping
 * - getValue() - card face value calculation
 * - compareCards() - async card comparison with rarity tiebreaking
 */
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import {
  LOT_PRIORITY,
  getLotPriority,
  getValue,
  compareCards,
} from '../../games/war';
import type { Card } from '../../cards';
import * as metadataService from '../../metadata-service';
import { totalMinor, minorCards } from '../../tarot';

// Helper to create a mock card with specific values
function createMockCard(value: number, id: number = 1): Card {
  return {
    id,
    value,
    token_id: id * 1000,
    ipfsUri: `ipfs://test/card${id}.json`,
  };
}

// ============================================================
// LOT_PRIORITY constant
// ============================================================

describe('LOT_PRIORITY constant', () => {
  test('defines priority 4 for spdp (rarest)', () => {
    expect(LOT_PRIORITY.spdp).toBe(4);
  });

  test('defines priority 3 for eifd', () => {
    expect(LOT_PRIORITY.eifd).toBe(3);
  });

  test('defines priority 2 for lnuy', () => {
    expect(LOT_PRIORITY.lnuy).toBe(2);
  });

  test('defines priority 1 for hrgl (common)', () => {
    expect(LOT_PRIORITY.hrgl).toBe(1);
  });

  test('has exactly 4 lot codes', () => {
    expect(Object.keys(LOT_PRIORITY)).toHaveLength(4);
  });
});

// ============================================================
// getLotPriority()
// ============================================================

describe('getLotPriority()', () => {
  test('returns 4 for spdp (rarest)', () => {
    expect(getLotPriority('spdp')).toBe(4);
  });

  test('returns 3 for eifd', () => {
    expect(getLotPriority('eifd')).toBe(3);
  });

  test('returns 2 for lnuy', () => {
    expect(getLotPriority('lnuy')).toBe(2);
  });

  test('returns 1 for hrgl (common)', () => {
    expect(getLotPriority('hrgl')).toBe(1);
  });

  test('returns 0 for unknown lot code', () => {
    expect(getLotPriority('unknown')).toBe(0);
    expect(getLotPriority('xyz')).toBe(0);
  });

  test('returns 0 for empty string (loaner card)', () => {
    expect(getLotPriority('')).toBe(0);
  });
});

// ============================================================
// getValue()
// ============================================================

describe('getValue()', () => {
  // totalMinor = 14 * 4 = 56 (minor arcana indices 0-55)
  // minorCards.length = 14 (ace through king)

  describe('minor arcana (values 0-55)', () => {
    test('returns face value for first suit (pentacles, values 0-13)', () => {
      // Pentacles: values 0-13, face values 0-13
      for (let i = 0; i < minorCards.length; i++) {
        const card = createMockCard(i);
        expect(getValue(card)).toBe(i);
      }
    });

    test('returns face value for second suit (swords, values 14-27)', () => {
      // Swords: values 14-27, face values 0-13
      for (let i = 0; i < minorCards.length; i++) {
        const card = createMockCard(14 + i);
        expect(getValue(card)).toBe(i);
      }
    });

    test('returns face value for third suit (wands, values 28-41)', () => {
      // Wands: values 28-41, face values 0-13
      for (let i = 0; i < minorCards.length; i++) {
        const card = createMockCard(28 + i);
        expect(getValue(card)).toBe(i);
      }
    });

    test('returns face value for fourth suit (cups, values 42-55)', () => {
      // Cups: values 42-55, face values 0-13
      for (let i = 0; i < minorCards.length; i++) {
        const card = createMockCard(42 + i);
        expect(getValue(card)).toBe(i);
      }
    });

    test('ace of any suit has face value 0', () => {
      expect(getValue(createMockCard(0))).toBe(0); // ace of pentacles
      expect(getValue(createMockCard(14))).toBe(0); // ace of swords
      expect(getValue(createMockCard(28))).toBe(0); // ace of wands
      expect(getValue(createMockCard(42))).toBe(0); // ace of cups
    });

    test('king of any suit has face value 13', () => {
      expect(getValue(createMockCard(13))).toBe(13); // king of pentacles
      expect(getValue(createMockCard(27))).toBe(13); // king of swords
      expect(getValue(createMockCard(41))).toBe(13); // king of wands
      expect(getValue(createMockCard(55))).toBe(13); // king of cups
    });
  });

  describe('major arcana (values 56-77)', () => {
    test('returns full value for major arcana (not modulo)', () => {
      // Major arcana: values 56-77, should return the full value
      for (let i = 56; i <= 77; i++) {
        const card = createMockCard(i);
        expect(getValue(card)).toBe(i);
      }
    });

    test('the_fool (value 56) beats all minor arcana', () => {
      const fool = getValue(createMockCard(56));
      const king = getValue(createMockCard(13)); // king has highest minor face value (13)
      expect(fool).toBeGreaterThan(king);
    });

    test('the_world (value 77) beats all other cards', () => {
      const world = getValue(createMockCard(77));
      expect(world).toBe(77);
      // Higher than any minor (max 13) or other major
      expect(world).toBeGreaterThan(getValue(createMockCard(76)));
    });
  });

  describe('boundary cases', () => {
    test('value 55 is last minor arcana (king of cups)', () => {
      expect(55).toBeLessThan(totalMinor);
      expect(getValue(createMockCard(55))).toBe(13);
    });

    test('value 56 is first major arcana (the_fool)', () => {
      expect(56).toBe(totalMinor);
      expect(getValue(createMockCard(56))).toBe(56);
    });
  });
});

// ============================================================
// compareCards()
// ============================================================

describe('compareCards()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('face value comparison (no tie)', () => {
    test('returns 1 when cardA has higher face value', async () => {
      const cardA = createMockCard(13, 1); // king (face 13)
      const cardB = createMockCard(0, 2); // ace (face 0)

      const result = await compareCards(cardA, cardB);
      expect(result).toBe(1);
    });

    test('returns -1 when cardB has higher face value', async () => {
      const cardA = createMockCard(0, 1); // ace (face 0)
      const cardB = createMockCard(13, 2); // king (face 13)

      const result = await compareCards(cardA, cardB);
      expect(result).toBe(-1);
    });

    test('major arcana beats minor arcana', async () => {
      const cardA = createMockCard(56, 1); // the_fool (major)
      const cardB = createMockCard(13, 2); // king of pentacles (minor)

      const result = await compareCards(cardA, cardB);
      expect(result).toBe(1);
    });

    test('higher major arcana beats lower major arcana', async () => {
      const cardA = createMockCard(77, 1); // the_world
      const cardB = createMockCard(56, 2); // the_fool

      const result = await compareCards(cardA, cardB);
      expect(result).toBe(1);
    });

    test('same card value from different suits have same face value', async () => {
      // Two kings from different suits should tie in face value
      const cardA = createMockCard(13, 1); // king of pentacles
      const cardB = createMockCard(27, 2); // king of swords

      // Mock requireLot for the tie case
      vi.spyOn(metadataService, 'requireLot').mockResolvedValue('hrgl');

      const result = await compareCards(cardA, cardB);
      // Same face value AND same rarity -> true tie
      expect(result).toBe(0);
    });
  });

  describe('rarity tiebreaker (face value tie)', () => {
    test('cardA wins when it has higher rarity', async () => {
      const cardA = createMockCard(13, 1); // king
      const cardB = createMockCard(27, 2); // king (same face value)

      vi.spyOn(metadataService, 'requireLot')
        .mockResolvedValueOnce('spdp') // cardA: rarest (priority 4)
        .mockResolvedValueOnce('hrgl'); // cardB: common (priority 1)

      const result = await compareCards(cardA, cardB);
      expect(result).toBe(1);
    });

    test('cardB wins when it has higher rarity', async () => {
      const cardA = createMockCard(13, 1); // king
      const cardB = createMockCard(27, 2); // king (same face value)

      vi.spyOn(metadataService, 'requireLot')
        .mockResolvedValueOnce('hrgl') // cardA: common (priority 1)
        .mockResolvedValueOnce('spdp'); // cardB: rarest (priority 4)

      const result = await compareCards(cardA, cardB);
      expect(result).toBe(-1);
    });

    test('returns 0 when face value and rarity are equal', async () => {
      const cardA = createMockCard(13, 1); // king
      const cardB = createMockCard(27, 2); // king (same face value)

      vi.spyOn(metadataService, 'requireLot')
        .mockResolvedValueOnce('eifd') // cardA: priority 3
        .mockResolvedValueOnce('eifd'); // cardB: priority 3 (same)

      const result = await compareCards(cardA, cardB);
      expect(result).toBe(0);
    });

    test('unknown lot (priority 0) loses to known lot', async () => {
      const cardA = createMockCard(13, 1);
      const cardB = createMockCard(27, 2);

      vi.spyOn(metadataService, 'requireLot')
        .mockResolvedValueOnce('unknown') // cardA: unknown (priority 0)
        .mockResolvedValueOnce('hrgl'); // cardB: common (priority 1)

      const result = await compareCards(cardA, cardB);
      expect(result).toBe(-1);
    });

    test('empty lot (loaner card) loses to known lot', async () => {
      const cardA = createMockCard(13, 1);
      const cardB = createMockCard(27, 2);

      vi.spyOn(metadataService, 'requireLot')
        .mockResolvedValueOnce('') // cardA: loaner (priority 0)
        .mockResolvedValueOnce('hrgl'); // cardB: common (priority 1)

      const result = await compareCards(cardA, cardB);
      expect(result).toBe(-1);
    });

    test('two unknown lots result in true tie', async () => {
      const cardA = createMockCard(13, 1);
      const cardB = createMockCard(27, 2);

      vi.spyOn(metadataService, 'requireLot')
        .mockResolvedValueOnce('mystery') // cardA: unknown (priority 0)
        .mockResolvedValueOnce('other'); // cardB: unknown (priority 0)

      const result = await compareCards(cardA, cardB);
      expect(result).toBe(0);
    });
  });

  describe('rarity ordering', () => {
    // Test the full rarity hierarchy: spdp > eifd > lnuy > hrgl > unknown
    const rarityTests = [
      { winnerLot: 'spdp', loserLot: 'eifd', winnerPriority: 4, loserPriority: 3 },
      { winnerLot: 'spdp', loserLot: 'lnuy', winnerPriority: 4, loserPriority: 2 },
      { winnerLot: 'spdp', loserLot: 'hrgl', winnerPriority: 4, loserPriority: 1 },
      { winnerLot: 'eifd', loserLot: 'lnuy', winnerPriority: 3, loserPriority: 2 },
      { winnerLot: 'eifd', loserLot: 'hrgl', winnerPriority: 3, loserPriority: 1 },
      { winnerLot: 'lnuy', loserLot: 'hrgl', winnerPriority: 2, loserPriority: 1 },
    ];

    for (const { winnerLot, loserLot, winnerPriority, loserPriority } of rarityTests) {
      test(`${winnerLot} (priority ${winnerPriority}) beats ${loserLot} (priority ${loserPriority})`, async () => {
        const cardA = createMockCard(5, 1); // same face value for tie
        const cardB = createMockCard(19, 2); // same face value (5 % 14 = 5)

        vi.spyOn(metadataService, 'requireLot')
          .mockResolvedValueOnce(winnerLot)
          .mockResolvedValueOnce(loserLot);

        const result = await compareCards(cardA, cardB);
        expect(result).toBe(1);
      });
    }
  });

  describe('async behavior', () => {
    test('calls requireLot for both cards in parallel on tie', async () => {
      const cardA = createMockCard(5, 1);
      const cardB = createMockCard(19, 2); // same face value

      const requireLotSpy = vi.spyOn(metadataService, 'requireLot').mockResolvedValue('hrgl');

      await compareCards(cardA, cardB);

      expect(requireLotSpy).toHaveBeenCalledTimes(2);
      expect(requireLotSpy).toHaveBeenCalledWith(1); // cardA.id
      expect(requireLotSpy).toHaveBeenCalledWith(2); // cardB.id
    });

    test('does not call requireLot when face values differ', async () => {
      const cardA = createMockCard(13, 1); // king (face 13)
      const cardB = createMockCard(0, 2); // ace (face 0)

      const requireLotSpy = vi.spyOn(metadataService, 'requireLot');

      await compareCards(cardA, cardB);

      expect(requireLotSpy).not.toHaveBeenCalled();
    });
  });
});
