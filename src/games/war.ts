import { CardGame, ClickDeckArgs } from '../cardgame';
import { Card, CardDeck, initDeck, getShuffledDeck, getDeckCards, getCard, DeckContents } from '../cards';
import { broadcastMsg, revealCard } from '../cardtable';
import { allCards, minorCards, totalMinor } from '../tarot';
import { getUserName, sendEvent } from '../connection';
import { sleep } from '../utils';
import { prioritize, Queue } from '../metadata-service';
import { strict as assert } from 'assert';
import * as metadataService from '../metadata-service';

const WAR_DECK_SIZE = 20;

/**
 * Lot priority mapping (from Unity client).
 * Higher number = rarer = wins ties.
 */
const LOT_PRIORITY: Record<string, number> = {
  spdp: 4, // Rarest
  eifd: 3,
  lnuy: 2,
  hrgl: 1, // Common
};

/**
 * Get the priority value for a lot.
 * Unknown lots and loaner cards (empty lot) have priority 0.
 */
function getLotPriority(lot: string): number {
  return LOT_PRIORITY[lot] || 0;
}

/**
 * Get the face value of a card for comparison.
 * Minor arcana use face value (0-13), major arcana use their full value (56-77).
 * Major arcana beat minor arcana due to higher values.
 */
function getValue(card: Card): number {
  if (card.value < totalMinor) {
    return card.value % minorCards.length;
  }
  return card.value;
}

/**
 * Compare two cards.
 * First compares face values, then rarity (lot priority) on ties.
 * @returns 1 if cardA wins, -1 if cardB wins, 0 if true tie
 */
async function compareCards(cardA: Card, cardB: Card): Promise<number> {
  const valueA = getValue(cardA);
  const valueB = getValue(cardB);

  if (valueA > valueB) return 1;
  if (valueB > valueA) return -1;

  // Face tie - compare rarity
  const [lotA, lotB] = await Promise.all([
    metadataService.requireLot(cardA.id),
    metadataService.requireLot(cardB.id),
  ]);

  const rarityA = getLotPriority(lotA);
  const rarityB = getLotPriority(lotB);

  if (rarityA > rarityB) return 1;
  if (rarityB > rarityA) return -1;

  return 0; // True tie
}

export class War extends CardGame {
  private _gameEnded = false;

  static get requiredPlayers() {
    return 2;
  }
  getName() {
    return 'War';
  }
  getMinPlayers() {
    return War.requiredPlayers;
  }
  getMaxPlayers() {
    return War.requiredPlayers;
  }

  /**
   * End the game with the given winner, or null for a draw.
   * Cleans up Redis subscriptions and broadcasts gameOver event.
   */
  async endGame(winner: string | null) {
    if (this._gameEnded) {
      return;
    }
    this._gameEnded = true;

    if (winner) {
      const winnerName = await getUserName(winner);
      broadcastMsg(this.tableId, `Game Over! ${winnerName} wins!`);
    } else {
      broadcastMsg(this.tableId, 'Game ended in a draw - both players ran out of cards!');
    }
    sendEvent(this.tableId, 'gameOver', winner);

    // Clean up Redis subscriptions
    await this.sub.unsubscribe();
    await this.sub.disconnect();
  }

  /**
   * Ensure a player can draw a card.
   * If deck is empty, reshuffles won pile into deck.
   * Returns true if player can draw, false if game over (both piles empty).
   */
  async ensureCanDraw(deck: CardDeck, won: CardDeck, player: string): Promise<boolean> {
    // Check if deck has cards
    const deckCount = await deck.numCards();
    if (deckCount > 0) {
      return true;
    }

    // Deck empty - check won pile
    const wonCount = await won.numCards();
    if (wonCount === 0) {
      // Game over - player has no cards left
      return false;
    }

    // Reshuffle won pile into deck
    const playerName = await getUserName(player);
    broadcastMsg(this.tableId, `${playerName} reshuffles their won pile`);
    await won.shuffleInto(deck);

    return true;
  }

