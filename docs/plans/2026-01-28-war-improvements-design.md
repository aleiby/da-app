# War Game Improvements Design

Issue: da-1tg

## Overview

This design addresses three TODOs in the War game implementation plus supporting infrastructure:

1. **Deck size configuration** - Start with 20 cards each instead of full deck
2. **Rarity tiebreaker** - NFT lot determines winner when face values match
3. **Game over handling** - Reshuffle won pile when deck empties, detect winner
4. **Reconnection support** - Restore mid-round state on reconnect

Additionally, a **background metadata service** is needed to make rarity data available for game logic.

## Task Breakdown

These tasks are designed for parallel execution by independent workers.

### Task 1: Deck Size Configuration
**File:** `src/games/war.ts`

Add constant and pass to `getShuffledDeck()`:

```typescript
const WAR_DECK_SIZE = 20;

// In begin(), change:
deckA.add(await getShuffledDeck(playerA, DeckContents.AllCards, WAR_DECK_SIZE));
deckB.add(await getShuffledDeck(playerB, DeckContents.AllCards, WAR_DECK_SIZE));
```

**Tests:**
- Verify each player starts with exactly 20 cards
- Verify cards are randomly selected from full tarot deck

---

### Task 2: Background Metadata Service
**New file:** `src/metadata-service.ts`

A background worker that fetches IPFS metadata and caches lot information in Redis.

**Deployment:** Runs as a worker loop within the main server process (started via `setInterval` or async loop on server startup). Can be extracted to separate process later if needed - the Redis-based queue design supports either model.

#### Redis Structure
```
metadata:queue:0     # Urgent - games blocked waiting
metadata:queue:1     # Active game - score = deck position
metadata:queue:2     # Newly registered - score = timestamp
metadata:queue:3     # Cold crawl - score = card_id

metadata:cached      # Set of card IDs with lot cached
metadata:inflight    # Hash: card_id -> fetch_started_timestamp
```

#### Worker Loop
```typescript
async function metadataWorker() {
  while (true) {
    // Find work from highest priority queue
    let cardId = null;
    for (const priority of [0, 1, 2, 3]) {
      const result = await redis.zPopMin(`metadata:queue:${priority}`);
      if (result) {
        cardId = result.value;
        break;
      }
    }

    if (!cardId) {
      await sleep(100);
      continue;
    }

    // Skip if already cached
    if (await redis.sIsMember('metadata:cached', cardId)) {
      continue;
    }

    // Mark in-flight
    await redis.hSet('metadata:inflight', cardId, Date.now());

    // Fetch from IPFS
    const card = await getCard(cardId);
    const lot = await fetchLotFromIPFS(card.ipfsUri);

    // Cache result
    await redis.hSet(`card:${cardId}`, 'lot', lot);
    await redis.sAdd('metadata:cached', cardId);
    await redis.hDel('metadata:inflight', cardId);

    // Notify waiters
    await redis.publish(`metadata:ready:${cardId}`, lot);

    // Rate limit (Pinata: ~2/sec)
    await sleep(500);
  }
}
```

#### Public API
```typescript
// Non-blocking: queue cards for prefetch by position
function prioritize(cardIds: number[], queue: number, startScore = 0): void

// Blocking: need lot NOW, bumps to urgent queue
async function requireLot(cardId: number): Promise<string>

// Check if lot is cached
async function getLotIfCached(cardId: number): Promise<string | null>
```

#### IPFS Fetch Helper
```typescript
async function fetchLotFromIPFS(ipfsUri: string): Promise<string> {
  if (!ipfsUri) return '';  // Loaner card

  const url = ipfsUri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
  const response = await fetch(url);
  const metadata = await response.json();
  return metadata.lot || '';
}
```

**Tests:**
- Worker processes urgent queue before lower priority queues
- Worker respects rate limiting
- `requireLot()` blocks until metadata available
- `requireLot()` returns immediately if already cached
- Duplicate card IDs in queue are deduplicated
- Failed IPFS fetches are retried with backoff
- Cards without ipfsUri (loaners) get empty lot cached

---

### Task 3: Rarity Tiebreaker & Traditional War
**File:** `src/games/war.ts`

