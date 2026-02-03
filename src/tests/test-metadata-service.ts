/**
 * Tests for the background metadata service
 *
 * Tests queue priority ordering, worker behavior, caching, and pub/sub.
 * Requires Redis.
 */
import { test, expect, beforeEach, afterEach, vi, describe } from 'vitest';
import {
  prioritize,
  requireLot,
  getLotIfCached,
  isCached,
  startWorker,
  stopWorker,
  isWorkerRunning,
  getQueueStats,
  Queue,
} from '../metadata-service';
import { createTestRedisClient, cleanupTestData } from './socket-helpers';
import { registerCard } from '../cards';
import type { RedisClientType } from '../redis';

// Test data cleanup patterns
const METADATA_PATTERNS = [
  'metadata:*',
  'card:*', // Card data we create for tests
  'nextCardId', // Card ID counter
];

let redis: RedisClientType;

beforeEach(async () => {
  redis = await createTestRedisClient();
  await cleanupTestData(redis, METADATA_PATTERNS);
  // Ensure worker is stopped before each test
  stopWorker();
});

afterEach(async () => {
  stopWorker();
  await cleanupTestData(redis, METADATA_PATTERNS);
  await redis.disconnect();
  vi.restoreAllMocks();
});

describe('Queue Priority Ordering', () => {
  test('prioritize adds cards to specified queue', async () => {
    await prioritize([1, 2, 3], Queue.NewlyRegistered);

    const stats = await getQueueStats();
    expect(stats.newlyRegistered).toBe(3);
    expect(stats.urgent).toBe(0);
    expect(stats.activeGame).toBe(0);
    expect(stats.coldCrawl).toBe(0);
  });

  test('prioritize adds cards with correct scores', async () => {
    const startScore = 1000;
    await prioritize([10, 20, 30], Queue.ActiveGame, startScore);

    // Check scores in Redis directly
    const scores = await Promise.all([
      redis.zScore('metadata:queue:1', '10'),
      redis.zScore('metadata:queue:1', '20'),
      redis.zScore('metadata:queue:1', '30'),
    ]);

    expect(scores[0]).toBe(startScore);
    expect(scores[1]).toBe(startScore + 1);
    expect(scores[2]).toBe(startScore + 2);
  });

  test('prioritize skips already cached cards', async () => {
    // Pre-cache card 2
    await redis.sAdd('metadata:cached', '2');
    await redis.set('metadata:lot:2', 'test');

    await prioritize([1, 2, 3], Queue.Urgent);

    const stats = await getQueueStats();
    expect(stats.urgent).toBe(2); // Only cards 1 and 3
  });

  test('prioritize does not duplicate cards already in queue', async () => {
    await prioritize([1, 2], Queue.Urgent);
    await prioritize([2, 3], Queue.Urgent); // Card 2 should not be added again

    const stats = await getQueueStats();
    expect(stats.urgent).toBe(3); // Cards 1, 2, 3
  });

  test('prioritize handles empty array', async () => {
    await prioritize([], Queue.Urgent);
    const stats = await getQueueStats();
    expect(stats.urgent).toBe(0);
  });
});

describe('Cache Behavior', () => {
  test('getLotIfCached returns null for uncached card', async () => {
    const result = await getLotIfCached(999);
    expect(result).toBeNull();
  });

  test('getLotIfCached returns lot for cached card', async () => {
    await redis.set('metadata:lot:42', 'rare');
    await redis.sAdd('metadata:cached', '42');

    const result = await getLotIfCached(42);
    expect(result).toBe('rare');
  });

  test('isCached returns false for uncached card', async () => {
    const result = await isCached(999);
    expect(result).toBe(false);
  });

  test('isCached returns true for cached card', async () => {
    await redis.sAdd('metadata:cached', '42');

    const result = await isCached(42);
    expect(result).toBe(true);
  });
});

describe('Worker Lifecycle', () => {
  test('startWorker sets running state', () => {
    expect(isWorkerRunning()).toBe(false);
    startWorker();
    expect(isWorkerRunning()).toBe(true);
    stopWorker();
    expect(isWorkerRunning()).toBe(false);
  });

  test('startWorker is idempotent', () => {
    startWorker();
    startWorker(); // Should not throw or create duplicate workers
    expect(isWorkerRunning()).toBe(true);
    stopWorker();
  });

  test('stopWorker is idempotent', () => {
    stopWorker();
    stopWorker(); // Should not throw
    expect(isWorkerRunning()).toBe(false);
  });
});

