# War Game Improvements Convoy Status Report

**Convoy ID:** hq-cv-vbx5o
**Report Date:** 2026-01-31
**Progress:** 5/12 completed

---

## Summary

The "War game improvements" convoy was created on 2026-01-28 to implement enhancements to the War card game. Of the 12 tracked beads, 5 have been completed with their changes successfully merged to `origin/main`. The remaining 7 beads are either in progress (stalled) or blocked.

---

## Completed Beads (5)

All completed implementation work has been merged to `origin/main`.

| Bead ID | Title | Commit | Status |
|---------|-------|--------|--------|
| da-97e2 | War: Configure 20-card deck size | `a199cdf` | CLOSED |
| da-9uuc | War: Background metadata service | `39d0b8b` | CLOSED |
| da-icmx | War: Game over and won pile reshuffle | `ed6c0ea` | CLOSED |
| da-4vd7 | War: Reconnection support | `774475b` | CLOSED |
| da-fwj2 | Review: Game over and reshuffle | *(review task)* | CLOSED |

### Commit Details on origin/main

```
774475b test: Add War reconnection support tests (da-4vd7)
39d0b8b feat: Add background metadata service for IPFS lot caching (da-9uuc)
ed6c0ea feat(war): add game over detection and won pile reshuffle
a199cdf feat: configure 20-card deck size for War game (da-97e2)
```

### What Was Implemented

1. **20-card deck size (da-97e2)**: Added `WAR_DECK_SIZE` constant, updated `getShuffledDeck` calls with limit parameter.

2. **Background metadata service (da-9uuc)**: Created `src/metadata-service.ts` with priority queues for IPFS metadata fetching, Redis caching, and pub/sub notifications. 23 tests with 92.7% coverage.

3. **Game over and reshuffle (da-icmx)**: Added `CardDeck.shuffleInto()` method, `ensureCanDraw` helper, and `endGame` method for proper game termination.

4. **Reconnection support (da-4vd7)**: Added 3 test cases verifying reconnection works mid-round, between rounds, and when both players disconnect.

5. **Review: Game over (da-fwj2)**: Code review completed, created improvement beads for follow-up.

---

## Unfinished Beads (7)

### In Progress - Implementation (2)

These are the core unfinished features. **No code exists on any branch.**

| Bead ID | Title | Status | Notes |
|---------|-------|--------|-------|
| da-jneq | War: Rarity tiebreaker and traditional War mechanics | IN_PROGRESS | Core feature: lot priority comparison, resolveWar() for ties |
| da-wlza | War: Metadata prefetch on game start | IN_PROGRESS | Depends on da-9uuc (done). Prefetch cards in draw order |

### In Progress - Reviews (3)

| Bead ID | Title | Status | Assigned To |
|---------|-------|--------|-------------|
| da-a9hf | Review: Deck size configuration | IN_PROGRESS | (unassigned) |
| da-ah2t | Review: Background metadata service | HOOKED | da/polecats/chrome |
| da-dwrq | Review: Reconnection support | HOOKED | da/polecats/nitro |

### Open - Blocked (2)

| Bead ID | Title | Status | Blocked By |
|---------|-------|--------|------------|
| da-64xo | Review: Metadata prefetch integration | OPEN | da-wlza |
| da-pxum | Review: Rarity and War mechanics | OPEN | da-jneq |

---

## Dependency Graph

```
da-1tg (parent: Improve War game implementation)
├── da-97e2 [DONE] → da-a9hf (review, in_progress)
├── da-9uuc [DONE] → da-ah2t (review, hooked)
│                  → da-jneq (blocked on this + da-icmx)
│                  → da-wlza (blocked on this)
├── da-icmx [DONE] → da-fwj2 [DONE] (review)
│                  → da-jneq (blocked on this + da-9uuc)
├── da-4vd7 [DONE] → da-dwrq (review, hooked)
├── da-jneq [IN_PROGRESS] → da-pxum (review, blocked)
└── da-wlza [IN_PROGRESS] → da-64xo (review, blocked)
```

---

## Git Branch Status

- **No feature branches** contain War-related uncommitted work
- All completed work is on `origin/main`
- Polecat branches checked: none contain War convoy work

