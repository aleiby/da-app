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
const RETRY_HASH = 'metadata:retries'; // Tracks retry state per card (JSON: {count, retryAfter})

// Rate limiting: ~2 requests per second for Pinata
const RATE_LIMIT_MS = 500;
const INFLIGHT_TIMEOUT_MS = 30000; // 30 seconds before considering a fetch stale
const STALE_CLEANUP_INTERVAL_MS = 10000; // Check for stale inflight entries every 10 seconds

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5000; // 5 seconds, doubles each retry (exponential backoff)

// IPFS gateway for fetching metadata
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

/**
 * Result of a metadata fetch attempt
 */
const enum FetchResult {
  Success = 'success',
  TransientError = 'transient', // Network timeouts, 5xx - should retry
  PermanentError = 'permanent', // 404, invalid data - should not retry
}

// Worker state
let workerRunning = false;
let workerTimeout: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;

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
 * Returns FetchResult indicating success or error type.
 */
async function fetchAndCacheMetadata(cardId: number, ipfsUri: string): Promise<FetchResult> {
  const cardIdStr = String(cardId);

  // Mark as inflight
  await redis.hSet(INFLIGHT_HASH, cardIdStr, String(Date.now()));

  try {
    const url = ipfsToHttp(ipfsUri);
    const response = await fetch(url);

    if (!response.ok) {
      const status = response.status;
      console.error(`Failed to fetch metadata for card ${cardId}: ${status}`);
      // 4xx errors (except 408/429) are permanent - resource not found or invalid
      // 5xx errors and 408/429 are transient - server issues or rate limiting
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        return FetchResult.PermanentError;
      }
      return FetchResult.TransientError;
    }

    const metadata: CardMetadata = await response.json();

    // Cache the lot
    await redis.set(LOT_PREFIX + cardIdStr, metadata.lot);
    await redis.sAdd(CACHED_SET, cardIdStr);

    // Notify waiters
    await redis.publish(NOTIFY_CHANNEL, cardIdStr);

    return FetchResult.Success;
  } catch (error) {
    // Network errors, timeouts, JSON parse errors - treat as transient
    console.error(`Error fetching metadata for card ${cardId}:`, error);
    return FetchResult.TransientError;
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
 * Clean up stale inflight entries.
 * Removes entries that have been inflight longer than INFLIGHT_TIMEOUT_MS
 * and re-queues them for fetching.
 */
async function cleanupStaleInflight(): Promise<void> {
  const now = Date.now();
  const entries = await redis.hGetAll(INFLIGHT_HASH);

  for (const [cardIdStr, timestampStr] of Object.entries(entries)) {
    const timestamp = Number(timestampStr);
    if (now - timestamp > INFLIGHT_TIMEOUT_MS) {
      // Remove from inflight
      await redis.hDel(INFLIGHT_HASH, cardIdStr);
      // Re-queue as urgent since games may be waiting
      await redis.zAdd(QUEUE_PREFIX + Queue.Urgent, { score: now, value: cardIdStr }, { NX: true });
      console.log(`Cleaned up stale inflight entry for card ${cardIdStr}`);
    }
  }
}

/**
 * Worker loop that processes the metadata queues.
 * Fetches one card at a time, respecting rate limits.
 * Implements retry with exponential backoff for transient failures.
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
    await redis.hDel(RETRY_HASH, cardIdStr); // Clean up any retry state
    return;
  }

  // Check if this card is in retry backoff period
  const retryStateStr = await redis.hGet(RETRY_HASH, cardIdStr);
  if (retryStateStr) {
    const retryState = JSON.parse(retryStateStr);
    if (retryState.retryAfter && Date.now() < retryState.retryAfter) {
      // Still in backoff period, skip for now
      return;
    }
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
    await redis.hDel(RETRY_HASH, cardIdStr);
    return;
  }

  // Fetch and cache
  const result = await fetchAndCacheMetadata(cardId, cardData.ipfsUri);

  // Remove from current queue position
  await removeFromQueue(cardId, queue);

  if (result === FetchResult.Success) {
    // Success - clean up retry state
    await redis.hDel(RETRY_HASH, cardIdStr);
  } else if (result === FetchResult.PermanentError) {
    // Permanent failure (404, etc.) - don't retry
    console.error(`Permanent failure fetching metadata for card ${cardId}, not retrying`);
    await redis.hDel(RETRY_HASH, cardIdStr);
  } else {
    // Transient error - check retry count and potentially re-queue
    const currentRetryStateStr = await redis.hGet(RETRY_HASH, cardIdStr);
    const currentRetryState = currentRetryStateStr
      ? JSON.parse(currentRetryStateStr)
      : { count: 0 };
    const retryCount = currentRetryState.count;

    if (retryCount < MAX_RETRIES) {
      // Increment retry count and re-queue with exponential backoff
      const newRetryCount = retryCount + 1;
      const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount);
      const retryAfter = Date.now() + delayMs;

      // Store retry state with count and delay timestamp
      await redis.hSet(
        RETRY_HASH,
        cardIdStr,
        JSON.stringify({ count: newRetryCount, retryAfter })
      );

      // Re-queue to lowest priority queue (ColdCrawl)
      await redis.zAdd(QUEUE_PREFIX + Queue.ColdCrawl, [
        { score: retryAfter, value: cardIdStr },
      ]);

      console.warn(
        `Transient failure for card ${cardId}, retry ${newRetryCount}/${MAX_RETRIES} ` +
          `scheduled in ${delayMs}ms`
      );
    } else {
      // Max retries exceeded - give up
      console.error(
        `Max retries (${MAX_RETRIES}) exceeded for card ${cardId}, giving up`
      );
      await redis.hDel(RETRY_HASH, cardIdStr);
    }
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

  const scheduleNext = () => {
    workerTimeout = setTimeout(async () => {
      try {
        await workerLoop();
      } catch (error) {
        console.error('Metadata worker error:', error);
      }
      if (workerRunning) scheduleNext();
    }, RATE_LIMIT_MS);
  };
  scheduleNext();

  // Periodically clean up stale inflight entries
  cleanupInterval = setInterval(async () => {
    try {
      await cleanupStaleInflight();
    } catch (error) {
      console.error('Stale inflight cleanup error:', error);
    }
  }, STALE_CLEANUP_INTERVAL_MS);
}

/**
 * Stop the metadata worker.
 * Used for graceful shutdown and testing.
 */
export function stopWorker(): void {
  workerRunning = false;
  if (workerTimeout) {
    clearTimeout(workerTimeout);
    workerTimeout = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
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
  pendingRetries: number;
}> {
  const [urgent, activeGame, newlyRegistered, coldCrawl, cached, inflight, pendingRetries] =
    await Promise.all([
      redis.zCard(QUEUE_PREFIX + Queue.Urgent),
      redis.zCard(QUEUE_PREFIX + Queue.ActiveGame),
      redis.zCard(QUEUE_PREFIX + Queue.NewlyRegistered),
      redis.zCard(QUEUE_PREFIX + Queue.ColdCrawl),
      redis.sCard(CACHED_SET),
      redis.hLen(INFLIGHT_HASH),
      redis.hLen(RETRY_HASH),
    ]);

  return {
    urgent,
    activeGame,
    newlyRegistered,
    coldCrawl,
    cached,
    inflight,
    pendingRetries,
  };
}
