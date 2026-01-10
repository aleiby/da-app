import test from 'ava';
import { io as ioClient, Socket } from 'socket.io-client';

// Test server startup in development mode
test('server starts in development mode and /ping endpoint responds', async (t) => {
    const response = await fetch('http://localhost:8080/ping');
    const text = await response.text();
    t.is(text, 'pong', 'Development /ping endpoint should respond with "pong"');
});

// Test Socket.io connection to default namespace
test('Socket.io default namespace accepts connections', async (t) => {
    return new Promise<void>((resolve, reject) => {
        const socket: Socket = ioClient('http://localhost:8080', {
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
    return new Promise<void>((resolve, reject) => {
        const socket: Socket = ioClient('http://localhost:8080/browser', {
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
    return new Promise<void>((resolve, reject) => {
        const socket: Socket = ioClient('http://localhost:8080/browser', {
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
