/**
 * Express + Socket.io server for Digital Arcana
 *
 * WARNING: This module has side effects on import!
 * When this file is imported (directly or transitively), it immediately:
 *   1. Connects to Redis
 *   2. Creates and configures the Express app
 *   3. Starts the HTTP server on PORT (must be 3001-3016 for Redis DB isolation)
 *
 * This behavior exists because cards.ts imports `redis` from this file,
 * and many modules import from cards.ts. The tests rely on this behavior
 * to have a running server without explicit setup.
 *
 * PORT RANGE RATIONALE:
 * - 3000: Reserved for Vite dev client
 * - 3001-3016: Game server range (16 ports for Redis DB 0-15 isolation)
 * - 8080: Reserved for Gas Town dashboard (gt serve)
 *
 * DO NOT use 8080-8095 - conflicts with gt dashboard!
 */
import express from 'express';
import http from 'http';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import { Server, Socket } from 'socket.io';
import { isDevelopment } from './utils';
import { mintSet } from './admin';
import { openPack } from './marketplace';
import { Connection, getUserName } from './connection';
import { getPlayer } from './cardtable';
import { getAvatar } from './avatars';

// Port configuration with validation for Redis DB isolation.
// Each port in range 3001-3016 maps to Redis DB 0-15, enabling parallel test runs.
// See module header for port range rationale (avoiding 8080 gt dashboard conflict).
const BASE_PORT = 3001;
const MAX_PORT = 3016; // 16 DBs (0-15)
const port = parseInt(process.env.PORT || String(BASE_PORT), 10);

if (port < BASE_PORT || port > MAX_PORT) {
  throw new Error(
    `PORT must be in range ${BASE_PORT}-${MAX_PORT} for Redis DB isolation. Got: ${port}`
  );
}

const redisDb = port - BASE_PORT;

// Connect to Redis db.
// In production (QOVERY_REDIS_Z8BD2191C_DATABASE_URL set), use the cloud Redis.
// In development, use local Redis with DB based on port for test isolation.
export type RedisClientType = ReturnType<typeof createClient>;
export const redis: RedisClientType = createClient({
  url: process.env.QOVERY_REDIS_Z8BD2191C_DATABASE_URL,
  database: process.env.QOVERY_REDIS_Z8BD2191C_DATABASE_URL ? undefined : redisDb,
  socket: { connectTimeout: isDevelopment ? 600000 : 5000 },
});
(async () => {
  redis.on('error', (err) => console.log(`Redis: ${err}`));
  redis.on('connect', () => console.log('Redis: connect'));
  redis.on('ready', () => console.log('Redis: ready'));
  redis.on('end', () => console.log('Redis: end'));
  redis.on('reconnecting', () => console.log('Redis: reconnecting'));
  await redis.connect();
})();

// Setup express server.
const app = express();
const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000'],
  },
});

// Export server for test cleanup
export { server };

const defaultSet = 'Default (beta)';
const defaultMinting = 'First Edition';
const defaultPriceMutez = 1000000;

// Browser socket.io handlers.
io.of('/browser').on('connection', (socket: Socket) => {
  if (isDevelopment) {
    socket.emit('isDevelopment', true);
    socket.on('mintSet', () => {
      mintSet(socket, defaultSet, defaultMinting);
    });
  }

  socket.on('openPack', async (address: string) => {
    socket.emit(
      'packOpened',
      await openPack(socket, address, defaultPriceMutez, defaultSet, defaultMinting)
    );
  });
});

// Unity socket.io connection.
io.on('connection', (socket: Socket) => {
  const player = new Connection(socket);
  socket.on('disconnect', () => {
    player.disconnect();
  });
});

// Serve client build (production only).
if (process.env.NODE_ENV !== 'development') {
  console.log('hosting production build');

  // Report public ip.
  http.get({ host: 'api.ipify.org', port: 80, path: '/' }, (resp: any) => {
    resp.on('data', (ip: any) => {
      console.log('My public IP address is: ' + ip);
    });
  });

  // Set up rate limiter: maximum of five requests per minute.
  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5,
  });

  // Apply rate limiter to all requests.
  app.use(limiter);

  // Serve React app.
  const buildpath = path.join(__dirname, '../build');
  app.use(express.static(buildpath));
  app.get('/', (req: any, res: any) => {
    res.sendFile(path.join(buildpath, 'index.html'));
  });
} else {
  console.log('running in development mode');
  console.log(`server path: ${__dirname}`);
  app.get('/ping', (req: any, res: any) => res.send('pong'));
}

// Serve player names.
app.get('/name/:userId', async (req: any, res: any) => {
  // Allow cross-origin requests from React dev server
  if (isDevelopment) {
    res.set('Access-Control-Allow-Origin', 'http://localhost:3000');
  }
  const player = await getPlayer(req.params.userId);
  const name = await getUserName(player ?? req.params.userId);
  res.end(name);
});

// Serve player avatars.
app.get('/avatar/:userId', async (req: any, res: any) => {
  // Allow cross-origin requests from React dev server
  if (isDevelopment) {
    res.set('Access-Control-Allow-Origin', 'http://localhost:3000');
  }
  const png = await getAvatar(req.params.userId);
  res.type('png');
  res.end(png);
});

// Use global to track server startup across module re-evaluations in tests
// This prevents EADDRINUSE errors when vitest re-imports the module
declare global {
  var __daServerStarted: boolean | undefined;
}

if (!globalThis.__daServerStarted) {
  globalThis.__daServerStarted = true;
  server.listen(port, () => {
    console.log(`server listening on port: ${port}`);
  });
}

/**
 * Gracefully shutdown the server and Redis connection.
 * Used by tests to clean up after test runs.
 */
export async function shutdown(): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      redis.disconnect().then(() => resolve());
    });
  });
}