#### Lot Priority (from Unity client)
```typescript
const LOT_PRIORITY: Record<string, number> = {
  'spdp': 4,  // Rarest
  'eifd': 3,
  'lnuy': 2,
  'hrgl': 1,  // Common
};

function getLotPriority(lot: string): number {
  return LOT_PRIORITY[lot] || 0;  // Unknown/loaner = lowest
}
```

#### Card Comparison Helper
```typescript
const getValue = (card: Card) => {
  const faceValue = card.value < totalMinor
    ? card.value % minorCards.length
    : card.value;
  return faceValue;
};

// Returns: 1 if A wins, -1 if B wins, 0 if true tie
async function compareCards(cardA: Card, cardB: Card): Promise<number> {
  const valueA = getValue(cardA);
  const valueB = getValue(cardB);

  if (valueA > valueB) return 1;
  if (valueB > valueA) return -1;

  // Face tie - compare rarity
  const lotA = await metadataService.requireLot(cardA.id);
  const lotB = await metadataService.requireLot(cardB.id);

  const rarityA = getLotPriority(lotA);
  const rarityB = getLotPriority(lotB);

  if (rarityA > rarityB) return 1;
  if (rarityB > rarityA) return -1;

  return 0;  // True tie
}
```

#### Traditional War Mechanics
When both face value and rarity tie, trigger "War":

```typescript
async function resolveWar(
  deckA: CardDeck, deckB: CardDeck,
  playedA: CardDeck, playedB: CardDeck,
  wonA: CardDeck, wonB: CardDeck,
  playerA: string, playerB: string,
  tableId: string
): Promise<void> {
  broadcastMsg(tableId, "WAR!");

  // Each player places up to 3 cards face-down, then 1 face-up
  // If fewer than 4 cards available, last card is the face-up
  const warCardsA = await drawWarCards(deckA, wonA, playedA, playerA, tableId);
  const warCardsB = await drawWarCards(deckB, wonB, playedB, playerB, tableId);

  // Check if either player ran out during war
  if (!warCardsA.faceUp) {
    const name = await getUserName(playerB);
    broadcastMsg(tableId, `${playerA} has no cards for war! ${name} wins!`);
    await endGame(playerB);
    return;
  }
  if (!warCardsB.faceUp) {
    const name = await getUserName(playerA);
    broadcastMsg(tableId, `${playerB} has no cards for war! ${name} wins!`);
    await endGame(playerA);
    return;
  }

  // Reveal face-up cards
  revealCard(tableId, warCardsA.faceUp);
  revealCard(tableId, warCardsB.faceUp);

  const nameA = await getUserName(playerA);
  const nameB = await getUserName(playerB);
  broadcastMsg(tableId, `${nameA} reveals ${cards[warCardsA.faceUp.value]}`);
  broadcastMsg(tableId, `${nameB} reveals ${cards[warCardsB.faceUp.value]}`);

  await sleep(1000);

  const result = await compareCards(warCardsA.faceUp, warCardsB.faceUp);

  if (result > 0) {
    wonA.moveAllFrom([playedA, playedB]);
    broadcastMsg(tableId, `${nameA} wins the war!`);
  } else if (result < 0) {
    wonB.moveAllFrom([playedA, playedB]);
    broadcastMsg(tableId, `${nameB} wins the war!`);
  } else {
    // Another tie - recursive war!
    broadcastMsg(tableId, "Another tie!");
    await resolveWar(deckA, deckB, playedA, playedB, wonA, wonB, playerA, playerB, tableId);
  }
}

async function drawWarCards(
  deck: CardDeck,
  won: CardDeck,
  played: CardDeck,
  player: string,
  tableId: string
): Promise<{ faceDown: Card[], faceUp: Card | null }> {
  const faceDown: Card[] = [];
  let faceUp: Card | null = null;

  for (let i = 0; i < 4; i++) {
    // Ensure we can draw (reshuffle if needed)
    if (!await ensureCanDraw(deck, won, player, tableId)) {
      // Out of cards entirely - return what we have
      // Last drawn card becomes face-up if we have any
      if (faceDown.length > 0) {
        faceUp = faceDown.pop()!;
      }
      return { faceDown, faceUp };
    }

    const card = await deck.drawCard(played);
    if (!card) break;

    if (i < 3) {
      faceDown.push(card);
      // Face-down cards stay hidden
    } else {
      faceUp = card;
    }
  }

  // Edge case: had exactly 1-3 cards, last one is face-up
  if (!faceUp && faceDown.length > 0) {
    faceUp = faceDown.pop()!;
  }

  return { faceDown, faceUp };
}
```

