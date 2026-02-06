import { Card } from './cards';
import { getUserName, sendEvent } from './connection';
import { redis } from './redis';

export const newTable = async (userIds: string[]) => {
  const getNextTableId = async () => {
    const id = await redis.incr('nextTableId');
    return `table:${id}`;
  };

  const tableId = await getNextTableId();
  redis.zAdd(
    `${tableId}:players`,
    userIds.map((userId, index) => ({ score: index, value: userId }))
  );

  for (const userId of userIds) {
    // Remove userId from prev table's players list
    const prevTableId = await redis.hGet(userId, 'table');
    if (prevTableId && prevTableId !== tableId) {
      await redis.zRem(`${prevTableId}:players`, userId);
      // Notify remaining players at the old table that this player left
      sendEvent(prevTableId, 'playerLeft', userId);
    }

    // Store table across sessions.
    redis.hSet(userId, 'table', tableId);

    // Notify all connections of new table.
    sendEvent(userId, 'setTable', tableId);

    // Send welcome messages.
    const name = await getUserName(userId);
    broadcastMsg(tableId, `Player ${name} has joined the table!`, userId);
  }

  return tableId;
};

// Get the wallet addresses for the players at the table
export const getPlayers = async (tableId: string) => {
  return await redis.zRange(`${tableId}:players`, 0, -1);
};

// Remove a player from the table's player list
export const removePlayer = async (tableId: string, userId: string) => {
  await redis.zRem(`${tableId}:players`, userId);
  // Notify remaining players that someone left
  sendEvent(tableId, 'playerLeft', userId);
};

// Get the number of players at the table
export const numPlayers = async (tableId: string) => {
  return await redis.zCard(`${tableId}:players`);
};

// Get the player's index at the table (0, 1, 2, etc.)
export const getPlayerSlot = async (tableId: string, userId: string) => {
  return await redis.zScore(`${tableId}:players`, userId);
};

// Get the player's position at the table (A, B, etc.)
export const getPlayerSeat = async (tableId: string, userId: string) => {
  const index = await getPlayerSlot(tableId, userId);
  return index != undefined ? String.fromCharCode(65 + Number(index)) : 'undefined';
};

// Get the userId for a given table slot (0=A, 1=B, etc.)
export const getPlayerBySlot = async (tableId: string, slot: number) => {
  const results = await redis.zRangeByScore(`${tableId}:players`, slot, slot);
  return results.length > 0 ? results[0] : null;
};

// Get the userId for table:tableId:slot
export const getPlayer = async (tableIdAndSlot: string) => {
  if (!tableIdAndSlot.startsWith('table:')) {
    return null;
  }
  const i = tableIdAndSlot.lastIndexOf(':');
  const tableId = tableIdAndSlot.substring(0, i);
  const slot = Number(tableIdAndSlot.substring(i + 1));
  return await getPlayerBySlot(tableId, slot);
};

// Send a message to everyone at the table (with optional exclude userId).
export const broadcastMsg = async (tableId: string, text: string, exclude?: string) => {
  const debug = true;
  if (debug) {
    text = `${tableId}> ${text}`;
  }
  const msg = JSON.stringify({ event: 'msg', args: [text], exclude });
  redis.xAdd(`${tableId}:chat`, '*', { msg });
};

// toId can be tableId or individual userId
export const revealCard = (toId: string, card: Card) => revealCards(toId, [card]);
export const revealCards = (toId: string, cards: Card[]) => {
  sendEvent(toId, 'revealCards', cards);
};
