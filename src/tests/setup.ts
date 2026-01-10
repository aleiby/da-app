/**
 * Vitest global setup - suppress noisy serialization warnings
 *
 * The httpAdapter serialization warnings come from vitest's forks pool
 * trying to serialize axios instances between processes. These warnings
 * are benign - they don't affect test functionality, just create noise.
 */

type WriteCallback = (err?: Error | null) => void;

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

  // Suppress empty "Error:" lines that accompany the httpAdapter warning
  if (str.trim() === 'Error:' || str.match(/^Error:\s*$/)) {
    return true;
  }

  // Pass through all other stderr output
  if (typeof encodingOrCallback === 'function') {
    return originalStderrWrite(chunk, encodingOrCallback);
  }
  return originalStderrWrite(chunk, encodingOrCallback, callback);
};
