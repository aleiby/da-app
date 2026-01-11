// Pinata API credentials for uploading card images to IPFS
// Copy this file to ../private/storageKeys.js and update with your keys

module.exports = {
    default: {
        // Pinata JWT token
        //
        // To get credentials:
        // 1. Visit https://pinata.cloud/
        // 2. Sign up for a free account (1GB storage limit)
        // 3. Go to "API Keys" in your dashboard
        // 4. Click "New Key", select permissions, and generate
        // 5. Copy the JWT token (starts with "eyJ...")
        //
        // This is used to upload card images to IPFS when minting new card sets.
        pinataJwt: "eyJ...",

        // Pinata gateway URL (optional, for retrieving pinned content)
        // Format: "your-gateway-name.mypinata.cloud"
        // You can find this in your Pinata dashboard under "Gateways"
        pinataGateway: "gateway.pinata.cloud"
    }
};
