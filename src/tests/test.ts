import test from 'ava';
import { createClient } from "redis";
import { initDeck, registerCards } from "../cards";
import { newTable, numPlayers, getPlayerSeat } from '../cardtable';

const tableId = "table:test";

test.beforeEach('reset redis', async t => {
    const redis = createClient();
    await redis.connect();
    for await (const key of redis.scanIterator({MATCH: `${tableId}*`})) {
        redis.del(key);
    }
});

test('redis connection', async t => {
    const redis = createClient();
    redis.on('connect', () => t.pass());
    redis.on('error', () => t.fail());
    await redis.connect();
    t.log(await redis.info('Server'));
});

test('init deck', async t => {
    const deck = await initDeck(tableId, "test");
    t.truthy(deck);
});

test('num cards', async t => {
    const deck = await initDeck(tableId, "test");
    const cards = await registerCards([1, 2, 3]);
    deck.add(cards);
    t.is(await deck.numCards(), cards.length);
});

test('move cards', async t => {
    const [deckA, deckB] = await Promise.all([
        initDeck(tableId, "deckA"),
        initDeck(tableId, "deckB"),
    ]);
    t.true([deckA, deckB].every(Boolean));
    deckA.add(await registerCards([1, 2, 3]));
    deckB.add(await registerCards([4, 5, 6]));
    deckB.moveAll(deckA);
    t.is(await deckB.drawCard(deckA), null);

    const verifyCard = async (value: number | null) => {
        const card = await deckA.drawCard(deckB);
        if (!t.is(card ? card.value : null, value)) {
            t.log({card});
        }
    };

    return Promise.all([1, 2, 3, 4, 5, 6, null].map(value => verifyCard(value)));
});

test('add cards to start', async t => {
    const deck = await initDeck(tableId, "test-add-start");
    const cards = await registerCards([1, 2, 3]);
    deck.add([cards[0]], true);
    deck.add([cards[1]]);
    deck.add([cards[2]], true);

    const verifyCard = async (value: number) => {
        const card = await deck.drawCard(deck);
        t.is(card?.value, value);
    };

    return Promise.all([3, 1, 2].map(value => verifyCard(value)));
});

test('peek cards', async t => {
    const deck = await initDeck(tableId, "test-peek");
    const cards = await registerCards([1, 2, 3]);
    t.is(await deck.peekId(), null);
    deck.add(cards);
    t.is(await deck.peekId(), cards[0].id);
    deck.move([cards[1]], deck, true);
    t.is(await deck.peekId(), cards[1].id);
    await Promise.all([
        deck.drawCard(deck),
        deck.drawCard(deck)
    ]);
    const card = await deck.peekCard();
    t.like(card, cards[2]);
});

test('flip card', async t => {
    const deck = await initDeck(tableId, "test-flip");
    const cards = await registerCards([1, 2, 3]);
    deck.add(cards);
    t.false(await deck.areFlipped(cards).then(flipped => flipped.some(Boolean)));
    deck.flip([cards[0]]); // just the first
    t.true(await deck.isFlipped(cards[0]));
    deck.flip(cards); // mixed flip
    t.false(await deck.isFlipped(cards[0]));
    t.true(await deck.areFlipped(cards.slice(-2)).then(flipped => flipped.every(Boolean)));
});

test('players', async t => {
    const userIds = ["PlayerA", "PlayerB"];
    const tableId = await newTable(userIds);
    t.is(await numPlayers(tableId), 2);
    const [seatA, seatB] = await Promise.all(
        userIds.map(userId => getPlayerSeat(tableId, userId))
    );
    t.is(seatA, "A");
    t.is(seatB, "B");
    t.not(await getPlayerSeat(tableId, "PlayerC"), "C");
});

// ============================================================
// Server Integration Tests
// These tests verify the Express server and Socket.io endpoints
// ============================================================

import { io as ioClient, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:8080';

// Helper to wait for server to be ready
async function waitForServer(maxAttempts = 30): Promise<boolean> {
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
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
}

test.serial('server /ping endpoint responds', async (t) => {
    const ready = await waitForServer();
    t.true(ready, 'Server should be running');

    const response = await fetch(`${SERVER_URL}/ping`);
    const text = await response.text();
    t.is(text, 'pong', '/ping endpoint should respond with "pong"');
});

test.serial('Socket.io default namespace accepts connections', async (t) => {
    return new Promise<void>((resolve, reject) => {
        const socket: Socket = ioClient(SERVER_URL, {
            transports: ['websocket'],
            timeout: 5000
        });

        const timeout = setTimeout(() => {
            socket.close();
            reject(new Error('Connection timeout'));
        }, 5000);

        socket.on('connect', () => {
            clearTimeout(timeout);
            t.pass('Socket.io default namespace connected successfully');
            socket.close();
            resolve();
        });

        socket.on('connect_error', (err) => {
            clearTimeout(timeout);
            socket.close();
            reject(err);
        });
    });
});

test.serial('Socket.io /browser namespace accepts connections', async (t) => {
    return new Promise<void>((resolve, reject) => {
        const socket: Socket = ioClient(`${SERVER_URL}/browser`, {
            transports: ['websocket'],
            timeout: 5000
        });

        const timeout = setTimeout(() => {
            socket.close();
            reject(new Error('Connection timeout'));
        }, 5000);

        socket.on('connect', () => {
            clearTimeout(timeout);
            t.pass('Socket.io /browser namespace connected successfully');
            socket.close();
            resolve();
        });

        socket.on('connect_error', (err) => {
            clearTimeout(timeout);
            socket.close();
            reject(err);
        });
    });
});

test.serial('Socket.io /browser namespace emits isDevelopment flag', async (t) => {
    return new Promise<void>((resolve, reject) => {
        const socket: Socket = ioClient(`${SERVER_URL}/browser`, {
            transports: ['websocket'],
            timeout: 5000
        });

        const timeout = setTimeout(() => {
            socket.close();
            reject(new Error('isDevelopment event not received'));
        }, 5000);

        socket.on('isDevelopment', (isDev: boolean) => {
            clearTimeout(timeout);
            t.true(isDev, 'isDevelopment flag should be true in development mode');
            socket.close();
            resolve();
        });

        socket.on('connect_error', (err) => {
            clearTimeout(timeout);
            socket.close();
            reject(err);
        });
    });
});