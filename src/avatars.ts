import { getPlayer } from './cardtable';
import Identicon from 'identicon.js';

export const getAvatar = async (
  userId: string,
  size = 64,
  background: [number, number, number, number] = [11, 47, 108, 255]
): Promise<Buffer | null> => {
  try {
    const player = await getPlayer(userId);
    if (player) {
      return getAvatar(player, size, background);
    }

    const hash = Buffer.from(userId, 'base64').toString('hex');
    const data = new Identicon(hash, { size, background }).toString();
    return Buffer.from(data, 'base64');
  } catch {
    return null;
  }
};
