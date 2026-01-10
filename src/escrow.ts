import { TezosToolkit, MichelCodecPacker } from '@taquito/taquito';
import { BeaconWallet } from '@taquito/beacon-wallet';
import { AccountInfo } from '@airgap/beacon-types';
import { escrowContract, rpcUrl, network } from './contracts';

const Tezos = new TezosToolkit(rpcUrl);
const wallet = new BeaconWallet({
  name: 'Digital Arcana',
  network: { type: network, rpcUrl },
});

Tezos.setWalletProvider(wallet);
Tezos.setPackerProvider(new MichelCodecPacker());

// Track active account via event subscription (Beacon 4.x pattern)
// Use string literal to avoid ESM/CJS compatibility issues with BeaconEvent enum
let activeAccount: AccountInfo | undefined;
wallet.client.subscribeToEvent('ACTIVE_ACCOUNT_SET' as any, (account: AccountInfo) => {
  activeAccount = account;
});

export const connectWallet = async () => {
  try {
    await wallet.clearActiveAccount();
    await wallet.requestPermissions();
  } catch (error) {
    console.log(error);
    return error;
  }
};

// Get address to use for purchases.
export const getWalletAddress = async () => {
  if (activeAccount) {
    return activeAccount.address;
  }

  await wallet.requestPermissions();
  return await wallet.getPKH();
};

// TODO: Check sold out status before sending funds.
export const buyPack = async () => {
  try {
    const address = await getWalletAddress();
    console.log(`Buy pack: ${address}`);

    // Send money to escrow contract.
    const contract = await Tezos.wallet.at(escrowContract);
    const op = await contract.methodsObject.add_funds().send({ amount: 1 });
    console.log('Operation hash:', op.opHash);
    await op.confirmation();
    console.log('Confirmed!');
    return true;
  } catch (error) {
    console.log(error);
  }
  return false;
};

export const refundPack = async () => {
  try {
    const address = await getWalletAddress();
    console.log(`Refund pack: ${address}`);

    // Retrieve money from escrow contract.
    const contract = await Tezos.wallet.at(escrowContract);
    const op = await contract.methodsObject.pull_funds().send();
    console.log('Operation hash:', op.opHash);
    await op.confirmation();
    console.log('Confirmed!');
    return true;
  } catch (error) {
    console.log(error);
  }
  return false;
};
