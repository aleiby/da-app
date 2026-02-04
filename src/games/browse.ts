import { CardGame, ClickDeckArgs, ClickTableArgs } from '../cardgame';
import { initDeck, getDecks, getDeckName, getShuffledDeck, CardDeckMap, getCard } from '../cards';
import { revealCard } from '../cardtable';
import { strict as assert } from 'assert';

export class Browse extends CardGame {
  static get requiredPlayers() {
    return 1;
  }
  getName() {
    return 'Browse';
  }
  getMinPlayers() {
    return Browse.requiredPlayers;
  }
  getMaxPlayers() {
    return Browse.requiredPlayers;
  }

  async begin(initialSetup: boolean) {
    if (!(await super.begin(initialSetup))) {
      return false;
    }

    // Get deck names - use defaults if no decks exist (handles race condition on resume)
    let names = initialSetup ? ['DeckA', 'Hand'] : await getDecks(this.tableId);
    if (!names.includes('Hand')) {
      // Required deck missing - treat as initial setup
      names = ['DeckA', 'Hand'];
      initialSetup = true;
    }
    const decks = await Promise.all(names.map((name) => initDeck(this.tableId, name)));

    const dir: CardDeckMap = {};
    decks.forEach((deck) => (dir[deck.name] = deck));

    const hand = dir['Hand'];
    assert(hand);

    this.onClickDeck(async (args: ClickDeckArgs) => {
      const name = args.deck;
      const selected = args.selected;

      // Add selected cards to deck.
      if (selected && selected.length > 0) {
        if (name in dir) {
          hand.moveIds(selected, dir[name], true);
        }
        return;
      }

      // Limit holding 24 cards.
      if ((await hand.numCards()) >= 24) {
        return;
      }

      // Draw card from deck.
      const deck = dir[name];
      if (deck) {
        const card = await deck.drawCard(hand);
        if (card != null) {
          revealCard(this.tableId, card);
        }
      }
    });

    this.onRightClickDeck(async (args: ClickDeckArgs) => {
      const deck = dir[args.deck];
      if (deck == null) {
        return;
      }

      // Add selected cards to bottom of deck.
      const selected = args.selected;
      if (selected && selected.length > 0) {
        hand.moveIds(selected, deck, deck == hand);
        return;
      }

      // Right click to flip cards.
      if (deck != hand) {
        const id = await deck.peekId();
        if (id != null) {
          deck.flipIds([id]);
          revealCard(this.tableId, await getCard(id));
        }
      }
    });

    this.onClickTable(async (args: ClickTableArgs) => {
      // Create a new deck from selected cards.
      const selected = args.selected;
      if (selected && selected.length > 0) {
        const deck = await initDeck(this.tableId, getDeckName(args.x, args.z));
        hand.moveIds(selected, deck);
        dir[deck.name] = deck;
      }
    });

    const player = this.players[0];
    const deck = dir['DeckA'];
    assert(deck);

    if (initialSetup) {
      const cards = await getShuffledDeck(player);
      cards.sort((a, b) => (b.token_id >= 0 ? 1 : 0) - (a.token_id >= 0 ? 1 : 0)); // owned first
      deck.add(cards);
    }

    console.log('GO');
    return true;
  }
}
