#!/usr/bin/env npx ts-node
/**
 * Generate a new Tezos testnet account
 *
 * This script generates a new Tezos account with:
 * - A 24-word mnemonic phrase (for recovery)
 * - A private key (edsk...) for signing transactions
 * - A public key hash (tz1...) as the account address
 *
 * The private key can be used in private/secrets.js for development.
 *
 * IMPORTANT: Keep the mnemonic and private key secure!
 * - Never commit them to version control
 * - Store the mnemonic in a secure location as a backup
 *
 * After generating, you'll need to:
 * 1. Fund the account at https://faucet.ghostnet.teztnets.com/
 * 2. Update private/secrets.js with the private key
 * 3. Deploy contracts using: npx ts-node scripts/deploy-contracts.ts
 *
 * Usage:
 *   npx ts-node scripts/generate-tezos-account.ts
 */

import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { InMemorySigner } from '@taquito/signer';
import { TezosToolkit } from '@taquito/taquito';
import { b58Encode, PrefixV2 } from '@taquito/utils';

// Ghostnet RPC endpoint
const GHOSTNET_RPC = 'https://ghostnet.smartpy.io';

async function generateTezosAccount(): Promise<void> {
  console.log('');
  console.log('============================================================');
  console.log('       TEZOS TESTNET ACCOUNT GENERATOR');
  console.log('============================================================');
  console.log('');

  // Generate a 24-word mnemonic (256 bits of entropy)
  const mnemonic = bip39.generateMnemonic(256);

  console.log('Generated new Tezos account!');
  console.log('');

  // Convert mnemonic to seed
  const seed = await bip39.mnemonicToSeed(mnemonic);

  // Derive the ed25519 key using SLIP-0010 / BIP44 path for Tezos
  // 44'/1729'/0'/0' - Tezos coin type is 1729
  const derivationPath = "m/44'/1729'/0'/0'";
  const { key } = derivePath(derivationPath, seed.toString('hex'));

  // The derived key is 32 bytes - this is the seed for ed25519
  // Convert Buffer to Uint8Array and encode as edsk (Tezos ed25519 32-byte seed key)
  const keyUint8 = new Uint8Array(key);
  const secretKeyEncoded = b58Encode(keyUint8, PrefixV2.Ed25519Seed);

  // Create signer from the secret key
  const signer = await InMemorySigner.fromSecretKey(secretKeyEncoded);

  // Get account details
  const publicKey = await signer.publicKey();
  const publicKeyHash = await signer.publicKeyHash();
  const secretKey = await signer.secretKey();

  // Display mnemonic
  console.log('MNEMONIC (24 words) - SAVE THIS SECURELY:');
  console.log('------------------------------------------------------------');
  console.log(mnemonic);
  console.log('------------------------------------------------------------');
  console.log('');

  // Display account details
  console.log('ACCOUNT DETAILS:');
  console.log('------------------------------------------------------------');
  console.log(`Address (public key hash): ${publicKeyHash}`);
  console.log(`Public Key: ${publicKey}`);
  console.log(`Private Key: ${secretKey}`);
  console.log('------------------------------------------------------------');
  console.log('');

  // Show configuration instructions
  console.log('NEXT STEPS:');
  console.log('============================================================');
  console.log('');
  console.log('1. FUND YOUR ACCOUNT:');
  console.log('   Go to: https://faucet.ghostnet.teztnets.com/');
  console.log(`   Enter your address: ${publicKeyHash}`);
  console.log('   Request 20+ tez for testing');
  console.log('');
  console.log('2. UPDATE CONFIGURATION:');
  console.log('   Edit: private/secrets.js');
  console.log('   Replace the account4 value with:');
  console.log('');
  console.log('   module.exports = {');
  console.log('       default: {');
  console.log(`           account4: "${secretKey}"`);
  console.log('       }');
  console.log('   };');
  console.log('');
  console.log('3. BACKUP YOUR MNEMONIC:');
  console.log('   Store the 24-word mnemonic in a secure location.');
  console.log('   You can recover the account from the mnemonic if needed.');
  console.log('');
  console.log('4. VERIFY CONFIGURATION:');
  console.log('   The contract deployment scripts will need operator');
  console.log('   permissions on the FA2 contract for this account.');
  console.log('');

  // Check current balance (will be 0 for new account)
  console.log('VERIFYING CONNECTION TO GHOSTNET:');
  console.log('------------------------------------------------------------');
  try {
    const Tezos = new TezosToolkit(GHOSTNET_RPC);
    Tezos.setProvider({ signer });

    const balance = await Tezos.tz.getBalance(publicKeyHash);
    console.log(`Current balance: ${balance.toNumber() / 1_000_000} tez`);

    if (balance.toNumber() === 0) {
      console.log('');
      console.log('(Account needs funding - see step 1 above)');
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      // New accounts don't exist on chain until funded
      if (error.message.includes('michelson')) {
        console.log('Account not yet activated (needs initial funding)');
      } else {
        console.log(`Note: ${error.message}`);
      }
    } else {
      console.log('Note: Could not check balance - account may need funding');
    }
  }

  console.log('');
  console.log('============================================================');
  console.log('       ACCOUNT GENERATION COMPLETE');
  console.log('============================================================');
  console.log('');

  // Security warning
  console.log('SECURITY REMINDER:');
  console.log('------------------------------------------------------------');
  console.log('- NEVER commit private keys or mnemonics to git');
  console.log('- NEVER share your private key publicly');
  console.log('- This is a TESTNET account - do not use for real funds');
  console.log('- Store your mnemonic backup securely');
  console.log('');
}

// Run the generator
generateTezosAccount().catch((error) => {
  console.error('Error generating account:', error);
  process.exit(1);
});
