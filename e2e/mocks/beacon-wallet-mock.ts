/**
 * Mock BeaconWallet for E2E testing.
 *
 * This module replaces @taquito/beacon-wallet during E2E tests to:
 * - Auto-approve wallet connections (no Beacon popup)
 * - Provide a deterministic test wallet address
 * - Support both mock mode (fake ops) and real signer mode (actual Ghostnet txns)
 *
 * Enabled via Vite alias when E2E_MOCK_WALLET=true
 *
 * Mode detection:
 * - VITE_E2E_WALLET_KEY set: Real signer mode (actual Ghostnet transactions)
 * - VITE_E2E_WALLET_KEY not set: Mock mode (fake operations, no network)
 */

import { TezosToolkit, OpKind } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';

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

// Default RPC URL for Ghostnet
const GHOSTNET_RPC = 'https://ghostnet.smartpy.io';

// Default test wallet address (used in mock mode when no key is provided)
const DEFAULT_TEST_ADDRESS = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';

/**
 * Check if we're in real signer mode (VITE_E2E_WALLET_KEY is set)
 */
function getPrivateKey(): string | undefined {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_E2E_WALLET_KEY) {
      return (import.meta as any).env.VITE_E2E_WALLET_KEY;
    }
  } catch {
    // import.meta may not be available in all contexts
  }
  return undefined;
}

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
 * Implements the WalletProvider interface required by Taquito:
 * - getPKH() / getPK() - Get wallet address and public key
 * - mapXxxParamsToWalletParams() - Transform operation params
 * - sendOperations() - Send operations to the blockchain
 * - sign() - Sign arbitrary bytes
 *
 * Also implements Beacon-specific methods:
 * - client.subscribeToEvent() for account changes
 * - clearActiveAccount() to disconnect
 * - requestPermissions() to connect (auto-approves)
 *
 * Mode detection:
 * - Real signer mode (VITE_E2E_WALLET_KEY set): Uses InMemorySigner for real transactions
 * - Mock mode (no key): Returns fake operation hashes
 */
export class BeaconWallet {
  client: MockBeaconClient;
  private activeAccount: AccountInfo | undefined;
  private options: BeaconWalletOptions;
  private signer: InMemorySigner | undefined;
  private tezos: TezosToolkit | undefined;
  private signerReady: Promise<void> | undefined;

  constructor(options: BeaconWalletOptions) {
    this.options = options;
    this.client = new MockBeaconClient();

    // Initialize signer if private key is available
    const privateKey = getPrivateKey();
    if (privateKey) {
      console.log('[Mock BeaconWallet] Real signer mode - initializing InMemorySigner');
      this.signerReady = this.initializeSigner(privateKey);
    } else {
      console.log('[Mock BeaconWallet] Mock mode - no private key provided');
    }

    console.log(`[Mock BeaconWallet] Initialized for "${options.name}"`);
  }

  /**
   * Initialize the InMemorySigner for real transactions
   */
  private async initializeSigner(privateKey: string): Promise<void> {
    try {
      this.signer = await InMemorySigner.fromSecretKey(privateKey);
      const rpcUrl = this.options.network?.rpcUrl || GHOSTNET_RPC;
      this.tezos = new TezosToolkit(rpcUrl);
      this.tezos.setProvider({ signer: this.signer });
      const pkh = await this.signer.publicKeyHash();
      console.log(`[Mock BeaconWallet] Signer initialized for address: ${pkh}`);
    } catch (error) {
      console.error('[Mock BeaconWallet] Failed to initialize signer:', error);
      throw error;
    }
  }

  /**
   * Ensure signer is ready before performing operations
   */
  private async ensureSignerReady(): Promise<void> {
    if (this.signerReady) {
      await this.signerReady;
    }
  }