---

## Recommendations

To complete this convoy:

1. **Implement da-jneq** (Rarity tiebreaker and traditional War mechanics)
   - This is the core remaining feature
   - Implements `compareCards()` with lot priority comparison
   - Implements `resolveWar()` for traditional War on ties

2. **Implement da-wlza** (Metadata prefetch on game start)
   - Simple integration task using existing metadata service
   - Queue cards for prefetch in draw order

3. **Complete stalled reviews** (da-a9hf, da-ah2t, da-dwrq)
   - These are hooked to polecats but appear stalled

---

## Exportable Beads (JSONL)

The following JSONL can be imported into another beads database using `bd import`.

### Convoy Bead (HQ)

```jsonl
{"id":"hq-cv-vbx5o","title":"War game improvements","description":"Convoy tracking 12 issues\nOwner: da/crew/moriarty\nNotify: mayor/","status":"open","priority":2,"issue_type":"convoy","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:39:54.381337808-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-28T23:39:54.381337808-08:00","dependencies":[{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-97e2","type":"tracks","created_at":"2026-01-28T23:39:54.676617967-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-9uuc","type":"tracks","created_at":"2026-01-28T23:39:54.968236133-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-icmx","type":"tracks","created_at":"2026-01-28T23:39:55.216402667-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-4vd7","type":"tracks","created_at":"2026-01-28T23:39:55.478940917-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-jneq","type":"tracks","created_at":"2026-01-28T23:39:55.714809017-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-wlza","type":"tracks","created_at":"2026-01-28T23:39:55.999326908-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-a9hf","type":"tracks","created_at":"2026-01-28T23:39:56.295184808-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-ah2t","type":"tracks","created_at":"2026-01-28T23:39:56.5817112-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-fwj2","type":"tracks","created_at":"2026-01-28T23:39:56.831741175-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-dwrq","type":"tracks","created_at":"2026-01-28T23:39:57.10532975-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-pxum","type":"tracks","created_at":"2026-01-28T23:39:57.42414305-08:00","created_by":"da/crew/moriarty"},{"issue_id":"hq-cv-vbx5o","depends_on_id":"external:da:da-64xo","type":"tracks","created_at":"2026-01-28T23:39:57.725332683-08:00","created_by":"da/crew/moriarty"}]}
```

### Parent Issue

```jsonl
{"id":"da-1tg","title":"Improve War game implementation","description":"Fix various TODOs in the War game.\n\n## From src/games/war.ts\n- Line 25: TODO: Store decks in table, send initial state on connect\n- Line 53: TODO: Check rarity first? (for card comparison)\n- Line 110: TODO: Handle game over state\n\n## Tasks\n1. Persist deck state in Redis table for reconnection support\n2. Consider rarity in card value comparison (NFT cards more valuable?)\n3. Implement proper game over handling and winner announcement","status":"open","priority":3,"issue_type":"task","created_at":"2026-01-10T17:23:48.03168646-08:00","updated_at":"2026-01-11T22:02:36.052216083-08:00"}
```

### Implementation Beads

