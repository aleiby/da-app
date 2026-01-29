/**
 * Background Metadata Service for Digital Arcana
 *
 * Fetches IPFS metadata and caches lot information in Redis.
 * Runs as a worker loop in the main server process.
 *
 * Redis Structure:
 * - metadata:queue:0 (urgent - games blocked, score = timestamp)
 * - metadata:queue:1 (active game - score = deck position)
 * - metadata:queue:2 (newly registered - score = timestamp)
 * - metadata:queue:3 (cold crawl - score = card_id)
 * - metadata:cached (set of card IDs with lot cached)
 * - metadata:inflight (hash: card_id -> fetch_started_timestamp)
 * - metadata:lot:<card_id> (string: lot name)
 */
import { redis } from './redis';

// Queue priority levels (lower = higher priority)
export const enum Queue {
  Urgent = 0, // Games blocked waiting for metadata
  ActiveGame = 1, // Cards in active games (prefetch)
  NewlyRegistered = 2, // Just discovered cards
  ColdCrawl = 3, // Background crawl of all cards
}

// Redis key prefixes
const QUEUE_PREFIX = 'metadata:queue:';
const CACHED_SET = 'metadata:cached';
const INFLIGHT_HASH = 'metadata:inflight';
const LOT_PREFIX = 'metadata:lot:';
const NOTIFY_CHANNEL = 'metadata:ready';

// Rate limiting: ~2 requests per second for Pinata
const RATE_LIMIT_MS = 500;
const INFLIGHT_TIMEOUT_MS = 30000; // 30 seconds before considering a fetch stale

// IPFS gateway for fetching metadata
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

// Worker state
let workerRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

/**
 * Metadata structure from IPFS JSON
 */
interface CardMetadata {
  name: string;
  symbol: string;
  decimals: number;
  shouldPreferSymbol: boolean;
  thumbnailUri: string;
  artifactUri: string;
  displayUri: string;
  minter: string;
  creators: string[];
  isBooleanAmount: boolean;
  set: string;
  minting: string;
  lot: string;
}

/**
 * Convert ipfs:// URI to HTTP gateway URL
 */
function ipfsToHttp(ipfsUri: string): string {
  if (ipfsUri.startsWith('ipfs://')) {
    return IPFS_GATEWAY + ipfsUri.slice(7);
  }
  return ipfsUri;
}

/**
 * Add cards to a priority queue for prefetching.
 * Non-blocking - cards are queued and fetched in background.
 *
 * @param cardIds - Array of card IDs to queue
 * @param queue - Queue priority level
 * @param startScore - Starting score for ordering (interpretation depends on queue)
 */
export async function prioritize(
  cardIds: number[],
  queue: Queue,
  startScore: number = Date.now()
): Promise<void> {
  if (cardIds.length === 0) return;

  // Filter out cards that are already cached
  const cachedCheck = await redis.smIsMember(
    CACHED_SET,
    cardIds.map((id) => String(id))
  );
  const uncachedIds = cardIds.filter((_, i) => !cachedCheck[i]);

  if (uncachedIds.length === 0) return;

  // Add to appropriate queue
  const queueKey = QUEUE_PREFIX + queue;
  const members = uncachedIds.map((id, i) => ({
    score: startScore + i,
    value: String(id),
  }));

  await redis.zAdd(queueKey, members, { NX: true }); // Only add if not already in queue
}

/**
 * Get lot information for a card, blocking until available.
 * If not cached, bumps the card to urgent queue and waits.
 *
 * @param cardId - Card ID to get lot for
 * @returns The lot name (e.g., "xxxx")
 */
export async function requireLot(cardId: number): Promise<string> {
  const cardIdStr = String(cardId);

  // Check if already cached
  const cached = await redis.get(LOT_PREFIX + cardIdStr);
  if (cached !== null) {
    return cached;
  }

  // Not cached - add to urgent queue and wait
  await prioritize([cardId], Queue.Urgent, Date.now());

  // Subscribe and wait for notification
  return new Promise((resolve, reject) => {
    const subscriber = redis.duplicate();
    const timeout = setTimeout(() => {
      subscriber.disconnect();
      reject(new Error(`Timeout waiting for metadata for card ${cardId}`));
    }, INFLIGHT_TIMEOUT_MS);

    subscriber.connect().then(async () => {
      // Check again in case it was fetched while we were setting up
      const cached = await redis.get(LOT_PREFIX + cardIdStr);
      if (cached !== null) {
        clearTimeout(timeout);
        await subscriber.disconnect();
        resolve(cached);
        return;
      }

      await subscriber.subscribe(NOTIFY_CHANNEL, (message) => {
        if (message === cardIdStr) {
          clearTimeout(timeout);
          redis.get(LOT_PREFIX + cardIdStr).then((lot) => {
            subscriber.disconnect();
            if (lot !== null) {
              resolve(lot);
            } else {
              reject(new Error(`Failed to fetch metadata for card ${cardId}`));
            }
          });
        }
      });
    });
  });
}

/**
 * Get lot information for a card if cached, otherwise return null.
 * Non-blocking - returns immediately.
 *
 * @param cardId - Card ID to check
 * @returns The lot name if cached, null otherwise
 */
export async function getLotIfCached(cardId: number): Promise<string | null> {
  return await redis.get(LOT_PREFIX + String(cardId));
}

/**
 * Check if a card's metadata is cached.
 *
 * @param cardId - Card ID to check
 * @returns true if cached
 */
