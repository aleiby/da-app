import { CardGame, ClickDeckArgs } from '../cardgame';
import { Card, CardDeck, initDeck, getShuffledDeck, getDeckCards, getCard, DeckContents } from '../cards';
import { broadcastMsg, revealCard } from '../cardtable';
import { allCards, minorCards, totalMinor } from '../tarot';
import { getUserName, sendEvent } from '../connection';
import { sleep } from '../utils';
import { prioritize, Queue } from '../metadata-service';
import { strict as assert } from 'assert';

const WAR_DECK_SIZE = 20;

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
   * End the game with the given winner.
   * Cleans up Redis subscriptions and broadcasts gameOver event.
   */
  async endGame(winner: string) {
    if (this._gameEnded) {
      return;
    }
    this._gameEnded = true;

    const winnerName = await getUserName(winner);
    broadcastMsg(this.tableId, `Game Over! ${winnerName} wins!`);
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

    // Use face value (ignore suit) unless major arcana (which beats minor)
    // TODO: Check rarity first?
    const getValue = (card: Card) => {
      if (card.value < totalMinor) {
        return card.value % minorCards.length;
      }
      return card.value;
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
        const valueA = getValue(cardA);
        const valueB = getValue(cardB);
        if (valueA > valueB) {
          wonA.moveAllFrom([playedA, playedB]);
          const name = await getUserName(playerA);
          broadcastMsg(this.tableId, `${name} wins round`);
        } else if (valueB > valueA) {
          wonB.moveAllFrom([playedA, playedB]);
          const name = await getUserName(playerB);
          broadcastMsg(this.tableId, `${name} wins round`);
        } else {
          broadcastMsg(this.tableId, "It's a tie!");
        }
        cardA = cardB = null;

        // Check if either player can draw for next round
        const [canDrawA, canDrawB] = await Promise.all([
          this.ensureCanDraw(deckA, wonA, playerA),
          this.ensureCanDraw(deckB, wonB, playerB),
        ]);

        if (!canDrawA && !canDrawB) {
          // Both players out of cards - shouldn't happen normally, but handle gracefully
          broadcastMsg(this.tableId, 'Game ended in a draw - both players ran out of cards!');
          sendEvent(this.tableId, 'gameOver', null);
          await this.sub.unsubscribe();
          await this.sub.disconnect();
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
