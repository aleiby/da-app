/**
 * Integration tests for Digital Arcana
 *
 * These tests require the Express/Socket.io server to be running.
 * Server is started via the import of server.ts.
 */
import { test, expect } from 'vitest';
import '../server'; // Start server for integration tests
import { io as ioClient, Socket } from 'socket.io-client';
import { PORT } from '../redis';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SERVER_URL = `http://localhost:${PORT}`;

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
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// ============================================================
// Server Integration Tests
// These tests verify the Express server and Socket.io endpoints
// ============================================================

test.sequential('server /ping endpoint responds', async () => {
  const ready = await waitForServer();
  expect(ready).toBe(true);

  const response = await fetch(`${SERVER_URL}/ping`);
  const text = await response.text();
  expect(text).toBe('pong');
});

test.sequential('Socket.io default namespace accepts connections', async () => {
  await new Promise<void>((resolve, reject) => {
    const socket: Socket = ioClient(SERVER_URL, {
      transports: ['websocket'],
      timeout: 5000,
    });

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Connection timeout'));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
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

test.sequential('Socket.io /browser namespace accepts connections', async () => {
  await new Promise<void>((resolve, reject) => {
    const socket: Socket = ioClient(`${SERVER_URL}/browser`, {
      transports: ['websocket'],
      timeout: 5000,
    });

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Connection timeout'));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
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

test.sequential('Socket.io /browser namespace emits isDevelopment flag', async () => {
  await new Promise<void>((resolve, reject) => {
    const socket: Socket = ioClient(`${SERVER_URL}/browser`, {
      transports: ['websocket'],
      timeout: 5000,
    });

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('isDevelopment event not received'));
    }, 5000);

    socket.on('isDevelopment', (isDev: boolean) => {
      clearTimeout(timeout);
      expect(isDev).toBe(true);
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

// ============================================================
// Port Range Validation Tests
// These verify that the server rejects invalid PORT values
// ============================================================

test('server rejects PORT below valid range (3000)', async () => {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

  const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = spawn('npx', ['tsx', join(projectRoot, 'src/server.ts')], {
      env: { ...process.env, PORT: '3000' },
      cwd: projectRoot,
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Also capture stdout in case error goes there
    child.stdout.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stderr });
    });

    // Kill after timeout to avoid hanging
    setTimeout(() => child.kill(), 5000);
  });

  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('PORT must be in range 3001-3016');
});

test('server rejects PORT above valid range (3017)', async () => {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

  const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = spawn('npx', ['tsx', join(projectRoot, 'src/server.ts')], {
      env: { ...process.env, PORT: '3017' },
      cwd: projectRoot,
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.stdout.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stderr });
    });

    setTimeout(() => child.kill(), 5000);
  });

  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('PORT must be in range 3001-3016');
});
