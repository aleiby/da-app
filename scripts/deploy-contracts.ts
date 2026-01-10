#!/usr/bin/env npx ts-node
/**
 * Smart Contract Deployment Guide for Digital Arcana
 *
 * This script provides instructions and utilities for deploying
 * the FA2 and Escrow/Marketplace contracts to Tezos testnets.
 *
 * DEPLOYMENT METHODS:
 *
 * 1. SmartPy Online IDE (Recommended for quick deployment)
 *    - Visit https://smartpy.io/ide
 *    - Upload contracts from python/contracts/
 *    - Click "Run Code" to compile
 *    - Click "Deploy Contract" and select Ghostnet
 *    - Connect wallet and confirm deployment
 *
 * 2. SmartPy CLI (For automated deployment)
 *    - Install: pip install smartpy-tezos
 *    - Compile: smartpy compile python/contracts/fa2.py output/fa2
 *    - Deploy using octez-client or Taquito
 *
 * 3. This script (Post-compilation deployment with Taquito)
 *    - Requires pre-compiled Michelson code
 *    - Uses Taquito for deployment
 *
 * DEPLOYMENT ORDER:
 * 1. Deploy FA2 contract first (for NFT management)
 * 2. Deploy Escrow/Marketplace contract with FA2 address
 * 3. Set operator permissions on FA2 for the admin account
 *
 * After deployment, update src/contracts.ts with the new addresses.
 */

import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";

// Configuration
const GHOSTNET_RPC = "https://ghostnet.smartpy.io";

// Read private key from configuration
async function getPrivateKey(): Promise<string> {
  try {
    // Try to read from private/secrets.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const secrets = require("../private/secrets");
    const key = secrets.default?.account4;
    if (key && key !== "edsk...") {
      return key;
    }
  } catch {
    // File not found or invalid
  }

  // Check environment variable
  const envKey = process.env.SIGNER_KEY;
  if (envKey && envKey !== "edsk...") {
    return envKey;
  }

  throw new Error(
    "Private key not configured. Set up private/secrets.js or SIGNER_KEY environment variable."
  );
}

async function checkDeploymentReadiness(): Promise<void> {
  console.log("");
  console.log("============================================================");
  console.log("       SMART CONTRACT DEPLOYMENT CHECKER");
  console.log("============================================================");
  console.log("");

  // Check private key
  console.log("1. Checking private key configuration...");
  let privateKey: string;
  try {
    privateKey = await getPrivateKey();
    console.log("   Private key found.");
  } catch (error) {
    console.log("   ERROR: " + (error as Error).message);
    console.log("");
    console.log("   To configure:");
    console.log("   - Run: npx ts-node scripts/generate-tezos-account.ts");
    console.log("   - Fund account at: https://faucet.ghostnet.teztnets.com/");
    console.log("   - Update private/secrets.js with the private key");
    console.log("");
    return;
  }

  // Check account balance
  console.log("");
  console.log("2. Checking account on Ghostnet...");
  try {
    const Tezos = new TezosToolkit(GHOSTNET_RPC);
    const signer = await InMemorySigner.fromSecretKey(privateKey);
    Tezos.setProvider({ signer });

    const address = await signer.publicKeyHash();
    console.log(`   Address: ${address}`);

    const balance = await Tezos.tz.getBalance(address);
    const balanceTez = balance.toNumber() / 1_000_000;
    console.log(`   Balance: ${balanceTez.toFixed(6)} tez`);

    if (balanceTez < 5) {
      console.log("");
      console.log("   WARNING: Low balance. Contract deployment requires ~2-5 tez.");
      console.log("   Fund account at: https://faucet.ghostnet.teztnets.com/");
    } else {
      console.log("   Balance sufficient for deployment.");
    }
  } catch (error) {
    console.log(`   ERROR: ${(error as Error).message}`);
    console.log("   Account may need initial funding to be activated.");
    console.log("   Fund at: https://faucet.ghostnet.teztnets.com/");
  }

  // Deployment instructions
  console.log("");
  console.log("============================================================");
  console.log("       DEPLOYMENT INSTRUCTIONS");
  console.log("============================================================");
  console.log("");
  console.log("OPTION 1: SmartPy Online IDE (Recommended)");
  console.log("------------------------------------------------------------");
  console.log("");
  console.log("Step 1: Deploy FA2 Contract");
  console.log("  a. Open https://smartpy.io/ide");
  console.log("  b. Copy contents of python/contracts/fa2.py");
  console.log("  c. Click 'Run Code' to compile");
  console.log("  d. Under 'FA2_comp' compilation target, click 'Deploy Contract'");
  console.log("  e. Select Ghostnet network");
  console.log("  f. Connect your wallet (Temple, Kukai, etc.)");
  console.log("  g. Confirm deployment and save the contract address (KT1...)");
  console.log("");
  console.log("Step 2: Deploy Escrow/Marketplace Contract");
  console.log("  a. Open python/contracts/escrow.py");
  console.log("  b. Update the 'Deploy' test section at the bottom:");
  console.log("     - Set fa2Contract to your newly deployed FA2 address");
  console.log("     - Set adminAddress to your admin wallet address");
  console.log("  c. Copy to SmartPy IDE and run");
  console.log("  d. Deploy to Ghostnet and save the address");
  console.log("");
  console.log("Step 3: Set Operator Permissions");
  console.log("  a. Go to https://ghostnet.tzkt.io/");
  console.log("  b. Find your FA2 contract");
  console.log("  c. Go to 'Interact' tab");
  console.log("  d. Call 'update_operators' to add the Escrow contract as operator");
  console.log("");
  console.log("Step 4: Update Configuration");
  console.log("  a. Edit src/contracts.ts");
  console.log("  b. Update fa2Contract and escrowContract addresses for Ghostnet");
  console.log("");
  console.log("OPTION 2: SmartPy CLI");
  console.log("------------------------------------------------------------");
  console.log("");
  console.log("  # Install SmartPy");
  console.log("  pip install smartpy-tezos");
  console.log("");
  console.log("  # Compile FA2 contract");
  console.log("  smartpy compile python/contracts/fa2.py output/fa2 --html");
  console.log("");
  console.log("  # Compile Escrow contract");
  console.log("  smartpy compile python/contracts/escrow.py output/escrow --html");
  console.log("");
  console.log("  # Deploy using octez-client or the compiled Michelson");
  console.log("");
  console.log("============================================================");
  console.log("");
  console.log("Current Network Configuration:");
  console.log("  Network: Ghostnet");
  console.log("  RPC: " + GHOSTNET_RPC);
  console.log("  Block Explorer: https://ghostnet.tzkt.io/");
  console.log("  Faucet: https://faucet.ghostnet.teztnets.com/");
  console.log("");
  console.log("============================================================");
}

// Run the deployment checker
checkDeploymentReadiness().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
