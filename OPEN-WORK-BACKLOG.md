# Open Work Backlog

**Report Date:** 2026-01-31

This document captures open bugs and tasks from the beads database that are **not** part of the War Game Convoy (WAR-CONVOY-STATUS.md). Exported for tracking and import into a new database.

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Metadata Service Bugs | 3 | OPEN |
| Metadata Service Tasks | 2 | OPEN |
| War Game Review Improvements | 3 | OPEN |
| Solitaire Test Bugs | 3 | IN_PROGRESS |
| Research Tasks | 1 | OPEN |
| **Total** | **12** | |

---

## Priority 1 - Critical Bugs

These are blocking issues that should be addressed first.

### da-wy03: Add validation for metadata.lot before caching

**Type:** Bug | **Status:** OPEN | **Owner:** da/polecats/chrome

The code assumes `metadata.lot` always exists in IPFS JSON. If malformed or missing, `undefined` gets cached as string.

**File:** `src/metadata-service.ts:202-205`

**Fix:**
```typescript
const metadata: CardMetadata = await response.json();
if (!metadata.lot || typeof metadata.lot !== 'string') {
  console.error(`Invalid metadata for card ${cardId}: missing or invalid lot field`);
  return false;
}
```

---

### da-i5f8: Fix requireLot connection error handling and timeout cleanup

**Type:** Bug | **Status:** OPEN | **Owner:** da/polecats/chrome

Resource leak: if `subscriber.connect()` rejects, the promise never resolves/rejects. The timeout will call `disconnect()` on an unconnected client.

**File:** `src/metadata-service.ts:127-158`

**Fix:**
```typescript
subscriber.connect().then(async () => {
  // existing code
}).catch((err) => {
  clearTimeout(timeout);
  reject(new Error(`Failed to connect subscriber: ${err.message}`));
});
```

---

## Priority 2 - Important Bugs

### da-09o4: Add fetch-in-progress guard to prevent rate limit violations

**Type:** Bug | **Status:** OPEN | **Owner:** da/polecats/chrome

Worker processes one card per interval tick. If IPFS fetch takes longer than `RATE_LIMIT_MS` (500ms), the next tick starts while previous fetch is running. Can lead to >2 requests/second to Pinata.

**File:** `src/metadata-service.ts:257-301`

**Fix:**
```typescript
let fetchInProgress = false;

async function workerLoop(): Promise<void> {
  if (!workerRunning || fetchInProgress) return;

  fetchInProgress = true;
  try {
    // existing worker logic
  } finally {
    fetchInProgress = false;
  }
}
```

---

### da-1tg.1: Consolidate game end handling for draw case

**Type:** Bug | **Status:** OPEN | **Owner:** da/polecats/guzzle | **Parent:** da-1tg

The draw case (both players out of cards) in `war.ts:173-178` duplicates cleanup logic from `endGame()` but does not set `_gameEnded = true`. Could cause double-cleanup.

**File:** `src/games/war.ts`

**Fix:** Refactor `endGame()` to accept null winner for draw case, then call `endGame(null)` instead of inline cleanup.

---

## Priority 2 - Important Tasks

### da-sqg8: Add missing test coverage for metadata service edge cases

**Type:** Task | **Status:** OPEN | **Owner:** da/polecats/chrome

Test gaps identified in code review:

1. `requireLot` timeout behavior - test what happens when fetch never completes
2. HTTP error responses (404, 500, etc.) - tests cover network errors but not HTTP status codes
3. Malformed JSON response - ensure graceful handling
4. Stale inflight recovery - `isInflightStale` function exists but untested

**File:** `src/tests/test-metadata-service.ts`

---

### da-99cw: Implement retry mechanism for failed metadata fetches

**Type:** Task | **Status:** OPEN | **Owner:** da/polecats/chrome

Failed fetches are permanently dropped. Transient network errors result in permanently missing metadata.

**File:** `src/metadata-service.ts`

**Fix:** Implement retry mechanism with exponential backoff (up to 3 retries, delay 1-3 minutes).

---

## Priority 2 - Solitaire Test Bugs (In Progress)

These are flaky test issues that don't block War game work.

### da-4j75: Flaky solitaire tests: timeouts in test-solitaire.ts

