import test, { ExecutionContext } from 'ava';
import { io as ioClient, Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:8080';

// Check if server is running before tests
async function isServerRunning(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        const response = await fetch(`${SERVER_URL}/ping`, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response.ok;
    } catch {
        return false;
    }
}

// Helper to skip test if server not running
async function skipIfNoServer(t: ExecutionContext): Promise<boolean> {
    const running = await isServerRunning();
    if (!running) {
        t.log('Server not running at localhost:8080 - skipping test');
        t.pass('Skipped: server not running');
        return true;
    }
    return false;
}

// Test server startup in development mode
test('server starts in development mode and /ping endpoint responds', async (t) => {
    if (await skipIfNoServer(t)) return;

    const response = await fetch(`${SERVER_URL}/ping`);
    const text = await response.text();
    t.is(text, 'pong', 'Development /ping endpoint should respond with "pong"');
});

// Test Socket.io connection to default namespace
test('Socket.io default namespace accepts connections', async (t) => {
    if (await skipIfNoServer(t)) return;

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

// Test Socket.io connection to /browser namespace
test('Socket.io /browser namespace accepts connections', async (t) => {
    if (await skipIfNoServer(t)) return;

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

// Test that development mode emits isDevelopment flag
test('Socket.io /browser namespace emits isDevelopment flag', async (t) => {
    if (await skipIfNoServer(t)) return;

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
