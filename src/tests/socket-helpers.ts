/**
 * Socket.io integration test utilities for Digital Arcana
 *
 * Provides utilities for creating mock clients, managing connections,
 * and testing game events through Socket.io.
 */
import { io as ioClient, Socket } from 'socket.io-client';
import { createClient } from 'redis';
import type { RedisClientType } from '../redis';
import { PORT, BASE_PORT } from '../redis';

// Use PORT from redis.ts which handles VITEST_POOL_ID for parallel workers
export const SERVER_URL = `http://localhost:${PORT}`;
export const DEFAULT_TIMEOUT = 5000;

/**
 * A test client that wraps Socket.io connections with helper methods
 * for game testing scenarios.
 */
export class TestClient {
  private socket: Socket | null = null;
  private _walletAddress: string;
  private _receivedEvents: Map<string, unknown[]> = new Map();
  private _eventPromises: Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }[]
  > = new Map();

  constructor(walletAddress: string) {
    this._walletAddress = walletAddress;
  }

  get walletAddress(): string {
    return this._walletAddress;
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Connect to the default Socket.io namespace (Unity client)
   */
  async connect(timeout: number = DEFAULT_TIMEOUT): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = ioClient(SERVER_URL, {
        transports: ['websocket'],
        timeout,
      });

      const timeoutId = setTimeout(() => {
        this.socket?.close();
        reject(new Error('Connection timeout'));
      }, timeout);

      this.socket.on('connect', () => {
        clearTimeout(timeoutId);
        this.setupEventListeners();
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        clearTimeout(timeoutId);
        this.socket?.close();
        reject(err);
      });
    });
  }

  /**
   * Connect to the /browser namespace
   */
  async connectBrowser(timeout: number = DEFAULT_TIMEOUT): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = ioClient(`${SERVER_URL}/browser`, {
        transports: ['websocket'],
        timeout,
      });

      const timeoutId = setTimeout(() => {
        this.socket?.close();
        reject(new Error('Connection timeout'));
      }, timeout);

      this.socket.on('connect', () => {
        clearTimeout(timeoutId);
        this.setupEventListeners();
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        clearTimeout(timeoutId);
        this.socket?.close();
        reject(err);
      });
    });
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    // Common events to track
    const eventsToTrack = [
      'msg',
      'setTable',
      'initDeck',
      'resumeGame',
      'revealCards',
      'userName',
      'isDevelopment',
      'packOpened',
      'nameChanged',
      'gameOver',
      'moveCards',
    ];

    eventsToTrack.forEach((eventName) => {
      this.socket!.on(eventName, (...args: unknown[]) => {
        // Store the event
        if (!this._receivedEvents.has(eventName)) {
          this._receivedEvents.set(eventName, []);
        }
        this._receivedEvents.get(eventName)!.push(args);

        // Resolve any waiting promises
        const promises = this._eventPromises.get(eventName);
        if (promises && promises.length > 0) {
          const { resolve } = promises.shift()!;
          resolve(args);
        }
      });
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  /**
   * Emit an event to the server
   */
  emit(event: string, ...args: unknown[]): void {
    if (!this.socket) {
      throw new Error('Not connected');
    }
    this.socket.emit(event, ...args);
  }

  /**
   * Set the wallet address for this client
   */
  setWallet(): void {
    this.emit('setWallet', this._walletAddress);
  }

  /**
   * Set the player's name
   */
  setUserName(name: string): void {
    this.emit('userName', name);
  }

  /**
   * Send a chat message
   */
  chat(message: string): void {
    this.emit('chat', message);
  }

  /**
   * Request to play a game
   */
  playGame(game: string): void {
    this.emit('playGame', game);
  }

  /**
   * Quit the current game
   */
  quitGame(game: string): void {
    this.emit('quitGame', game);
  }

  /**
   * Click on a deck (left click)
   */
  clickDeck(deck: string, selected: number[] = [], right: boolean = false): void {
    this.emit('clickDeck', deck, selected, right);
  }

  /**
   * Right-click on a deck
   */
  rightClickDeck(deck: string, selected: number[] = []): void {
    this.clickDeck(deck, selected, true);
  }

  /**
   * Click on the table
   */
  clickTable(x: number, z: number, selected: number[] = [], right: boolean = false): void {
    this.emit('clickTable', x, z, selected, right);
  }

  /**
   * Right-click on the table
   */
  rightClickTable(x: number, z: number, selected: number[] = []): void {
    this.clickTable(x, z, selected, true);
  }

  /**
   * Wait for a specific event to be received
   */
  async waitForEvent(eventName: string, timeout: number = DEFAULT_TIMEOUT): Promise<unknown[]> {
    // Check if we already have the event
    const events = this._receivedEvents.get(eventName);
    if (events && events.length > 0) {
      return events.shift() as unknown[];
    }

    // Wait for the event
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const promises = this._eventPromises.get(eventName);
        if (promises) {
          const index = promises.findIndex((p) => p.reject === reject);
          if (index > -1) {
            promises.splice(index, 1);
          }
        }
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, timeout);

      if (!this._eventPromises.has(eventName)) {
        this._eventPromises.set(eventName, []);
      }

      this._eventPromises.get(eventName)!.push({
        resolve: (value: unknown) => {
          clearTimeout(timeoutId);
          resolve(value as unknown[]);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });
    });
  }

  /**
   * Wait for a 'msg' event containing a specific text
   */
  async waitForMessage(containsText: string, timeout: number = DEFAULT_TIMEOUT): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const args = await this.waitForEvent(
          'msg',
          Math.min(500, timeout - (Date.now() - startTime))
        );
        const message = args[0] as string;
        if (message.includes(containsText)) {
          return message;
        }
        // Re-queue the message if it doesn't match
        if (!this._receivedEvents.has('msg')) {
          this._receivedEvents.set('msg', []);
        }
        this._receivedEvents.get('msg')!.push(args);
      } catch {
        // Timeout on individual wait, continue checking
      }
    }

    throw new Error(`Timeout waiting for message containing: ${containsText}`);
  }

  /**
   * Get all received events of a specific type
   */
  getReceivedEvents(eventName: string): unknown[][] {
    return [...(this._receivedEvents.get(eventName) ?? [])] as unknown[][];
  }

  /**
   * Clear all received events
   */
  clearReceivedEvents(): void {
    this._receivedEvents.clear();
  }

  /**
   * Wait for the 'setTable' event and return the table info
   */
  async waitForSetTable(timeout: number = DEFAULT_TIMEOUT): Promise<{
    tableId: string;
    seat: string;
    playerCount: number;
  }> {
    const args = await this.waitForEvent('setTable', timeout);
    return {
      tableId: args[0] as string,
      seat: args[1] as string,
      playerCount: args[2] as number,
    };
  }

  /**
   * Wait for the 'resumeGame' event
   */
  async waitForResumeGame(timeout: number = DEFAULT_TIMEOUT): Promise<string> {
    const args = await this.waitForEvent('resumeGame', timeout);
    return args[0] as string;
  }

  /**
   * Wait for 'revealCards' event
   */
  async waitForRevealCards(timeout: number = DEFAULT_TIMEOUT): Promise<unknown[]> {
    const args = await this.waitForEvent('revealCards', timeout);
    return args[0] as unknown[];
  }

  /**
   * Wait for at least N initDeck events
   */
  async waitForInitDecks(
    minCount: number = 1,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<unknown[][]> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const events = this._receivedEvents.get('initDeck') ?? [];
      if (events.length >= minCount) {
        return events as unknown[][];
      }
      // Wait for more events
      try {
        await this.waitForEvent('initDeck', Math.min(500, timeout - (Date.now() - startTime)));
      } catch {
        // Timeout waiting for individual event, check count again
      }
    }

    // Return what we have even if less than minCount
    return (this._receivedEvents.get('initDeck') ?? []) as unknown[][];
  }

  /**
   * Check if any events of a type have been received
   */
  hasReceivedEvent(eventName: string): boolean {
    const events = this._receivedEvents.get(eventName);
    return events !== undefined && events.length > 0;
  }
}

