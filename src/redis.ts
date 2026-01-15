/**
 * Standalone Redis client for Digital Arcana
 *
 * This module provides Redis connectivity without server side effects.
 * Import this instead of server.ts when you only need Redis access.
 *
 * PORT RANGE RATIONALE:
 * - 3000: Reserved for Vite dev client
 * - 3001-3016: Game server range (16 ports for Redis DB 0-15 isolation)
 * - 8080: Reserved for Gas Town dashboard (gt serve)
 */
import { createClient } from 'redis';
import { isDevelopment } from './utils';

// Port configuration with validation for Redis DB isolation.
// Each port in range 3001-3016 maps to Redis DB 0-15, enabling parallel test runs.
export const BASE_PORT = 3001;
export const MAX_PORT = 3016; // 16 DBs (0-15)

/**
 * Calculate port for this process.
 * Priority: explicit PORT env var > VITEST_POOL_ID calculation > default BASE_PORT.
 * VITEST_POOL_ID is used for parallel test workers when PORT isn't explicitly set.
 */
function getPort(): number {
  // Explicit PORT takes precedence (needed for spawned subprocess tests)
  if (process.env.PORT !== undefined) {
    return parseInt(process.env.PORT, 10);
  }
  // In vitest parallel mode, derive port from pool ID for worker isolation
  const vitestPoolId = process.env.VITEST_POOL_ID;
  if (vitestPoolId !== undefined) {
    // Vitest forks pool uses 1-indexed pool IDs
    const poolId = parseInt(vitestPoolId, 10);
    return BASE_PORT + ((poolId - 1) % 16);
  }
  return BASE_PORT;
}

const port = getPort();

// Validate port range when explicitly set (vitest auto-calculated ports are always valid)
const isExplicitPort = process.env.PORT !== undefined;
if (isExplicitPort && (port < BASE_PORT || port > MAX_PORT)) {
  throw new Error(
    `PORT must be in range ${BASE_PORT}-${MAX_PORT} for Redis DB isolation. Got: ${port}`
  );
}

// Export the calculated port for use by other modules
export const PORT = port;

export const redisDb = port - BASE_PORT;

// Connect to Redis db.
// In production (QOVERY_REDIS_Z8BD2191C_DATABASE_URL set), use the cloud Redis.
// In development, use local Redis with DB based on port for test isolation.
export type RedisClientType = ReturnType<typeof createClient>;
export const redis: RedisClientType = createClient({
  url: process.env.QOVERY_REDIS_Z8BD2191C_DATABASE_URL,
  database: process.env.QOVERY_REDIS_Z8BD2191C_DATABASE_URL ? undefined : redisDb,
  socket: { connectTimeout: isDevelopment ? 600000 : 5000 },
});

let connectionPromise: Promise<void> | null = null;

/**
 * Connect to Redis. Safe to call multiple times - only connects once.
 */
export async function connectRedis(): Promise<void> {
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    redis.on('error', (err) => console.log(`Redis: ${err}`));
    redis.on('connect', () => console.log('Redis: connect'));
    redis.on('ready', () => console.log('Redis: ready'));
    redis.on('end', () => console.log('Redis: end'));
    redis.on('reconnecting', () => console.log('Redis: reconnecting'));
    await redis.connect();
  })();

  return connectionPromise;
}

// Auto-connect on import (preserves existing behavior)
connectRedis();
