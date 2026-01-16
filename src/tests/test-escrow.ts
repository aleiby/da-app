/**
 * Unit tests for escrow-utils.ts
 *
 * Tests getPendingAmount() with axios mocking.
 */
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { getPendingAmount } from '../escrow-utils';

vi.mock('axios');

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('getPendingAmount returns value when entry.active is true', async () => {
  vi.mocked(axios.get).mockResolvedValue({
    data: [{ active: true, value: 5000000 }],
  });

  const result = await getPendingAmount('tz1TestWallet');
  expect(result).toBe(5000000);
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test('getPendingAmount returns 0 when entry.active is false', async () => {
  vi.mocked(axios.get).mockResolvedValue({
    data: [{ active: false, value: 5000000 }],
  });

  const result = await getPendingAmount('tz1TestWallet');
  expect(result).toBe(0);
});

test('getPendingAmount returns 0 on network error', async () => {
  vi.mocked(axios.get).mockRejectedValue(new Error('Network Error'));

  const result = await getPendingAmount('tz1TestWallet');
  expect(result).toBe(0);
});

test('getPendingAmount returns 0 on malformed response (empty array)', async () => {
  vi.mocked(axios.get).mockResolvedValue({
    data: [],
  });

  const result = await getPendingAmount('tz1TestWallet');
  expect(result).toBe(0);
});

test('getPendingAmount returns 0 on malformed response (missing data)', async () => {
  vi.mocked(axios.get).mockResolvedValue({});

  const result = await getPendingAmount('tz1TestWallet');
  expect(result).toBe(0);
});

test('getPendingAmount calls correct URL with wallet address', async () => {
  vi.mocked(axios.get).mockResolvedValue({
    data: [{ active: true, value: 1000 }],
  });

  await getPendingAmount('tz1ExampleAddress');

  expect(axios.get).toHaveBeenCalledWith(
    expect.stringContaining('tz1ExampleAddress'),
    expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
  );
});