**Type:** Bug | **Status:** IN_PROGRESS | **Owner:** da/refinery

Two solitaire tests failing with timeouts:
1. 'clicking talon picks up card to hand' - Timeout waiting for message containing: Solitaire
2. 'player can rejoin solitaire after disconnect' - Timeout waiting for event: setTable

Environmental/timing issues, not code bugs. All other tests pass (105/107).

---

### da-1vhr: Pre-existing test failures: Solitaire tests EADDRINUSE port conflict

**Type:** Bug | **Status:** IN_PROGRESS | **Owner:** da/polecats/nitro

Solitaire tests fail with `EADDRINUSE: address already in use :::3001`. Test isolation issue with server port allocation.

**File:** `src/tests/games/test-solitaire.ts`

---

### da-afzs: Flaky test: Solitaire foundation movement timeout

**Type:** Bug | **Status:** IN_PROGRESS | **Owner:** da/polecats/rust

Test 'clicking foundation attempts to place card' times out waiting for message containing 'Solitaire'. Also EADDRINUSE errors during test run.

**File:** `test-solitaire.ts:370`

---

## Priority 3 - War Game Review Improvements

Follow-up tasks from code review of da-icmx (Game over and reshuffle).

### da-1tg.2: Add ensureCanDraw verification after shuffle

**Type:** Task | **Status:** OPEN | **Owner:** da/polecats/guzzle | **Parent:** da-1tg

In `ensureCanDraw()`, after calling `shuffleInto()`, the method assumes the deck now has cards and returns true. If `shuffleInto()` fails silently (e.g., Redis connection issue), the caller thinks the player can draw when they cannot.

**File:** `src/games/war.ts`

**Fix:** Add verification after the shuffle - check `newDeckCount > 0`.

---

### da-1tg.3: Add unit tests for ensureCanDraw and shuffle randomization

**Type:** Task | **Status:** OPEN | **Owner:** da/polecats/guzzle | **Parent:** da-1tg

Missing test coverage:
1. Unit tests for `ensureCanDraw()` helper
2. Test verifying `shuffleInto()` actually randomizes card order
3. Test for `endGame()` idempotency

**Files:** `src/tests/test-deck.ts`, `src/tests/games/test-war.ts`

---

## Priority 3 - Research Tasks

### da-00o: Research IPFS storage alternatives

**Type:** Task | **Status:** OPEN

NFT.Storage Ltd is winding down in 2025. While existing uploads persist, service may degrade over time.

**Current State:**
- Using `nft.storage` npm package for uploads in `src/admin.ts`
- Card images stored at CID: `bafybeiefg5nl5ioy37lrzizqxmb4woadptwjjegtarv2nfqohxzitsd4be`
- URIs stored as `ipfs://` protocol (gateway-agnostic)

**Research Needed:**
1. Test existing CID accessibility and latency across gateways
2. Evaluate alternatives: Pinata, Filebase, NFT.Storage Long-Term Storage, Arweave
3. Determine where gateway URLs are resolved (likely Unity client)
4. Assess migration path if needed

---

## Dependency Graph

```
Metadata Service Bugs (Critical Path)
├── da-wy03 [P1] → Invalid lot caching
├── da-i5f8 [P1] → Connection error handling
├── da-09o4 [P2] → Rate limit guard
├── da-sqg8 [P2] → Test coverage (depends on bugs being fixed)
└── da-99cw [P2] → Retry mechanism

War Game Improvements (Parent: da-1tg)
├── da-1tg.1 [P2] → Draw case consolidation
├── da-1tg.2 [P3] → Shuffle verification
└── da-1tg.3 [P3] → Unit tests (depends on da-1tg.1, da-1tg.2)

Solitaire Tests (Independent)
├── da-4j75 [P2] → Flaky timeouts
├── da-1vhr [P2] → Port conflict (root cause)
└── da-afzs [P2] → Foundation timeout

Research (Independent)
└── da-00o [P3] → IPFS alternatives
```

---

## Exportable Beads (JSONL)

The following JSONL can be imported into another beads database using `bd import`.

### Metadata Service Bugs

