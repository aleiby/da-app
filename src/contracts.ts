/**
 * Tezos Network Configuration
 *
 * NOTE: We define NetworkType locally to avoid importing @airgap/beacon-sdk
 * on the server side. The beacon SDK uses ESM-only dependencies that are
 * incompatible with ts-node's CommonJS mode.
 */

// Mirror of @airgap/beacon-sdk NetworkType enum values
export enum NetworkType {
  MAINNET = 'mainnet',
  GHOSTNET = 'ghostnet',
  // Deprecated networks (for reference only)
  HANGZHOUNET = 'hangzhounet',
  ITHACANET = 'ithacanet',
}

/**
 * Tezos Network Configuration
 *
 * Current testnet: Ghostnet (long-running testnet)
 * Previously: Hangzhounet, Ithacanet (both deprecated)
 *
 * Contract addresses below need to be updated after deployment.
 * Use scripts/deploy-contracts.ts to deploy new contracts.
 *
 * See: https://teztnets.com/ for current testnet information
 */

// Network selection - change to NetworkType.MAINNET for production
export const network = NetworkType.GHOSTNET;

// RPC and API endpoints per network
const networkConfig = {
  [NetworkType.GHOSTNET]: {
    rpcUrl: 'https://ghostnet.smartpy.io',
    indexerUrl: 'https://api.ghostnet.tzkt.io/v1/contracts/',
    fa2Contract: 'KT1P23Bi5LVorMVKBHLC98xcBbgYY9WWPsmS',
    escrowContract: 'KT1Fv752oEapxohrM9fCaRd9ZSf99PqajHM4',
  },
  [NetworkType.MAINNET]: {
    rpcUrl: 'https://mainnet.smartpy.io',
    indexerUrl: 'https://api.tzkt.io/v1/contracts/',
    // Production contract addresses (not yet deployed)
    fa2Contract: '',
    escrowContract: '',
  },
  // Legacy configuration (deprecated networks - for reference only)
  [NetworkType.HANGZHOUNET]: {
    rpcUrl: 'https://hangzhounet.api.tez.ie/',
    indexerUrl: 'https://api.hangzhou2net.tzkt.io/v1/contracts/',
    fa2Contract: 'KT1N1a7TA1rEedQo2pEQXhuVgSQNvgRWKkdJ',
    escrowContract: 'KT1WZY4nrsHbQn6VHX6Ny1X1LYcPb7mss9iK',
  },
  [NetworkType.ITHACANET]: {
    rpcUrl: 'https://ithacanet.smartpy.io/',
    indexerUrl: 'https://api.ithacanet.tzkt.io/v1/contracts/',
    fa2Contract: 'KT1FhGBLyxPTnAiU41GPTPR1FzKGVajgKrme',
    escrowContract: 'KT19r4jkRtopWqEVVSqyvuSYQ7Z73vPQdfGT',
  },
};

// Get configuration for current network
const config = networkConfig[network] || networkConfig[NetworkType.GHOSTNET];

export const rpcUrl = config.rpcUrl;
export const indexerUrl = config.indexerUrl;
export const fa2Contract = config.fa2Contract;
export const escrowContract = config.escrowContract;

// Validate configuration
if (!fa2Contract || !escrowContract) {
  console.warn(
    `WARNING: Contract addresses not configured for ${network}. ` +
      `Deploy contracts using SmartPy IDE or scripts/deploy-contracts.ts`
  );
}
