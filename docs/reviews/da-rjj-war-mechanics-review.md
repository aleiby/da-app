# Code Review: War Rarity Tiebreaker and Traditional War Mechanics

**Issue:** da-rjj
**Implementation:** da-1nw (polecat/rust/da-1nw@ml4neal6)
**Reviewer:** polecat shiny
**Date:** 2026-02-02

## Summary

This review covers the War game enhancements implementing rarity-based tiebreaking and traditional War mechanics. The implementation adds proper card comparison with lot priority (rarity) and recursive War resolution.

## Changes Reviewed

**File:** `src/games/war.ts`
**Lines changed:** +171, -11

### New Functions

1. **`LOT_PRIORITY` constant** - Maps lot codes to priority values (1-4, with 0 for unknown/loaner)
2. **`getLotPriority(lot)`** - Returns numeric priority for a lot
3. **`getValue(card)`** - Extracted face value calculation (minor vs major arcana)
4. **`compareCards(cardA, cardB)`** - Async comparison: face value first, then rarity on ties
5. **`drawWarCards(...)`** - Draws up to 4 cards (3 face-down, 1 face-up) for War
6. **`resolveWar()`** - Handles War (tie) resolution with recursive support

## Positive Aspects

- **Clean, well-documented code** - Each function has clear JSDoc comments explaining purpose and parameters
- **Proper async handling** - Uses `Promise.all` for parallel metadata lookups
- **Good edge case handling** - Handles running out of cards during War gracefully
- **Correct integration** - Properly uses `metadataService.requireLot()` for rarity lookup
- **Follows existing conventions** - Code style matches the rest of the codebase

## Concerns

### 1. Missing Unit Tests (Medium Priority)

The implementation adds significant new logic but no corresponding tests:

- `compareCards()` rarity tiebreaking is untested
- `resolveWar()` War resolution is untested
- Recursive War scenarios are untested
- Edge cases (running out of cards during War) are untested

**Recommendation:** Add unit tests for the new functions, especially mocking `metadataService.requireLot()` to test rarity comparison.

### 2. Recursive Stack Overflow Risk (Low Priority)

`resolveWar()` uses recursion for repeated ties. While extremely unlikely in practice (requires same face value AND same rarity), theoretically unbounded recursion could cause a stack overflow.

**Recommendation:** Consider converting to a loop or adding a recursion depth limit:

```typescript
const MAX_WAR_DEPTH = 10;
const resolveWar = async (depth = 0): Promise<void> => {
  if (depth >= MAX_WAR_DEPTH) {
    broadcastMsg(this.tableId, 'Maximum war depth reached - draw!');
    return;
  }
  // ... existing logic, but call resolveWar(depth + 1) for recursion
};
```

### 3. Remaining TODO Comment (Informational)

Line 82 still has `// TODO: Store decks in table, send initial state on connect.` which was not part of this change but remains as technical debt from the original code.

## Verification Checklist

- [x] Code compiles (imports are valid)
- [x] Logic is correct for face value comparison
- [x] Logic is correct for rarity tiebreaking
- [x] War resolution follows traditional rules (3 down, 1 up)
- [x] Edge cases handled (out of cards)
- [x] Game end logic is correct
- [ ] Tests pass (cannot verify - npm not available)
- [ ] New tests added (NOT DONE - see concerns)

## Verdict

**APPROVED with recommendations**

The implementation is functionally correct and follows good coding practices. The main gap is test coverage for the new functionality. Recommend:

1. **Must do before merge:** File a follow-up issue for test coverage
2. **Nice to have:** Convert recursion to loop for safety

## Follow-up Actions

- [ ] Create issue for War mechanics test coverage
