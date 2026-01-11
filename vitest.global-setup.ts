/**
 * Vitest global setup - runs in the main vitest process before tests
 *
 * Suppresses httpAdapter serialization warnings that occur when vitest's
 * forks pool tries to serialize axios instances between processes.
 * These warnings are benign and don't affect test functionality.
 */

type WriteCallback = (err?: Error | null) => void;

export default function globalSetup() {
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stderr.write = (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | WriteCallback,
    callback?: WriteCallback
  ): boolean => {
    const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);

    // Suppress axios httpAdapter serialization warnings
    if (str.includes('httpAdapter') && str.includes('could not be cloned')) {
      return true;
    }

    // Pass through all other stderr output
    if (typeof encodingOrCallback === 'function') {
      return originalStderrWrite(chunk, encodingOrCallback);
    }
    return originalStderrWrite(chunk, encodingOrCallback, callback);
  };
}
