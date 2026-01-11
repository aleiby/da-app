/**
 * Mock BeaconWallet for E2E testing.
 *
 * This module replaces @taquito/beacon-wallet during E2E tests to:
 * - Auto-approve wallet connections (no Beacon popup)
 * - Provide a deterministic test wallet address
 * - Support both mock mode (fake ops) and real signer mode (actual Ghostnet txns)
 *
 * Enabled via Vite alias when E2E_MOCK_WALLET=true
 */

// Define types inline to avoid dependency on @airgap/beacon-types
// These match the subset used by src/escrow.ts

type NetworkType = 'mainnet' | 'ghostnet' | 'custom';

interface Network {
  type: NetworkType;
  name?: string;
  rpcUrl?: string;
}

interface AccountInfo {
  accountIdentifier: string;
  address: string;
  publicKey: string;
  network: Network;
  scopes: string[];
  connectedAt: number;
}

// Default test wallet address (a valid Ghostnet address format)
const DEFAULT_TEST_ADDRESS = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';

// Read test wallet address from environment (Vite exposes VITE_ prefixed vars)
function getTestAddress(): string {
  try {
    // Check for Vite environment variable
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_E2E_WALLET_ADDRESS) {
      return (import.meta as any).env.VITE_E2E_WALLET_ADDRESS;
    }
  } catch {
    // import.meta may not be available in all contexts
  }
  return DEFAULT_TEST_ADDRESS;
}

// Type for event callbacks
type EventCallback = (account: AccountInfo | undefined) => void;

/**
 * Mock BeaconWallet client for event subscriptions
 */
class MockBeaconClient {
  private eventSubscribers: Map<string, EventCallback[]> = new Map();

  subscribeToEvent(event: string, callback: EventCallback): void {
    const subscribers = this.eventSubscribers.get(event) || [];
    subscribers.push(callback);
    this.eventSubscribers.set(event, subscribers);
  }

  // Internal method to fire events
  _fireEvent(event: string, data: AccountInfo | undefined): void {
    const subscribers = this.eventSubscribers.get(event) || [];
    for (const callback of subscribers) {
      callback(data);
    }
  }
}

interface BeaconWalletOptions {
  name: string;
  network?: {
    type: NetworkType;
    rpcUrl?: string;
  };
}

/**
 * Mock implementation of BeaconWallet from @taquito/beacon-wallet
 *
 * Implements the subset of BeaconWallet used by src/escrow.ts:
 * - client.subscribeToEvent() for account changes
 * - clearActiveAccount() to disconnect
 * - requestPermissions() to connect (auto-approves)
 * - getPKH() to get wallet address
 */
export class BeaconWallet {
  client: MockBeaconClient;
  private activeAccount: AccountInfo | undefined;
  private options: BeaconWalletOptions;

  constructor(options: BeaconWalletOptions) {
    this.options = options;
    this.client = new MockBeaconClient();
    console.log(`[Mock BeaconWallet] Initialized for "${options.name}"`);
  }

  /**
   * Clear the active account (disconnect)
   */
  async clearActiveAccount(): Promise<void> {
    this.activeAccount = undefined;
    this.client._fireEvent('ACTIVE_ACCOUNT_SET', undefined);
    console.log('[Mock BeaconWallet] Cleared active account');
  }

  /**
   * Request wallet permissions (auto-approves with test address)
   */
  async requestPermissions(): Promise<void> {
    const testAddress = getTestAddress();

    // Create a mock AccountInfo matching the real structure
    const network: Network = {
      type: this.options.network?.type || 'ghostnet',
      rpcUrl: this.options.network?.rpcUrl,
    };

    this.activeAccount = {
      accountIdentifier: testAddress,
      address: testAddress,
      publicKey: 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav', // Placeholder public key
      network,
      scopes: ['sign', 'operation_request'],
      connectedAt: Date.now(),
    };

    // Fire the event that escrow.ts listens for
    this.client._fireEvent('ACTIVE_ACCOUNT_SET', this.activeAccount);

    console.log(`[Mock BeaconWallet] Auto-approved permissions for ${testAddress}`);
  }

  /**
   * Get the wallet's public key hash (address)
   */
  async getPKH(): Promise<string> {
    if (!this.activeAccount) {
      // If no active account, request permissions first
      await this.requestPermissions();
    }
    return this.activeAccount!.address;
  }

  /**
   * Get the active account (optional Beacon SDK method)
   */
  async getActiveAccount(): Promise<AccountInfo | undefined> {
    return this.activeAccount;
  }
}