  /**
   * Check if we're in real signer mode
   */
  private isRealSignerMode(): boolean {
    return !!getPrivateKey();
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
   * Request wallet permissions (auto-approves with test address or signer address)
   */
  async requestPermissions(): Promise<void> {
    await this.ensureSignerReady();

    let testAddress: string;
    let publicKey: string;

    if (this.signer) {
      // Real signer mode - get address from signer
      testAddress = await this.signer.publicKeyHash();
      publicKey = await this.signer.publicKey();
    } else {
      // Mock mode - use configured or default address
      testAddress = getTestAddress();
      publicKey = 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav'; // Placeholder
    }

    // Create a mock AccountInfo matching the real structure
    const network: Network = {
      type: this.options.network?.type || 'ghostnet',
      rpcUrl: this.options.network?.rpcUrl,
    };

    this.activeAccount = {
      accountIdentifier: testAddress,
      address: testAddress,
      publicKey,
      network,
      scopes: ['sign', 'operation_request'],
      connectedAt: Date.now(),
    };

    // Fire the event that escrow.ts listens for
    this.client._fireEvent('ACTIVE_ACCOUNT_SET', this.activeAccount);

    const mode = this.isRealSignerMode() ? 'REAL SIGNER' : 'MOCK';
    console.log(`[Mock BeaconWallet] Auto-approved permissions for ${testAddress} (${mode} mode)`);
  }

  /**
   * Get the wallet's public key hash (address)
   */
  async getPKH(): Promise<string> {
    if (!this.activeAccount) {
      await this.requestPermissions();
    }
    return this.activeAccount!.address;
  }

  /**
   * Get the wallet's public key (required by WalletProvider interface)
   */
  async getPK(): Promise<string> {
    if (!this.activeAccount) {
      await this.requestPermissions();
    }
    return this.activeAccount!.publicKey;
  }

  /**
   * Get the active account (optional Beacon SDK method)
   */
  async getActiveAccount(): Promise<AccountInfo | undefined> {
    return this.activeAccount;
  }

  // ========================================
  // WalletProvider interface implementation
  // ========================================

  /**
   * Transform transfer params to wallet params format
   */
  async mapTransferParamsToWalletParams(params: () => Promise<any>): Promise<any> {
    const p = await params();
    return { ...p, kind: OpKind.TRANSACTION };
  }

  /**
   * Transform stake params to wallet params format
   */
  async mapStakeParamsToWalletParams(params: () => Promise<any>): Promise<any> {
    const p = await params();
    return { ...p, kind: OpKind.TRANSACTION };
  }

  /**
   * Transform unstake params to wallet params format
   */
  async mapUnstakeParamsToWalletParams(params: () => Promise<any>): Promise<any> {
    const p = await params();
    return { ...p, kind: OpKind.TRANSACTION };
  }

  /**
   * Transform finalize unstake params to wallet params format
   */
  async mapFinalizeUnstakeParamsToWalletParams(params: () => Promise<any>): Promise<any> {
    const p = await params();
    return { ...p, kind: OpKind.TRANSACTION };
  }

  /**
   * Transform originate params to wallet params format
   */
  async mapOriginateParamsToWalletParams(params: () => Promise<any>): Promise<any> {
    const p = await params();
    return { ...p, kind: OpKind.ORIGINATION };
  }

  /**
   * Transform delegate params to wallet params format
   */
  async mapDelegateParamsToWalletParams(params: () => Promise<any>): Promise<any> {
    const p = await params();
    return { ...p, kind: OpKind.DELEGATION };
  }

  /**
   * Transform increase paid storage params to wallet params format
   */
  async mapIncreasePaidStorageWalletParams(params: () => Promise<any>): Promise<any> {
    const p = await params();
    return { ...p, kind: OpKind.INCREASE_PAID_STORAGE };
  }

  /**
   * Transform transfer ticket params to wallet params format
   */
  async mapTransferTicketParamsToWalletParams(params: () => Promise<any>): Promise<any> {
    const p = await params();
    return { ...p, kind: OpKind.TRANSFER_TICKET };
  }

  /**
   * Transform register global constant params to wallet params format
   */
  async mapRegisterGlobalConstantParamsToWalletParams(params: () => Promise<any>): Promise<any> {
    const p = await params();
    return { ...p, kind: OpKind.REGISTER_GLOBAL_CONSTANT };
  }

  /**
   * Send operations to the blockchain
   *
   * In real signer mode: Uses InMemorySigner to sign and broadcast transactions
   * In mock mode: Returns a fake operation hash immediately
   */
  async sendOperations(params: any[]): Promise<string> {
    await this.ensureSignerReady();

    if (this.tezos && this.signer) {
      // Real signer mode - actually send the operations
      console.log('[Mock BeaconWallet] Sending real operations to Ghostnet...');
      console.log('[Mock BeaconWallet] Operations:', JSON.stringify(params, null, 2));

      try {
        const batch = this.tezos.contract.batch(params);
        const op = await batch.send();
        console.log(`[Mock BeaconWallet] Operation sent: ${op.hash}`);
        return op.hash;
      } catch (error) {
        console.error('[Mock BeaconWallet] Operation failed:', error);
        throw error;
      }
    } else {
      // Mock mode - return a fake operation hash
      const fakeHash = `oo${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
      console.log(`[Mock BeaconWallet] Mock operation (no network): ${fakeHash}`);
      return fakeHash;
    }
  }

  /**
   * Sign arbitrary bytes
   *
   * In real signer mode: Uses InMemorySigner to sign
   * In mock mode: Returns a fake signature
   */
  async sign(bytes: string, watermark?: Uint8Array): Promise<string> {
    await this.ensureSignerReady();

    if (this.signer) {
      // Real signer mode - actually sign the bytes
      const { prefixSig } = await this.signer.sign(bytes, watermark);
      console.log(`[Mock BeaconWallet] Signed bytes (real signature)`);
      return prefixSig;
    } else {
      // Mock mode - return a fake signature
      const fakeSignature = `edsig${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
      console.log(`[Mock BeaconWallet] Mock signature: ${fakeSignature}`);
      return fakeSignature;
    }
  }
}