export async function isCached(cardId: number): Promise<boolean> {
  const result = await redis.sIsMember(CACHED_SET, String(cardId));
  return Boolean(result);
}

/**
 * Fetch metadata from IPFS and cache the lot.
 * Returns true if successful, false otherwise.
 */
async function fetchAndCacheMetadata(cardId: number, ipfsUri: string): Promise<boolean> {
  const cardIdStr = String(cardId);

  // Mark as inflight
  await redis.hSet(INFLIGHT_HASH, cardIdStr, String(Date.now()));

  try {
    const url = ipfsToHttp(ipfsUri);
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to fetch metadata for card ${cardId}: ${response.status}`);
      return false;
    }

    const metadata: CardMetadata = await response.json();

    // Cache the lot
    await redis.set(LOT_PREFIX + cardIdStr, metadata.lot);
    await redis.sAdd(CACHED_SET, cardIdStr);

    // Notify waiters
    await redis.publish(NOTIFY_CHANNEL, cardIdStr);

    return true;
  } catch (error) {
    console.error(`Error fetching metadata for card ${cardId}:`, error);
    return false;
  } finally {
    // Remove from inflight
    await redis.hDel(INFLIGHT_HASH, cardIdStr);
  }
}

/**
 * Get the next card to process from the queues.
 * Processes queues in priority order (0 = highest priority).
 * Returns null if all queues are empty.
 */
async function getNextCard(): Promise<{ cardId: number; queue: Queue } | null> {
  for (let q = Queue.Urgent; q <= Queue.ColdCrawl; q++) {
    const queueKey = QUEUE_PREFIX + q;
    const results = await redis.zRange(queueKey, 0, 0);
    if (results.length > 0) {
      return { cardId: Number(results[0]), queue: q };
    }
  }
  return null;
}

/**
 * Remove a card from its queue.
 */
async function removeFromQueue(cardId: number, queue: Queue): Promise<void> {
  await redis.zRem(QUEUE_PREFIX + queue, String(cardId));
}

/**
 * Check if a card is stale in the inflight set.
 */
async function isInflightStale(cardId: number): Promise<boolean> {
  const timestamp = await redis.hGet(INFLIGHT_HASH, String(cardId));
  if (timestamp === null) return false;
  return Date.now() - Number(timestamp) > INFLIGHT_TIMEOUT_MS;
}

/**
 * Worker loop that processes the metadata queues.
 * Fetches one card at a time, respecting rate limits.
 */
async function workerLoop(): Promise<void> {
  if (!workerRunning) return;

  const next = await getNextCard();
  if (next === null) {
    // No work to do
    return;
  }

  const { cardId, queue } = next;
  const cardIdStr = String(cardId);

  // Check if already cached (might have been cached while in queue)
  if (await redis.sIsMember(CACHED_SET, cardIdStr)) {
    await removeFromQueue(cardId, queue);
    return;
  }

  // Check if already inflight (and not stale)
  const inflight = await redis.hGet(INFLIGHT_HASH, cardIdStr);
  if (inflight !== null && !(await isInflightStale(cardId))) {
    // Someone else is fetching, skip for now
    return;
  }

  // Get the card's ipfsUri from Redis
  const cardData = await redis.hGetAll(`card:${cardId}`);
  if (!cardData.ipfsUri || cardData.ipfsUri === '') {
    // No IPFS URI, can't fetch - remove from queue
    console.warn(`Card ${cardId} has no ipfsUri, removing from queue`);
    await removeFromQueue(cardId, queue);
    return;
  }

  // Fetch and cache
  const success = await fetchAndCacheMetadata(cardId, cardData.ipfsUri);

  // Remove from queue regardless of success (avoid infinite loops)
  await removeFromQueue(cardId, queue);

  if (!success) {
    // Could re-queue with lower priority, but for now just log
    console.error(`Failed to fetch metadata for card ${cardId}`);
  }
}

/**
 * Start the metadata worker.
 * Should be called once when the server starts.
 */
export function startWorker(): void {
  if (workerRunning) return;

  workerRunning = true;
  console.log('Metadata worker started');

  workerInterval = setInterval(async () => {
    try {
      await workerLoop();
    } catch (error) {
      console.error('Metadata worker error:', error);
    }
  }, RATE_LIMIT_MS);
}

/**
 * Stop the metadata worker.
 * Used for graceful shutdown and testing.
 */
export function stopWorker(): void {
  workerRunning = false;
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  console.log('Metadata worker stopped');
}

/**
 * Check if the worker is running.
 */
export function isWorkerRunning(): boolean {
  return workerRunning;
}

/**
 * Get queue statistics for monitoring.
 */
export async function getQueueStats(): Promise<{
  urgent: number;
  activeGame: number;
  newlyRegistered: number;
  coldCrawl: number;
  cached: number;
  inflight: number;
}> {
  const [urgent, activeGame, newlyRegistered, coldCrawl, cached, inflight] = await Promise.all([
    redis.zCard(QUEUE_PREFIX + Queue.Urgent),
    redis.zCard(QUEUE_PREFIX + Queue.ActiveGame),
    redis.zCard(QUEUE_PREFIX + Queue.NewlyRegistered),
    redis.zCard(QUEUE_PREFIX + Queue.ColdCrawl),
    redis.sCard(CACHED_SET),
    redis.hLen(INFLIGHT_HASH),
  ]);

  return {
    urgent,
    activeGame,
    newlyRegistered,
    coldCrawl,
    cached,
    inflight,
  };
}
