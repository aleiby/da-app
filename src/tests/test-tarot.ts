/**
 * Unit tests for tarot.ts - card generation and formatting
 *
 * Pure data functions, no dependencies.
 */
import { test, expect } from 'vitest';
import {
  allCards,
  minorArcana,
  minorCards,
  minorSuits,
  majorArcana,
  totalMinor,
  totalCards,
} from '../tarot';

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