```jsonl
{"id":"da-97e2","title":"War: Configure 20-card deck size","description":"attached_molecule: da-wisp-5cj\nattached_at: 2026-01-29T07:40:25Z\n\nFile: src/games/war.ts\n\nAdd constant and pass to getShuffledDeck():\n\nconst WAR_DECK_SIZE = 20;\n\nIn begin(), change:\ndeckA.add(await getShuffledDeck(playerA, DeckContents.AllCards, WAR_DECK_SIZE));\ndeckB.add(await getShuffledDeck(playerB, DeckContents.AllCards, WAR_DECK_SIZE));\n\nTests:\n- Verify each player starts with exactly 20 cards\n- Verify cards are randomly selected from full tarot deck\n\nDesign doc: docs/plans/2026-01-28-war-improvements-design.md Task 1\n\nParent: da-1tg","notes":"Implemented: Added WAR_DECK_SIZE constant (20), updated getShuffledDeck calls to use limit parameter, added tests verifying 20-card deck size and random card selection","status":"closed","priority":2,"issue_type":"task","assignee":"da/polecats/rust","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:33:28.656992549-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-28T23:54:21.756080704-08:00","closed_at":"2026-01-28T23:54:21.756080704-08:00","close_reason":"Closed","dependencies":[{"issue_id":"da-97e2","depends_on_id":"da-wisp-5cj","type":"blocks","created_at":"2026-01-28T23:40:24.127092041-08:00","created_by":"da/crew/moriarty"}]}
{"id":"da-9uuc","title":"War: Background metadata service","description":"attached_molecule: da-wisp-9u2\nattached_at: 2026-01-29T07:40:43Z\n\nNew file: src/metadata-service.ts\n\nA background worker that fetches IPFS metadata and caches lot information in Redis.\nRuns as worker loop in main server process.\n\nRedis Structure:\n- metadata:queue:0 (urgent - games blocked)\n- metadata:queue:1 (active game - score = deck position)\n- metadata:queue:2 (newly registered - score = timestamp)\n- metadata:queue:3 (cold crawl - score = card_id)\n- metadata:cached (set of card IDs with lot cached)\n- metadata:inflight (hash: card_id -> fetch_started_timestamp)\n\nPublic API:\n- prioritize(cardIds, queue, startScore): Non-blocking queue for prefetch\n- requireLot(cardId): Blocking, bumps to urgent queue\n- getLotIfCached(cardId): Check if lot is cached\n\nWorker processes queues in priority order, respects Pinata rate limit (~2/sec).\n\nTests:\n- Queue priority ordering\n- Worker rate limiting\n- IPFS fetch mocking\n- Cache behavior\n- Pub/sub notifications\n- requireLot blocks until available\n- getLotIfCached returns null if not cached\n\nDesign doc: docs/plans/2026-01-28-war-improvements-design.md Task 2\n\nParent: da-1tg","notes":"Implemented background metadata service (src/metadata-service.ts) with priority queues, IPFS fetching, Redis caching, and pub/sub notifications. 23 tests added with 92.7% coverage.","status":"closed","priority":2,"issue_type":"task","assignee":"da/polecats/chrome","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:33:41.010206907-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-29T00:03:29.4322706-08:00","closed_at":"2026-01-29T00:03:29.4322706-08:00","close_reason":"Closed"}
{"id":"da-icmx","title":"War: Game over and won pile reshuffle","description":"attached_molecule: da-wisp-7yv\nattached_at: 2026-01-29T07:41:05Z\n\nFiles: src/games/war.ts, src/cards.ts\n\nNew CardDeck.shuffleInto(to) method:\n- Get all card IDs from source\n- Shuffle the array\n- Clear source deck\n- Add to destination in shuffled order\n\nensureCanDraw(deck, won, player, tableId) helper:\n- Check deck count, return true if > 0\n- Check won pile count, return false if 0 (game over)\n- Reshuffle won pile into deck\n- Re-prioritize metadata for new deck order\n- Return true\n\nAfter each round, check if either player can draw:\n- If not, other player wins\n- Call endGame(winner) with cleanup\n\nendGame(winner) method:\n- Clean up Redis subscriptions\n- Broadcast gameOver event to clients\n\nTests:\n- Player with empty deck and cards in won pile: reshuffles and continues\n- Player with empty deck and empty won pile: loses\n- Reshuffle broadcasts message to both players\n- Reshuffle re-prioritizes metadata for new card order\n- Game over event sent to clients\n- Game subscriptions cleaned up on end\n\nDesign doc: docs/plans/2026-01-28-war-improvements-design.md Task 4\n\nParent: da-1tg","notes":"Implemented:\n- CardDeck.shuffleInto(to) method in src/cards.ts\n- ensureCanDraw helper and endGame method in War class\n- Game over detection after each round\n- Tests for shuffleInto in test-deck.ts\n- Integration test framework update for gameOver event tracking","status":"closed","priority":2,"issue_type":"task","assignee":"da/polecats/nitro","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:33:50.816968383-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-29T00:00:24.353441106-08:00","closed_at":"2026-01-29T00:00:24.353441106-08:00","close_reason":"Closed"}
{"id":"da-4vd7","title":"War: Reconnection support","description":"attached_molecule: da-wisp-i3j\nattached_at: 2026-01-29T07:41:29Z\n\nFile: src/games/war.ts\n\nThe infrastructure already exists. Fix is minimal:\n\nIn begin(), restore mid-round state on reconnect:\n  let [cardA, cardB] = await getLastPlayed();\n\nThe existing getLastPlayed() helper (lines 42-53) already checks the played\npiles to determine if a round is in progress.\n\nTests:\n- Player disconnects mid-round, reconnects: sees cards already played\n- Player disconnects between rounds, reconnects: clean state, can draw\n- Both players disconnect and reconnect: game resumes correctly\n\nDesign doc: docs/plans/2026-01-28-war-improvements-design.md Task 5\n\nParent: da-1tg","notes":"Implemented: Added War reconnection support tests (3 test cases). Implementation code (getLastPlayed in begin()) was already in place. Tests verify player can disconnect mid-round, in clean state, or both players disconnect - all reconnect correctly.","status":"closed","priority":2,"issue_type":"task","assignee":"da/polecats/guzzle","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:34:00.331946692-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-29T00:09:42.73983443-08:00","closed_at":"2026-01-29T00:09:42.73983443-08:00","close_reason":"Closed"}
{"id":"da-jneq","title":"War: Rarity tiebreaker and traditional War mechanics","description":"attached_molecule: da-wisp-4oh\nattached_at: 2026-01-29T08:27:21Z\n\nFile: src/games/war.ts\n\nLot priority mapping (from Unity client):\n- spdp: 4 (rarest)\n- eifd: 3\n- lnuy: 2\n- hrgl: 1 (common)\n- unknown/loaner: 0\n\ncompareCards(cardA, cardB) helper:\n- Compare face values first\n- If tie, compare rarity via metadataService.requireLot()\n- Returns 1 (A wins), -1 (B wins), or 0 (true tie)\n\nTraditional War on true tie:\n- resolveWar() function\n- Each player draws up to 4 cards (3 face-down, 1 face-up)\n- If < 4 cards available, last card is face-up\n- If 0 cards, that player loses immediately\n- Compare face-up cards using compareCards()\n- Recursive war if another true tie\n- Winner takes all cards from played piles\n\nTests:\n- Higher face value wins regardless of rarity\n- Equal face value: higher lot priority wins\n- Equal face value, equal lot: triggers War\n- War: 3 face-down + 1 face-up from each player\n- War with < 4 cards: last card is face-up\n- War with 0 cards: player loses immediately\n- Recursive war on repeated ties\n- Loaner cards lose to any NFT in rarity comparison\n- All war cards go to winner\n\nDesign doc: docs/plans/2026-01-28-war-improvements-design.md Task 3\n\nParent: da-1tg","status":"in_progress","priority":2,"issue_type":"task","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:34:11.02771916-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-29T23:40:09.796618645-08:00","dependencies":[{"issue_id":"da-jneq","depends_on_id":"da-9uuc","type":"blocks","created_at":"2026-01-28T23:34:28.226525676-08:00","created_by":"da/crew/moriarty"},{"issue_id":"da-jneq","depends_on_id":"da-icmx","type":"blocks","created_at":"2026-01-28T23:34:28.358915835-08:00","created_by":"da/crew/moriarty"}]}
{"id":"da-wlza","title":"War: Metadata prefetch on game start","description":"attached_molecule: da-wisp-t4n\nattached_at: 2026-01-29T08:27:37Z\n\nFile: src/games/war.ts\n\nAfter dealing cards in begin(), prefetch metadata in draw order:\n\nif (initialSetup) {\n  const cardsA = await getShuffledDeck(playerA, DeckContents.AllCards, WAR_DECK_SIZE);\n  const cardsB = await getShuffledDeck(playerB, DeckContents.AllCards, WAR_DECK_SIZE);\n\n  deckA.add(cardsA);\n  deckB.add(cardsB);\n\n  // Prefetch metadata in draw order (top of deck = lowest score)\n  metadataService.prioritize(cardsA.map(c => c.id), 1, 0);\n  metadataService.prioritize(cardsB.map(c => c.id), 1, 0);\n}\n\nTests:\n- Game start queues all 40 cards for metadata prefetch\n- Cards are queued at priority level 1 (active game)\n- Scores reflect deck position (top = 0, bottom = 19)\n\nDesign doc: docs/plans/2026-01-28-war-improvements-design.md Task 6\n\nParent: da-1tg","status":"in_progress","priority":2,"issue_type":"task","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:34:19.84266556-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-29T23:40:11.98788627-08:00","dependencies":[{"issue_id":"da-wlza","depends_on_id":"da-9uuc","type":"blocks","created_at":"2026-01-28T23:34:28.48118896-08:00","created_by":"da/crew/moriarty"}]}
```