  async begin(initialSetup: boolean) {
    if (!(await super.begin(initialSetup))) {
      return false;
    }

    const playerA = this.players[0];
    const playerB = this.players[1];
    assert(playerA != playerB);

    // TODO: Store decks in table, send initial state on connect.
    const [deckA, deckB, playedA, playedB, wonA, wonB] = await Promise.all([
      initDeck(this.tableId, 'DeckA'),
      initDeck(this.tableId, 'DeckB'),
      initDeck(this.tableId, 'PlayedA'),
      initDeck(this.tableId, 'PlayedB'),
      initDeck(this.tableId, 'WonA'),
      initDeck(this.tableId, 'WonB'),
    ]);

    const getLastPlayed = async () => {
      const [A, B] = await Promise.all([
        getDeckCards(this.tableId, playedA.name),
        getDeckCards(this.tableId, playedB.name),
      ]);
      if (A.cards.length > B.cards.length) {
        return [await getCard(A.cards[A.cards.length - 1].id), null];
      } else if (B.cards.length > A.cards.length) {
        return [null, await getCard(B.cards[B.cards.length - 1].id)];
      }
      return [null, null];
    };

    let [cardA, cardB] = await getLastPlayed();

    const cards = allCards();

    /**
     * Draw war cards for a player (up to 4: 3 face-down, 1 face-up).
     * If player has fewer than 4 cards, last card is face-up.
     * If player has 0 cards, returns null for faceUp (player loses war).
     */
    const drawWarCards = async (
      deck: CardDeck,
      won: CardDeck,
      played: CardDeck,
      player: string
    ): Promise<{ faceDown: Card[]; faceUp: Card | null }> => {
      const faceDown: Card[] = [];
      let faceUp: Card | null = null;

      for (let i = 0; i < 4; i++) {
        // Ensure we can draw (reshuffle if needed)
        if (!(await this.ensureCanDraw(deck, won, player))) {
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
    };

    /**
     * Resolve a War (tie).
     * Each player places up to 3 cards face-down, then 1 face-up.
     * Winner takes all cards from both played piles.
     * Recursive on repeated ties.
     */
    const resolveWar = async (): Promise<void> => {
      broadcastMsg(this.tableId, 'WAR!');
      await sleep(500);

      // Each player places up to 3 cards face-down, then 1 face-up
      const warCardsA = await drawWarCards(deckA, wonA, playedA, playerA);
      const warCardsB = await drawWarCards(deckB, wonB, playedB, playerB);

      // Check if either player ran out during war
      if (!warCardsA.faceUp) {
        const [loserName, winnerName] = await Promise.all([
          getUserName(playerA),
          getUserName(playerB),
        ]);
        broadcastMsg(this.tableId, `${loserName} has no cards for war! ${winnerName} wins!`);
        await this.endGame(playerB);
        return;
      }
      if (!warCardsB.faceUp) {
        const [winnerName, loserName] = await Promise.all([
          getUserName(playerA),
          getUserName(playerB),
        ]);
        broadcastMsg(this.tableId, `${loserName} has no cards for war! ${winnerName} wins!`);
        await this.endGame(playerA);
        return;
      }

      // Reveal face-up cards
      revealCard(this.tableId, warCardsA.faceUp);
      revealCard(this.tableId, warCardsB.faceUp);

      const nameA = await getUserName(playerA);
      const nameB = await getUserName(playerB);
      broadcastMsg(this.tableId, `${nameA} reveals ${cards[warCardsA.faceUp.value]}`);
      broadcastMsg(this.tableId, `${nameB} reveals ${cards[warCardsB.faceUp.value]}`);

      await sleep(1000);

      const result = await compareCards(warCardsA.faceUp, warCardsB.faceUp);

      if (result > 0) {
        wonA.moveAllFrom([playedA, playedB]);
        broadcastMsg(this.tableId, `${nameA} wins the war!`);
      } else if (result < 0) {
        wonB.moveAllFrom([playedA, playedB]);
        broadcastMsg(this.tableId, `${nameB} wins the war!`);
      } else {
        // Another tie - recursive war!
        broadcastMsg(this.tableId, 'Another tie!');
        await resolveWar();
      }
    };

    // Hook up client commands
    this.onClickDeck(async (args: ClickDeckArgs) => {
      const player = args.userId;
      const name = args.deck;

      // Wait for board to clear
      if (cardA && cardB) {
        return;
      }

      // Select a card if haven't already
      if (player === playerA) {
        if (cardA === null && name === deckA.name) {
          cardA = await deckA.drawCard(playedA);
          if (cardA != null) {
            revealCard(this.tableId, cardA);
            const name = await getUserName(playerA);
            broadcastMsg(this.tableId, `${name} played ${cards[cardA.value]}`);
          }
        }
      } else {
        if (cardB === null && name === deckB.name) {
          cardB = await deckB.drawCard(playedB);
          if (cardB != null) {
            revealCard(this.tableId, cardB);
            const name = await getUserName(playerB);
            broadcastMsg(this.tableId, `${name} played ${cards[cardB.value]}`);
          }
        }
      }

      // Once both selected
      if (cardA && cardB) {
        await sleep(1000);
        const result = await compareCards(cardA, cardB);

        if (result > 0) {
          wonA.moveAllFrom([playedA, playedB]);
          const name = await getUserName(playerA);
          broadcastMsg(this.tableId, `${name} wins round`);
        } else if (result < 0) {
          wonB.moveAllFrom([playedA, playedB]);
          const name = await getUserName(playerB);
          broadcastMsg(this.tableId, `${name} wins round`);
        } else {
          // True tie (same face value and same rarity) - trigger traditional War
          await resolveWar();
          // If game ended during war, don't continue with post-round checks
          if (this._gameEnded) {
            cardA = cardB = null;
            return;
          }
        }
        cardA = cardB = null;

        // Check if either player can draw for next round
        const [canDrawA, canDrawB] = await Promise.all([
          this.ensureCanDraw(deckA, wonA, playerA),
          this.ensureCanDraw(deckB, wonB, playerB),
        ]);

        if (!canDrawA && !canDrawB) {
          // Both players out of cards - draw
          await this.endGame(null);
        } else if (!canDrawA) {
          await this.endGame(playerB);
        } else if (!canDrawB) {
          await this.endGame(playerA);
        }
      }
    });

    if (initialSetup) {
      const cardsA = await getShuffledDeck(playerA, DeckContents.AllCards, WAR_DECK_SIZE);
      const cardsB = await getShuffledDeck(playerB, DeckContents.AllCards, WAR_DECK_SIZE);
      deckA.add(cardsA);
      deckB.add(cardsB);

      // Prefetch metadata in draw order (interleaved since both players draw together)
      const cardIds: number[] = [];
      const maxLen = Math.max(cardsA.length, cardsB.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < cardsA.length) cardIds.push(cardsA[i].id);
        if (i < cardsB.length) cardIds.push(cardsB[i].id);
      }
      prioritize(cardIds, Queue.ActiveGame);
    }

    console.log('GO');
    return true;
  }
}