describe('Worker Processing', () => {
  // Mock fetch for IPFS responses
  const mockMetadata = (lot: string) => ({
    name: 'Test Card',
    symbol: 'da',
    decimals: 0,
    shouldPreferSymbol: false,
    thumbnailUri: 'ipfs://test/thumb.png',
    artifactUri: 'ipfs://test/artifact.png',
    displayUri: 'ipfs://test/display.png',
    minter: 'tz1Test',
    creators: ['test'],
    isBooleanAmount: false,
    set: 'Test Set',
    minting: 'First Edition',
    lot,
  });

  test('worker processes urgent queue first', async () => {
    // Create cards with ipfsUri
    const card1 = await registerCard(1, 1, 'ipfs://test/card1.json');
    const card2 = await registerCard(2, 2, 'ipfs://test/card2.json');

    // Add to different queues - card2 to urgent should be processed first
    await prioritize([card1.id], Queue.ColdCrawl);
    await prioritize([card2.id], Queue.Urgent);

    // Mock fetch to track order
    const fetchOrder: number[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const cardId = url.toString().includes('card1') ? card1.id : card2.id;
      fetchOrder.push(cardId);
      return new Response(JSON.stringify(mockMetadata('test')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    startWorker();

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 1500));

    stopWorker();

    // Urgent queue (card2) should be processed before cold crawl (card1)
    expect(fetchOrder[0]).toBe(card2.id);
  });

  test('worker caches lot after successful fetch', async () => {
    const card = await registerCard(1, 1, 'ipfs://test/card.json');
    await prioritize([card.id], Queue.Urgent);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockMetadata('legendary')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    startWorker();

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    stopWorker();

    // Check that lot was cached
    const cachedLot = await getLotIfCached(card.id);
    expect(cachedLot).toBe('legendary');

    // Check that card is marked as cached
    expect(await isCached(card.id)).toBe(true);
  });

  test('worker removes card from queue after processing', async () => {
    const card = await registerCard(1, 1, 'ipfs://test/card.json');
    await prioritize([card.id], Queue.Urgent);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockMetadata('test')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const statsBefore = await getQueueStats();
    expect(statsBefore.urgent).toBe(1);

    startWorker();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    stopWorker();

    const statsAfter = await getQueueStats();
    expect(statsAfter.urgent).toBe(0);
  });

  test('worker handles fetch failure gracefully with retry', async () => {
    const card = await registerCard(1, 1, 'ipfs://test/card.json');
    await prioritize([card.id], Queue.Urgent);

    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    startWorker();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    stopWorker();

    // Card should be removed from urgent queue
    const stats = await getQueueStats();
    expect(stats.urgent).toBe(0);

    // Card should be in cold crawl queue (retry queue) with retry state
    expect(stats.coldCrawl).toBe(1);
    expect(stats.pendingRetries).toBe(1);

    // Card should NOT be cached after failure
    expect(await isCached(card.id)).toBe(false);
  });

  test('worker skips cards without ipfsUri', async () => {
    const card = await registerCard(1, 1, ''); // Empty ipfsUri
    await prioritize([card.id], Queue.Urgent);

    const fetchMock = vi.spyOn(global, 'fetch');

    startWorker();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    stopWorker();

    // Should not attempt to fetch
    expect(fetchMock).not.toHaveBeenCalled();

    // Card should be removed from queue
    const stats = await getQueueStats();
    expect(stats.urgent).toBe(0);
  });
});

describe('Rate Limiting', () => {
  test('worker respects rate limit of ~2/sec', async () => {
    // Create multiple cards
    const cards = await Promise.all([
      registerCard(1, 1, 'ipfs://test/1.json'),
      registerCard(2, 2, 'ipfs://test/2.json'),
      registerCard(3, 3, 'ipfs://test/3.json'),
    ]);

    await prioritize(
      cards.map((c) => c.id),
      Queue.Urgent
    );

    const fetchTimes: number[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      fetchTimes.push(Date.now());
      return new Response(JSON.stringify({ lot: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    startWorker();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    stopWorker();

    // Check that fetches are spaced apart
    if (fetchTimes.length >= 2) {
      for (let i = 1; i < fetchTimes.length; i++) {
        const gap = fetchTimes[i] - fetchTimes[i - 1];
        // Rate limit is 500ms, allow some tolerance
        expect(gap).toBeGreaterThanOrEqual(400);
      }
    }
  });
});

describe('Pub/Sub Notifications', () => {
  test('worker publishes notification when metadata is cached', async () => {
    const card = await registerCard(1, 1, 'ipfs://test/card.json');
    await prioritize([card.id], Queue.Urgent);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ lot: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    // Subscribe to notifications
    const subscriber = redis.duplicate();
    await subscriber.connect();

    const notifications: string[] = [];
    await subscriber.subscribe('metadata:ready', (message) => {
      notifications.push(message);
    });

    startWorker();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    stopWorker();

    await subscriber.disconnect();

    expect(notifications).toContain(String(card.id));
  });
});

describe('requireLot Blocking', () => {
  test('requireLot returns immediately for cached card', async () => {
    await redis.set('metadata:lot:42', 'cached-lot');
    await redis.sAdd('metadata:cached', '42');

    const start = Date.now();
    const lot = await requireLot(42);
    const duration = Date.now() - start;

    expect(lot).toBe('cached-lot');
    expect(duration).toBeLessThan(100); // Should be nearly instant
  });

  test('requireLot blocks and returns when metadata is fetched', async () => {
    const card = await registerCard(1, 1, 'ipfs://test/card.json');

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ lot: 'fetched-lot' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    startWorker();

    const lot = await requireLot(card.id);

    stopWorker();

    expect(lot).toBe('fetched-lot');
  });

  test('requireLot adds card to urgent queue', async () => {
    const card = await registerCard(1, 1, 'ipfs://test/card.json');

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ lot: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    // Don't start worker yet - just check queue
    const requirePromise = requireLot(card.id);

    // Give it a moment to queue
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = await getQueueStats();
    expect(stats.urgent).toBe(1);

    // Now start worker to complete the request
    startWorker();
    await requirePromise;
    stopWorker();
  });
});

describe('getQueueStats', () => {
  test('returns all queue statistics', async () => {
    await prioritize([1], Queue.Urgent);
    await prioritize([2, 3], Queue.ActiveGame);
    await prioritize([4, 5, 6], Queue.NewlyRegistered);
    await prioritize([7, 8, 9, 10], Queue.ColdCrawl);

    await redis.sAdd('metadata:cached', ['100', '101']);
    await redis.hSet('metadata:inflight', '200', String(Date.now()));
    await redis.hSet('metadata:retries', '300', JSON.stringify({ count: 1, retryAfter: Date.now() }));

    const stats = await getQueueStats();

    expect(stats.urgent).toBe(1);
    expect(stats.activeGame).toBe(2);
    expect(stats.newlyRegistered).toBe(3);
    expect(stats.coldCrawl).toBe(4);
    expect(stats.cached).toBe(2);
    expect(stats.inflight).toBe(1);
    expect(stats.pendingRetries).toBe(1);
  });
});

describe('Retry Mechanism', () => {
  test('permanent errors (404) do not retry', async () => {
    const card = await registerCard(1, 1, 'ipfs://test/card.json');
    await prioritize([card.id], Queue.Urgent);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Not Found', { status: 404 })
    );

    startWorker();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    stopWorker();

    // Card should be removed from all queues - no retry for 404
    const stats = await getQueueStats();
    expect(stats.urgent).toBe(0);
    expect(stats.coldCrawl).toBe(0);
    expect(stats.pendingRetries).toBe(0);
  });

  test('transient errors (5xx) trigger retry', async () => {
    const card = await registerCard(1, 1, 'ipfs://test/card.json');
    await prioritize([card.id], Queue.Urgent);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Server Error', { status: 500 })
    );

    startWorker();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    stopWorker();

    // Card should be moved to cold crawl queue for retry
    const stats = await getQueueStats();
    expect(stats.urgent).toBe(0);
    expect(stats.coldCrawl).toBe(1);
    expect(stats.pendingRetries).toBe(1);
  });

  test('retry respects backoff period', async () => {
    const card = await registerCard(1, 1, 'ipfs://test/card.json');
    await prioritize([card.id], Queue.Urgent);

    // First call fails, second call should succeed (after backoff)
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ lot: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    startWorker();

    // First failure - should queue for retry with 5s backoff
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let stats = await getQueueStats();
    expect(stats.pendingRetries).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // During backoff period, card should not be processed
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(fetchMock).toHaveBeenCalledTimes(1); // Still 1 - respecting backoff

    // Wait for backoff to expire (5s total) and retry to succeed
    await new Promise((resolve) => setTimeout(resolve, 3000));

    stopWorker();

    // After successful retry, should be cached
    stats = await getQueueStats();
    expect(stats.pendingRetries).toBe(0);
    expect(await isCached(card.id)).toBe(true);
  }, 10000); // Increase timeout for this test

  test('max retries exceeded gives up', async () => {
    const card = await registerCard(1, 1, 'ipfs://test/card.json');

    // Set up card as having already failed MAX_RETRIES (3) times
    await redis.hSet(
      'metadata:retries',
      String(card.id),
      JSON.stringify({ count: 3, retryAfter: 0 })
    );
    await prioritize([card.id], Queue.ColdCrawl);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Server Error', { status: 500 })
    );

    startWorker();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    stopWorker();

    // After max retries, card should be removed completely
    const stats = await getQueueStats();
    expect(stats.coldCrawl).toBe(0);
    expect(stats.pendingRetries).toBe(0);
    expect(await isCached(card.id)).toBe(false);
  });
});