### Review Beads

```jsonl
{"id":"da-a9hf","title":"Review: Deck size configuration","description":"attached_molecule: da-wisp-co7\nattached_at: 2026-01-29T08:28:25Z\n\nUse code-simplifier agent to review the implementation of da-97e2.\n\nReview focus:\n- Code clarity and consistency\n- Proper use of constants\n- Test coverage\n\nAfter review, create beads for any suggested improvements and sling them for implementation.\n\nParent: da-1tg\nReviewer: code-simplifier","status":"in_progress","priority":2,"issue_type":"task","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:37:28.110065153-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-29T23:40:10.045756134-08:00","dependencies":[{"issue_id":"da-a9hf","depends_on_id":"da-97e2","type":"blocks","created_at":"2026-01-28T23:37:33.540570103-08:00","created_by":"da/crew/moriarty"}]}
{"id":"da-ah2t","title":"Review: Background metadata service","description":"attached_molecule: da-wisp-svjs\nattached_at: 2026-01-29T08:28:45Z\ndispatched_by: dog\n\nUse code-simplifier agent to review the implementation of da-9uuc.\n\nReview focus:\n- Worker loop clarity and error handling\n- Redis queue operations\n- Rate limiting implementation\n- Pub/sub notification pattern\n- Test coverage\n\nAfter review, create beads for any suggested improvements and sling them for implementation.\n\nParent: da-1tg\nReviewer: code-simplifier","status":"hooked","priority":2,"issue_type":"task","assignee":"da/polecats/chrome","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:37:43.758665293-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-30T12:43:34.614030553-08:00","dependencies":[{"issue_id":"da-ah2t","depends_on_id":"da-9uuc","type":"blocks","created_at":"2026-01-28T23:37:55.169516909-08:00","created_by":"da/crew/moriarty"},{"issue_id":"da-ah2t","depends_on_id":"da-wisp-07y","type":"blocks","created_at":"2026-01-29T00:28:43.85747222-08:00","created_by":"da/crew/moriarty"},{"issue_id":"da-ah2t","depends_on_id":"da-wisp-svjs","type":"blocks","created_at":"2026-01-30T12:42:42.12522485-08:00","created_by":"Aaron Leiby"}]}
{"id":"da-fwj2","title":"Review: Game over and reshuffle","description":"attached_molecule: da-wisp-94e1\nattached_at: 2026-01-29T08:29:06Z\ndispatched_by: dog\n\nUse code-simplifier agent to review the implementation of da-icmx.\n\nReview focus:\n- shuffleInto() method clarity\n- ensureCanDraw() helper logic\n- endGame() cleanup completeness\n- Test coverage\n\nAfter review, create beads for any suggested improvements and sling them for implementation.\n\nParent: da-1tg\nReviewer: code-simplifier","status":"closed","priority":2,"issue_type":"task","assignee":"da/polecats/guzzle","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:37:44.581265751-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-30T12:59:34.823153039-08:00","closed_at":"2026-01-30T12:59:34.823153039-08:00","close_reason":"Review completed. Created improvement beads: da-1tg.1 (consolidate game end handling), da-1tg.2 (shuffle verification), da-1tg.3 (test coverage)","dependencies":[{"issue_id":"da-fwj2","depends_on_id":"da-icmx","type":"blocks","created_at":"2026-01-28T23:37:55.332430201-08:00","created_by":"da/crew/moriarty"},{"issue_id":"da-fwj2","depends_on_id":"da-wisp-q6l","type":"blocks","created_at":"2026-01-29T00:29:04.462416336-08:00","created_by":"da/crew/moriarty"},{"issue_id":"da-fwj2","depends_on_id":"da-wisp-94e1","type":"blocks","created_at":"2026-01-30T12:49:07.057776153-08:00","created_by":"Aaron Leiby"}]}
{"id":"da-dwrq","title":"Review: Reconnection support","description":"attached_molecule: da-wisp-nbpg\nattached_at: 2026-01-29T08:30:22Z\ndispatched_by: dog\n\nUse code-simplifier agent to review the implementation of da-4vd7.\n\nReview focus:\n- State restoration correctness\n- Edge case handling\n- Test coverage\n\nAfter review, create beads for any suggested improvements and sling them for implementation.\n\nParent: da-1tg\nReviewer: code-simplifier","status":"hooked","priority":2,"issue_type":"task","assignee":"da/polecats/nitro","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:37:46.138496209-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-30T12:46:23.712837653-08:00","dependencies":[{"issue_id":"da-dwrq","depends_on_id":"da-4vd7","type":"blocks","created_at":"2026-01-28T23:37:55.486710843-08:00","created_by":"da/crew/moriarty"},{"issue_id":"da-dwrq","depends_on_id":"da-wisp-9yi","type":"blocks","created_at":"2026-01-29T00:30:20.999494373-08:00","created_by":"da/crew/moriarty"},{"issue_id":"da-dwrq","depends_on_id":"da-wisp-nbpg","type":"blocks","created_at":"2026-01-30T12:45:02.958646776-08:00","created_by":"Aaron Leiby"}]}
{"id":"da-64xo","title":"Review: Metadata prefetch integration","description":"attached_molecule: da-wisp-p4z2\nattached_at: 2026-01-30T02:24:39Z\ndispatched_by: dog\n\nUse code-simplifier agent to review the implementation of da-wlza.\n\nReview focus:\n- Prefetch timing and ordering\n- Integration with metadata service API\n- Test coverage\n\nAfter review, create beads for any suggested improvements and sling them for implementation.\n\nParent: da-1tg\nReviewer: code-simplifier","status":"open","priority":2,"issue_type":"task","assignee":"da/polecats/rust","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:37:48.473868968-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-30T13:04:27.400904361-08:00","dependencies":[{"issue_id":"da-64xo","depends_on_id":"da-wlza","type":"blocks","created_at":"2026-01-28T23:37:55.758420593-08:00","created_by":"da/crew/moriarty"},{"issue_id":"da-64xo","depends_on_id":"da-wisp-9b6","type":"blocks","created_at":"2026-01-29T18:24:32.989551112-08:00","created_by":"mayor"},{"issue_id":"da-64xo","depends_on_id":"da-wisp-p4z2","type":"blocks","created_at":"2026-01-30T12:40:37.394710765-08:00","created_by":"Aaron Leiby"}]}
{"id":"da-pxum","title":"Review: Rarity and War mechanics","description":"Use code-simplifier agent to review the implementation of da-jneq.\n\nReview focus:\n- compareCards() helper clarity\n- resolveWar() recursion safety\n- drawWarCards() edge cases\n- Lot priority mapping\n- Test coverage\n\nAfter review, create beads for any suggested improvements and sling them for implementation.\n\nParent: da-1tg\nReviewer: code-simplifier","status":"open","priority":2,"issue_type":"task","owner":"aleiby@gmail.com","created_at":"2026-01-28T23:37:46.993108518-08:00","created_by":"da/crew/moriarty","updated_at":"2026-01-28T23:37:46.993108518-08:00","dependencies":[{"issue_id":"da-pxum","depends_on_id":"da-jneq","type":"blocks","created_at":"2026-01-28T23:37:55.617930243-08:00","created_by":"da/crew/moriarty"}]}
```

---

## Import Instructions

To import these beads into another database:

1. Save the JSONL blocks above to a file (e.g., `war-convoy-beads.jsonl`)
2. Run: `bd import -i war-convoy-beads.jsonl`

Note: You may need to adjust the `id` prefixes if importing into a database with different prefix conventions. The `da-` prefix is specific to this rig; the `hq-cv-` prefix is for HQ-level convoy tracking.
