import { strict as assert } from 'assert';
import { redis } from './redis';

// Lazy imports to avoid circular dependency:
// cardgame.ts -> cardtable.ts -> game-registry.ts -> games/*.ts -> cardgame.ts
// By using dynamic imports, we break the cycle since game classes
// are only loaded when actually needed (not at module initialization).
const gameTypes: Record<string, () => Promise<any>> = {
  Browse: () => import('./games/browse').then((m) => m.Browse),
  Solitaire: () => import('./games/solitaire').then((m) => m.Solitaire),
  War: () => import('./games/war').then((m) => m.War),
};

const newGame = async (className: string, tableId: string) => {
  const GameClass = await gameTypes[className]();
  return new GameClass(tableId);
};

const games: any = {};

export const requiredPlayers = async (name: string): Promise<number> => {
  const GameClass = await gameTypes[name]?.();
  return GameClass?.requiredPlayers ?? 0;
};

export const beginGame = async (name: string, tableId: string) => {
  // Cache name of game FIRST, before loading the module.
  // This ensures resumeGame() can find the game name even if it runs
  // while the dynamic import is still in progress.
  await redis.hSet(tableId, 'game', name);

  const game = await newGame(name, tableId);
  assert(game);

  // TODO: Clean up old game?
  assert(!(tableId in games));
  games[tableId] = game;

  game.begin(true);
};

export const resumeGame = async (tableId: string) => {
  // Get cached name of game, if any.
  const name = await redis.hGet(tableId, 'game');
  if (!name) {
    return null;
  }

  // Create new instance if no one else has yet.
  if (!games[tableId]) {
    const game = await newGame(name, tableId);
    assert(game);

    games[tableId] = game;

    game.begin(false);
  }

  return name;
};