#### Updated Round Resolution
```typescript
// In round resolution after both cards played:
const result = await compareCards(cardA, cardB);

if (result > 0) {
  wonA.moveAllFrom([playedA, playedB]);
  const name = await getUserName(playerA);
  broadcastMsg(tableId, `${name} wins round`);
} else if (result < 0) {
  wonB.moveAllFrom([playedA, playedB]);
  const name = await getUserName(playerB);
  broadcastMsg(tableId, `${name} wins round`);
} else {
  // True tie - trigger traditional War
  await resolveWar(deckA, deckB, playedA, playedB, wonA, wonB, playerA, playerB, tableId);
}
```

**Tests:**
- Higher face value wins regardless of rarity
- Equal face value: higher lot priority wins
- Equal face value, equal lot: triggers War
- War: 3 face-down + 1 face-up from each player
- War with < 4 cards: last card is face-up
- War with 0 cards: player loses immediately
- Recursive war on repeated ties
- Loaner cards (no lot) lose to any NFT in rarity comparison
- All war cards go to winner's won pile

---

### Task 4: Game Over & Won Pile Reshuffle
**Files:** `src/games/war.ts`, `src/cards.ts`

#### New CardDeck Method
```typescript
// In CardDeck class (src/cards.ts):
async shuffleInto(to: CardDeck) {
  const idStrings = await redis.zRange(this.key, 0, -1);
  if (idStrings.length === 0) return;

  const ids = idStrings.map(Number);
  shuffle(ids);  // Randomize order

  // Clear source
  await redis.del(this.key);
  await redis.del(this._facingKey);

  // Add to destination in shuffled order
  to.addIds(ids);
}
```

#### Ensure Can Draw Helper
```typescript
// In war.ts:
async function ensureCanDraw(
  deck: CardDeck,
  won: CardDeck,
  player: string,
  tableId: string
): Promise<boolean> {
  const deckCount = await deck.numCards();
  if (deckCount > 0) return true;

  const wonCount = await won.numCards();
  if (wonCount === 0) return false;  // Game over

  // Reshuffle won pile into deck
  await won.shuffleInto(deck);
  const name = await getUserName(player);
  broadcastMsg(tableId, `${name} reshuffles won pile (${wonCount} cards)`);

  // Re-prioritize metadata for new deck order
  const cards = await getDeckCards(tableId, deck.name);
  metadataService.prioritize(cards.cards.map(c => c.id), 1);

  return true;
}
```

#### Game Over Check (after each round)
```typescript
cardA = cardB = null;

if (!await ensureCanDraw(deckA, wonA, playerA, this.tableId)) {
  const name = await getUserName(playerB);
  broadcastMsg(this.tableId, `${name} wins the game!`);
  await this.endGame(playerB);
  return;
}

if (!await ensureCanDraw(deckB, wonB, playerB, this.tableId)) {
  const name = await getUserName(playerA);
  broadcastMsg(this.tableId, `${name} wins the game!`);
  await this.endGame(playerA);
  return;
}
```

#### End Game Method
```typescript
async endGame(winner: string | null) {
  // Clean up subscriptions
  await this.sub.unsubscribe();
  await this.sub.disconnect();

  // Broadcast final state
  if (winner) {
    sendEvent(this.tableId, 'gameOver', { winner });
  } else {
    sendEvent(this.tableId, 'gameOver', { draw: true });
  }

  // TODO: Handle escrow/rewards if applicable
}
```

**Tests:**
- Player with empty deck and cards in won pile: reshuffles and continues
- Player with empty deck and empty won pile: loses
- Reshuffle broadcasts message to both players
- Reshuffle re-prioritizes metadata for new card order
- Game over event sent to clients
- Game subscriptions cleaned up on end