```jsonl
{"id":"da-wy03","title":"Add validation for metadata.lot before caching","description":"Critical: The code assumes metadata.lot always exists in IPFS JSON.\n\nProblem:\n- If IPFS JSON is malformed or missing the lot field\n- This will cache undefined as string 'undefined'\n\nFix: Validate metadata before caching:\n\n```typescript\nconst metadata: CardMetadata = await response.json();\nif (!metadata.lot || typeof metadata.lot !== 'string') {\n  console.error(`Invalid metadata for card ${cardId}: missing or invalid lot field`);\n  return false;\n}\n```\n\nFile: src/metadata-service.ts lines 202-205","status":"open","priority":1,"issue_type":"bug","owner":"aleiby@gmail.com","created_at":"2026-01-30T13:00:19.586644546-08:00","created_by":"da/polecats/chrome","updated_at":"2026-01-30T13:00:19.586644546-08:00"}
{"id":"da-i5f8","title":"Fix requireLot connection error handling and timeout cleanup","description":"Critical: The requireLot function has a potential resource leak.\n\nProblem:\n- If subscriber.connect() rejects, the promise never resolves/rejects\n- The timeout will call disconnect() on an unconnected client\n\nFix: Add .catch() handler to propagate connection failures:\n\n```typescript\nsubscriber.connect().then(async () => {\n  // existing code\n}).catch((err) => {\n  clearTimeout(timeout);\n  reject(new Error(`Failed to connect subscriber: ${err.message}`));\n});\n```\n\nFile: src/metadata-service.ts lines 127-158","status":"open","priority":1,"issue_type":"bug","owner":"aleiby@gmail.com","created_at":"2026-01-30T13:00:18.45032654-08:00","created_by":"da/polecats/chrome","updated_at":"2026-01-30T13:00:18.45032654-08:00"}
{"id":"da-09o4","title":"Add fetch-in-progress guard to prevent rate limit violations","description":"Important: Worker processes one card per interval tick. If IPFS fetch takes longer than RATE_LIMIT_MS (500ms), the next tick starts while previous fetch is running.\n\nProblem:\n- Can lead to >2 requests/second to Pinata (violating rate limit intent)\n- Memory buildup if fetches are slow\n\nFix: Add a mutex or check if fetch is in progress:\n\n```typescript\nlet fetchInProgress = false;\n\nasync function workerLoop(): Promise<void> {\n  if (!workerRunning || fetchInProgress) return;\n  \n  fetchInProgress = true;\n  try {\n    // existing worker logic\n  } finally {\n    fetchInProgress = false;\n  }\n}\n```\n\nFile: src/metadata-service.ts lines 257-301","status":"open","priority":2,"issue_type":"bug","owner":"aleiby@gmail.com","created_at":"2026-01-30T13:00:22.849070654-08:00","created_by":"da/polecats/chrome","updated_at":"2026-01-30T13:00:22.849070654-08:00"}
```

### Metadata Service Tasks

```jsonl
{"id":"da-sqg8","title":"Add missing test coverage for metadata service edge cases","description":"Test gaps identified in code review:\n\n1. requireLot timeout behavior - test what happens when fetch never completes\n2. HTTP error responses (404, 500, etc.) - tests cover network errors but not HTTP status codes\n3. Malformed JSON response - ensure graceful handling\n4. Stale inflight recovery - isInflightStale function exists but untested\n\nExample test for timeout:\n```typescript\ntest('requireLot times out when fetch never completes', async () => {\n  const card = await registerCard(1, 1, 'ipfs://test/slow.json');\n  \n  vi.spyOn(global, 'fetch').mockImplementation(\n    () => new Promise(() => {}) // Never resolves\n  );\n  \n  await expect(requireLot(card.id)).rejects.toThrow(/Timeout/);\n});\n```\n\nFile: src/tests/test-metadata-service.ts","status":"open","priority":2,"issue_type":"task","owner":"aleiby@gmail.com","created_at":"2026-01-30T13:00:26.987901941-08:00","created_by":"da/polecats/chrome","updated_at":"2026-01-30T13:00:26.987901941-08:00"}
{"id":"da-99cw","title":"Implement retry mechanism for failed metadata fetches","description":"Important: Failed fetches are permanently dropped. Transient network errors result in permanently missing metadata.\n\nCurrent behavior (lines 294-300):\n- Remove from queue regardless of success\n- Log error but don't retry\n\nFix: Implement retry mechanism with exponential backoff:\n\n```typescript\nif (!success) {\n  const retryCount = await redis.hIncrBy('metadata:failed', cardIdStr, 1);\n  if (retryCount < 3) {\n    // Re-queue with lower priority and delayed score\n    await redis.zAdd(QUEUE_PREFIX + Queue.ColdCrawl, {\n      score: Date.now() + (retryCount * 60000),  // Delay 1-3 minutes\n      value: cardIdStr,\n    });\n  }\n}\n```\n\nFile: src/metadata-service.ts","status":"open","priority":2,"issue_type":"task","owner":"aleiby@gmail.com","created_at":"2026-01-30T13:00:25.052961819-08:00","created_by":"da/polecats/chrome","updated_at":"2026-01-30T13:00:25.052961819-08:00"}
```

### War Game Review Improvements

```jsonl
{"id":"da-1tg.1","title":"Consolidate game end handling for draw case","description":"The draw case (both players out of cards) in war.ts lines 173-178 duplicates cleanup logic from endGame() but does not set _gameEnded = true. This could cause double-cleanup if any code path triggers both conditions.\n\nFix: Refactor endGame() to accept null winner for draw case:\n```typescript\nasync endGame(winner: string | null) {\n  if (this._gameEnded) {\n    return;\n  }\n  this._gameEnded = true;\n\n  if (winner) {\n    const winnerName = await getUserName(winner);\n    broadcastMsg(this.tableId, `Game Over! ${winnerName} wins!`);\n  } else {\n    broadcastMsg(this.tableId, 'Game ended in a draw - both players ran out of cards!');\n  }\n  sendEvent(this.tableId, 'gameOver', winner);\n\n  await this.sub.unsubscribe();\n  await this.sub.disconnect();\n}\n```\n\nThen update the draw case to call endGame(null) instead of inline cleanup.\n\nFiles: src/games/war.ts","status":"open","priority":2,"issue_type":"bug","owner":"aleiby@gmail.com","created_at":"2026-01-30T12:58:59.518798334-08:00","created_by":"da/polecats/guzzle","updated_at":"2026-01-30T12:58:59.518798334-08:00","dependencies":[{"issue_id":"da-1tg.1","depends_on_id":"da-1tg","type":"parent-child","created_at":"2026-01-30T12:58:59.530447214-08:00","created_by":"da/polecats/guzzle"}]}
{"id":"da-1tg.2","title":"Add ensureCanDraw verification after shuffle","description":"In ensureCanDraw(), after calling shuffleInto(), the method assumes the deck now has cards and returns true. If shuffleInto() fails silently (e.g., Redis connection issue), the caller thinks the player can draw when they cannot.\n\nFix: Add verification after the shuffle:\n```typescript\n// Reshuffle won pile into deck\nconst playerName = await getUserName(player);\nbroadcastMsg(this.tableId, `${playerName} reshuffles their won pile`);\nawait won.shuffleInto(deck);\n\n// Verify cards were transferred\nconst newDeckCount = await deck.numCards();\nreturn newDeckCount > 0;\n```\n\nFiles: src/games/war.ts","status":"open","priority":3,"issue_type":"task","owner":"aleiby@gmail.com","created_at":"2026-01-30T12:59:05.316307775-08:00","created_by":"da/polecats/guzzle","updated_at":"2026-01-30T12:59:05.316307775-08:00","dependencies":[{"issue_id":"da-1tg.2","depends_on_id":"da-1tg","type":"parent-child","created_at":"2026-01-30T12:59:05.327571365-08:00","created_by":"da/polecats/guzzle"}]}
{"id":"da-1tg.3","title":"Add unit tests for ensureCanDraw and shuffle randomization","description":"The code review identified missing test coverage:\n\n1. No unit tests for ensureCanDraw() helper. Tests should verify:\n   - Returns true when deck has cards\n   - Returns true after reshuffling won pile\n   - Returns false when both piles are empty\n   - Broadcasts the correct reshuffle message\n\n2. No test verifying shuffleInto() actually randomizes card order. The test-deck.ts file has a similar test for getShuffledDeck (lines 170-186) that could serve as a template.\n\n3. Add test for endGame() idempotency (calling twice doesn't cause errors)\n\nFiles: src/tests/test-deck.ts, src/tests/games/test-war.ts","status":"open","priority":3,"issue_type":"task","owner":"aleiby@gmail.com","created_at":"2026-01-30T12:59:13.517008177-08:00","created_by":"da/polecats/guzzle","updated_at":"2026-01-30T12:59:13.517008177-08:00","dependencies":[{"issue_id":"da-1tg.3","depends_on_id":"da-1tg","type":"parent-child","created_at":"2026-01-30T12:59:13.523307457-08:00","created_by":"da/polecats/guzzle"}]}
```

### Solitaire Test Bugs

```jsonl
{"id":"da-4j75","title":"Flaky solitaire tests: timeouts in test-solitaire.ts","description":"Two solitaire tests failing with timeouts:\n1. 'clicking talon picks up card to hand' - Timeout waiting for message containing: Solitaire\n2. 'player can rejoin solitaire after disconnect' - Timeout waiting for event: setTable\n\nAlso seeing EADDRINUSE port conflict on 3001 during test run.\n\nThese appear to be environmental/timing issues, not code bugs. All other tests pass (105/107).","status":"in_progress","priority":2,"issue_type":"bug","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:53:55.38040061-08:00","created_by":"da/refinery","updated_at":"2026-01-29T23:40:09.827720124-08:00"}
{"id":"da-1vhr","title":"Pre-existing test failures: Solitaire tests EADDRINUSE port conflict","description":"Solitaire tests fail with EADDRINUSE: address already in use :::3001\n\nThe solitaire tests try to start a server on port 3001 which conflicts with other test files.\nThis causes cascade failures:\n- Solitaire: Talon Pickup tests\n- Solitaire: Stock Draw tests\n\nRoot cause: Test isolation issue with server port allocation.\n\nRelated tests:\n- src/tests/games/test-solitaire.ts\n\nNot blocking War game implementation work.","status":"in_progress","priority":2,"issue_type":"bug","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:46:46.198906985-08:00","created_by":"da/polecats/nitro","updated_at":"2026-01-29T23:40:10.14635335-08:00"}
{"id":"da-afzs","title":"Flaky test: Solitaire foundation movement timeout","description":"Test 'clicking foundation attempts to place card' times out waiting for message containing 'Solitaire'. Also EADDRINUSE errors during test run. See test-solitaire.ts:370.","status":"in_progress","priority":2,"issue_type":"bug","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:45:19.71676018-08:00","created_by":"da/polecats/rust","updated_at":"2026-01-29T23:40:10.417288782-08:00"}
```

### Research Tasks

```jsonl
{"id":"da-00o","title":"Research IPFS storage alternatives","description":"NFT.Storage Ltd is winding down in 2025. While existing uploads persist, service may degrade over time.\n\n## Current State\n- Using `nft.storage` npm package for uploads in `src/admin.ts`\n- Card images stored at CID: `bafybeiefg5nl5ioy37lrzizqxmb4woadptwjjegtarv2nfqohxzitsd4be`\n- URIs stored as `ipfs://` protocol (good - gateway-agnostic)\n\n## Research Needed\n1. Test existing CID accessibility and latency across gateways\n2. Evaluate alternatives for new uploads:\n   - Pinata (NFT-focused, popular)\n   - Filebase (S3-compatible)\n   - NFT.Storage Long-Term Storage (one-time fee via Lighthouse)\n   - Arweave (permanent storage, different model)\n3. Determine where gateway URLs are resolved (likely Unity client)\n4. Assess migration path if needed\n\n## References\n- https://nft.storage/blog/nft-storage-operation-transitions-in-2025\n- https://docs.ipfs.tech/concepts/public-utilities/\n- https://filebase.com/nft-storage-alternative/","status":"open","priority":3,"issue_type":"task","created_at":"2026-01-10T19:34:15.064082552-08:00","updated_at":"2026-01-11T22:02:36.047694319-08:00"}
```

---

## Import Instructions

To import these beads into another database:

1. Save the JSONL blocks above to a file (e.g., `open-work-beads.jsonl`)
2. Run: `bd import -i open-work-beads.jsonl`

Note: You may need to adjust the `id` prefixes if importing into a database with different prefix conventions. The `da-` prefix is specific to this rig.
