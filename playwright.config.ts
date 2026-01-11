import { defineConfig } from 'playwright/test';

// Build webServer command with optional real signer mode
// If VITE_E2E_WALLET_KEY is set in environment, pass it through for real Ghostnet transactions
const walletKey = process.env.VITE_E2E_WALLET_KEY;
const webServerCommand = walletKey
  ? `E2E_MOCK_WALLET=true VITE_E2E_WALLET_KEY=${walletKey} npm run start-client`
  : 'E2E_MOCK_WALLET=true npm run start-client';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: webServerCommand,
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