---

### Task 5: Reconnection Support
**File:** `src/games/war.ts`

The infrastructure already exists. Fix is minimal:

```typescript
async begin(initialSetup: boolean) {
  if (!(await super.begin(initialSetup))) {
    return false;
  }

  // ... deck initialization ...

  // Restore mid-round state on reconnect
  let [cardA, cardB] = await getLastPlayed();

  // ... rest of game logic ...
}
```

The existing `getLastPlayed()` helper (lines 42-53) already checks the played piles to determine if a round is in progress.

**Tests:**
- Player disconnects mid-round, reconnects: sees cards already played
- Player disconnects between rounds, reconnects: clean state, can draw
- Both players disconnect and reconnect: game resumes correctly

---

### Task 6: Metadata Prefetch Integration
**File:** `src/games/war.ts`

After dealing cards, prefetch metadata in draw order:

```typescript
if (initialSetup) {
  const cardsA = await getShuffledDeck(playerA, DeckContents.AllCards, WAR_DECK_SIZE);
  const cardsB = await getShuffledDeck(playerB, DeckContents.AllCards, WAR_DECK_SIZE);

  deckA.add(cardsA);
  deckB.add(cardsB);

  // Prefetch metadata in draw order (top of deck = lowest score)
  metadataService.prioritize(cardsA.map(c => c.id), 1, 0);
  metadataService.prioritize(cardsB.map(c => c.id), 1, 0);
}
```

**Tests:**
- Game start queues all 40 cards for metadata prefetch
- Cards are queued at priority level 1 (active game)
- Scores reflect deck position (top = 0, bottom = 19)

---

## Test File Structure

### New: `src/tests/test-metadata-service.ts`
- Queue priority ordering (urgent before active game before registered)
- Worker rate limiting (~500ms between fetches)
- IPFS fetch mocking (success, failure, retry)
- Cache behavior (skip already-cached cards)
- Pub/sub notifications (`metadata:ready:{cardId}`)
- `requireLot()` blocks until available
- `getLotIfCached()` returns null if not cached

### Updated: `src/tests/games/test-war.ts`
- Deck size verification (20 cards each)
- Face value comparison (higher wins)
- Rarity tiebreaker (higher lot priority wins)
- Traditional War mechanics:
  - War triggers on true tie (same face, same lot)
  - Each player puts 3 down, 1 up
  - Player with < 4 cards uses last card as face-up
  - Player with 0 cards loses immediately
  - Recursive war on repeated ties
  - All cards go to winner
- Game over detection (empty deck + empty won pile)
- Won pile reshuffle (deck empty, won pile has cards)
- Reconnection state restoration (mid-round, between rounds)
- Metadata prefetch on game start (40 cards queued)

### Updated: `src/tests/test-cards.ts`
- `CardDeck.shuffleInto()` method
  - Cards are randomized
  - Source deck is emptied
  - Destination deck receives all cards

---

## Dependencies

```
Task 1 (Deck Size)              - Independent
Task 2 (Metadata Service)       - Independent
Task 3 (Rarity & War Mechanics) - Depends on Task 2, Task 4
Task 4 (Game Over/Reshuffle)    - Independent
Task 5 (Reconnection)           - Independent
Task 6 (Prefetch)               - Depends on Task 2
```

**Execution order:**
1. **Phase 1** (parallel): Tasks 1, 2, 4, 5
2. **Phase 2** (parallel, after Phase 1): Tasks 3, 6

Task 3 depends on Task 4 because `resolveWar()` calls `ensureCanDraw()` during war card drawing.

---

## Design Decisions

1. **Tie mechanics**: Traditional War (3 down, 1 up). If player has fewer than 4 cards, their last card is the face-up.

2. **Metadata service deployment**: Worker thread in main server (Option B). Simpler ops, sufficient for current scale. Redis-based queue supports extraction to separate process later if needed.

3. **Fallback behavior**: Block the game until metadata available. Consider persistent caching mechanisms for future games.

4. **Escrow/rewards**: Deferred. Out of scope for this design.
