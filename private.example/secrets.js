// Tezos account private keys for signing transactions
// Copy this file to ../private/secrets.js and update with your keys

module.exports = {
    default: {
        // Tezos private key (edsk...) for signing pack purchase transactions
        // This should be the private key for the admin account that has operator
        // permissions on the FA2 contract
        //
        // To get a testnet account:
        // 1. Visit a Tezos testnet faucet (e.g., https://teztnets.xyz/)
        // 2. Request testnet tez
        // 3. Export the private key
        //
        // IMPORTANT: Never commit this file or share your private key!
        // For production, use environment variables instead.
        account4: "edsk..."
    }
};
