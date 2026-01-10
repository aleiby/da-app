# Private Configuration Templates

This directory contains template files for local development configuration.

## Setup Instructions

1. Copy this entire directory to `../private/`:
   ```bash
   cp -r private.example private
   ```

2. Update each file in the `private/` directory with your actual credentials:
   - `mongodb.js` - MongoDB Atlas connection URI
   - `secrets.js` - Tezos account private key
   - `storageKeys.js` - NFT.storage API key

3. Never commit the `private/` directory (it's already in `.gitignore`)

## Files

### mongodb.js
MongoDB Atlas connection configuration. You'll need to:
- Create a MongoDB Atlas account and cluster
- Create a database user
- Get the connection URI from the Atlas dashboard

### secrets.js
Tezos blockchain private keys for signing transactions. You'll need to:
- Get a Tezos testnet account from a faucet
- Export the private key (edsk...)
- Ensure this account has operator permissions on the FA2 contract

### storageKeys.js
NFT.storage API key for uploading images to IPFS. You'll need to:
- Create an account at https://nft.storage/
- Generate an API key from the dashboard

## Security Notes

- Never commit private keys or API keys to version control
- Use environment variables for production deployments
- Rotate keys regularly
- Use different keys for development and production

## Production Configuration

In production environments, use environment variables instead:
- `MONGODB_URI` - MongoDB connection string
- `SIGNER_KEY` - Tezos private key
- Set `NODE_ENV=production` to use environment variables

See `SETUP.md` for complete configuration details.