/**
 * Get Redis database number based on PORT for test isolation.
 * Uses the PORT from redis.ts which handles VITEST_POOL_ID for parallel workers.
 */
function getRedisDb(): number {
  return PORT - BASE_PORT;
}

/**
 * Helper to create a Redis client for tests.
 * Uses the same database as the server based on PORT.
 */
export async function createTestRedisClient(): Promise<RedisClientType> {
  const redis = createClient({ database: getRedisDb() });
  await redis.connect();
  return redis as RedisClientType;
}

/**
 * Clean up test data from Redis
 */
export async function cleanupTestData(redis: RedisClientType, patterns: string[]): Promise<void> {
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  }
}

/**
 * Generate a unique test wallet address
 */
export function generateTestWallet(): string {
  const id = Math.random().toString(36).substring(2, 15);
  return `tz1Test${id}`;
}

/**
 * Wait for the server to be ready
 */
export async function waitForServer(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      const response = await fetch(`${SERVER_URL}/ping`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Helper to wait for a Redis stream event
 */
export async function waitForRedisStreamEvent(
  redis: RedisClientType,
  streamKey: string,
  eventType: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<unknown> {
  const startTime = Date.now();
  let lastId = '0-0';

  while (Date.now() - startTime < timeout) {
    const response = await redis.xRead([{ id: lastId, key: streamKey }], {
      BLOCK: Math.min(500, timeout - (Date.now() - startTime)),
      COUNT: 10,
    });

    if (response && Array.isArray(response)) {
      for (const streamResult of response) {
        if (streamResult && typeof streamResult === 'object' && 'messages' in streamResult) {
          const { messages } = streamResult as {
            name: string;
            messages: Array<{ id: string; message: Record<string, string> }>;
          };
          for (const msg of messages) {
            lastId = msg.id;
            try {
              const data = JSON.parse(msg.message.msg);
              if (data.event === eventType) {
                return data;
              }
            } catch {
              // Not JSON or wrong format
            }
          }
        }
      }
    }
  }

  throw new Error(`Timeout waiting for Redis stream event: ${eventType} on ${streamKey}`);
}

/**
 * Helper to publish a game action via Redis pub/sub
 */
export async function publishGameAction(
  redis: RedisClientType,
  tableId: string,
  action: string,
  args: Record<string, unknown>
): Promise<void> {
  await redis.publish(`${tableId}:${action}`, JSON.stringify(args));
}

/**
 * Create multiple test clients
 */
export function createTestClients(count: number): TestClient[] {
  return Array.from({ length: count }, () => new TestClient(generateTestWallet()));
}

/**
 * Connect all test clients
 */
export async function connectAll(clients: TestClient[]): Promise<void> {
  await Promise.all(clients.map((c) => c.connect()));
}

/**
 * Disconnect all test clients
 */
export function disconnectAll(clients: TestClient[]): void {
  clients.forEach((c) => c.disconnect());
}

/**
 * Set wallet for all test clients
 */
export function setWalletAll(clients: TestClient[]): void {
  clients.forEach((c) => c.setWallet());
}
