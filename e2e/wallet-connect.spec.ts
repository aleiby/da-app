/**
 * E2E tests for mock wallet integration.
 *
 * Verifies that:
 * - App loads without Beacon popup (mock auto-approves)
 * - Mock wallet address flows correctly through the app
 * - No JavaScript errors related to Beacon SDK
 */

import { test, expect } from '@playwright/test';

test.describe('Mock Wallet Integration', () => {
  test('app loads without wallet popup', async ({ page }) => {
    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];

    // Capture console output
    page.on('console', (msg) => {
      const text = msg.text();
      consoleLogs.push(text);
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      }
    });

    // Navigate to app
    await page.goto('/');

    // Wait for page to load (React app should render)
    await expect(page.locator('.App')).toBeVisible({ timeout: 10000 });

    // Verify mock wallet was initialized (look for our mock's log message)
    await page.waitForFunction(
      () => {
        // Give the wallet some time to initialize
        return true;
      },
      { timeout: 5000 }
    );

    // Check console logs for mock wallet initialization
    const mockWalletInitialized = consoleLogs.some((log) => log.includes('[Mock BeaconWallet]'));
    expect(mockWalletInitialized).toBe(true);

    // Verify no Beacon-related errors (would indicate popup issues)
    const beaconErrors = consoleErrors.filter(
      (err) =>
        err.toLowerCase().includes('beacon') ||
        err.toLowerCase().includes('wallet') ||
        err.toLowerCase().includes('permission')
    );
    expect(beaconErrors).toHaveLength(0);
  });

  test('mock wallet address is set correctly', async ({ page }) => {
    const consoleLogs: string[] = [];

    // Capture console output
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    // Navigate to app
    await page.goto('/');

    // Wait for app to load
    await expect(page.locator('.App')).toBeVisible({ timeout: 10000 });

    // The wallet address gets requested when Unity calls GetWalletAddress
    // In headless mode without Unity, we can trigger it via the Switch Account button
    const switchAccountButton = page.getByRole('button', { name: 'Switch Account' });
    await expect(switchAccountButton).toBeVisible({ timeout: 10000 });

    // Click to trigger wallet connection
    await switchAccountButton.click();

    // Wait for wallet connection to complete
    await page.waitForTimeout(2000);

    // Verify mock wallet auto-approved permissions with test address
    const permissionsApproved = consoleLogs.some(
      (log) =>
        log.includes('[Mock BeaconWallet]') &&
        log.includes('Auto-approved permissions') &&
        log.includes('tz1')
    );
    expect(permissionsApproved).toBe(true);

    // Verify the correct address was used (either default or from env)
    const addressLog = consoleLogs.find(
      (log) => log.includes('[Mock BeaconWallet]') && log.includes('Auto-approved permissions')
    );
    expect(addressLog).toBeDefined();
    expect(addressLog).toContain('tz1');
  });

  test('no JavaScript errors on page load', async ({ page }) => {
    const jsErrors: string[] = [];

    // Capture page errors (uncaught exceptions)
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    // Navigate to app
    await page.goto('/');

    // Wait for app to load
    await expect(page.locator('.App')).toBeVisible({ timeout: 10000 });

    // Give time for any async errors
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors (Unity WebGL warnings, audio issues, etc.)
    const criticalErrors = jsErrors.filter(
      (err) =>
        !err.includes('Unity') &&
        !err.includes('WebGL') &&
        !err.includes('ResizeObserver') &&
        !err.includes('Unable to decode audio data')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
