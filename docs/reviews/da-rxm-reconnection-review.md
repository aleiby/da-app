# Code Review: Reconnection Support (da-rxm)

**Reviewer:** fury (polecat)
**Date:** 2026-02-02
**Parent Issue:** da-7eo (Improve War game implementation)

## Summary

The reconnection support implementation is **functional and well-designed**. The architecture properly persists game state in Redis and restores it when clients reconnect.

## How Reconnection Works

### Connection Flow
1. Client connects and sends `setWallet` with wallet address
2. Server fetches cached user data from Redis (`info.table`, `info.name`, `info.pending`)
3. If user had a table, calls `setTable(tableId)` to restore session

### State Restoration (`connection.ts:setTable`)
1. Sets local `tableId` reference
2. Gets player seat and count from Redis
3. Sends `setTable` event to client with position info
4. **Sends all deck state**: Iterates decks, sends `initDeck` for each
5. **Resumes game**: Calls `resumeGame()` which sends `resumeGame` event
6. **Restores revealed cards**: Fetches and sends cards revealed to this player

### Game Resume (`cardtable.ts:resumeGame`)
- Gets cached game name from Redis
- Creates new game instance if needed with `begin(false)`
- `begin(false)` skips initial setup, preserving existing deck state

### War-Specific (`war.ts`)
- `initDeck` reads existing cards from Redis sorted sets
- `getLastPlayed()` reconstructs current round state from played piles
- Only shuffles cards when `initialSetup === true`

## Review Findings

### Strengths

1. **Proper Redis persistence** - All deck state stored in sorted sets
2. **initDeck correctly restores state** - Reads existing cards, sends to client
3. **Clean separation** - `initialSetup` parameter cleanly distinguishes new game vs resume
4. **Round state recovery** - `getLastPlayed()` reconstructs mid-round state
5. **Multi-deck support** - All 6 decks (DeckA/B, PlayedA/B, WonA/B) properly tracked

### Issues Found

#### P3: Outdated TODO Comment
**Location:** `war.ts:82`
```typescript
// TODO: Store decks in table, send initial state on connect.
```
**Issue:** This TODO is misleading - the functionality IS implemented via `initDeck` and `setTable`.
**Recommendation:** Remove the TODO or update to reflect actual remaining work.

#### P4: Local State Not Persisted
**Location:** `war.ts:12` (`_gameEnded` flag)
**Issue:** If server restarts after game ends but before cleanup, game could be resumed incorrectly.
**Impact:** Low - normal game flow prevents this.
**Recommendation:** Consider persisting game-over state in Redis for robustness.

#### P4: Test Comment Suggests Unreliability
**Location:** `e2e/war-game.spec.ts:154`
```typescript
// (reconnection state is often stale and unreliable)
```
**Issue:** This comment contradicts the implementation quality. Either reconnection has known issues that should be tracked, or the comment is outdated.
**Recommendation:** Investigate and either file a bug or remove the comment.

#### P5: No Cleanup on Disconnect
**Issue:** When players disconnect, table/game state remains in Redis indefinitely.
**Impact:** Memory leak over time (low severity for current scale).
**Recommendation:** Add TTL or explicit cleanup when all players leave.

## Test Coverage

- E2E test exists (`war-game.spec.ts`) covering basic gameplay
- Test tracks `resumeGame` event for reconnection
- Test includes `setTable` tracking with player count
- **Gap:** No explicit reconnection scenario tested (disconnect + reconnect)

## Verdict

**APPROVED with minor suggestions**

The reconnection support is well-implemented and functional. The Redis-based persistence model is sound and the `initDeck`/`resumeGame` flow correctly restores game state.

Suggested follow-up work (not blockers):
1. Remove outdated TODO on line 82
2. Investigate e2e test comment about unreliable reconnection
3. Consider adding reconnection-specific e2e test
