# Digital Arcana - Quick Start Guide

Get up and running with Digital Arcana in under 10 minutes.

## Prerequisites

- Node.js v18.x and npm v10+ (use `nvm install` or `fnm install` to match `.nvmrc`)
- Redis server
- MongoDB Atlas account

## Quick Setup

### 1. Install Dependencies

```bash
npm ci
```

### 2. Start Redis

```bash
# Ubuntu/Debian/WSL2
sudo service redis-server start

# macOS
brew services start redis
```

### 3. Configure Environment

```bash
# Copy configuration templates
cp -r private.example private

# Edit configuration files with your credentials
# - private/mongodb.js - Add MongoDB Atlas URI
# - private/secrets.js - Add Tezos private key (for minting)
# - private/storageKeys.js - Add NFT.storage API key (for IPFS uploads)
```

### 4. Start Development Servers

Open two terminal windows:

**Terminal 1 - Backend:**
```bash
npm run server-dev
```

**Terminal 2 - Frontend:**
```bash
npm run start-client
```

### 5. Access Application

- Frontend: http://localhost:3000
- Backend: http://localhost:8080
- Test endpoint: http://localhost:8080/ping

## Common Commands

```bash
# Development
npm run server-dev      # Start backend with auto-reload
npm run start-client    # Start React dev server
npm run redis-restart   # Restart Redis
npm run dev:reset       # Reset local development state (Redis + optional MongoDB)

# Testing
npm test                # Run all tests with coverage
npm run test-dev        # Run tests in watch mode

# Production
npm run build          # Build React app
npm start              # Start production server
```

## Resetting Development State

When testing fresh game sessions or debugging, you may want to reset all local state:

```bash
# Reset Redis data (prompts for confirmation)
npm run dev:reset

# Skip confirmation prompt
npm run dev:reset -- -y

# Also reset MongoDB test collections
npm run dev:reset -- --include-mongodb
```

The reset script:
- Flushes all Redis keys
- Optionally clears MongoDB test collections
- Cleans up Redis data files (dump.rdb, appendonly.aof)
- Has safety guards to prevent running in production

## What You Need

### MongoDB Atlas (Required)

1. Create free account at https://www.mongodb.com/cloud/atlas
2. Create a cluster
3. Get connection URI
4. Add to `private/mongodb.js`

### NFT.storage (Optional - only for minting)

1. Sign up at https://nft.storage/
2. Generate API key
3. Add to `private/storageKeys.js`

### Tezos Testnet Account (Optional - only for minting)

1. Get testnet tez from faucet
2. Export private key
3. Add to `private/secrets.js`

## Minimal Setup (Browse Only)

For just exploring the codebase without full blockchain functionality:

1. Install dependencies: `npm ci`
2. Start Redis: `sudo service redis-server start`
3. Add MongoDB URI to `private/mongodb.js`
4. Start servers: `npm run server-dev` and `npm run start-client`

You can browse code, run tests, and explore the architecture without Tezos or NFT.storage configuration.

## Troubleshooting

**Redis not connecting?**
```bash
sudo service redis-server status
sudo service redis-server start
```

**MongoDB timeout?**
- Check IP whitelist in MongoDB Atlas
- Verify connection URI format
- Check database user credentials

**Port 8080 in use?**
```bash
lsof -i :8080
kill -9 <PID>
```

## Next Steps

- Read `SETUP.md` for detailed configuration
- Review `AGENTS.md` for architecture and development guidelines
- Explore the codebase starting with `src/server.ts`

## Architecture at a Glance

```
Frontend (React + Unity WebGL on :3000)
    ↓ Socket.io
Backend (Express + Socket.io on :8080)
    ↓
Redis (Real-time game state)
MongoDB (Pack inventory)
Tezos (NFT contracts)
```

## Key Technologies

- **Frontend**: React, TypeScript, Unity WebGL, Bootstrap
- **Backend**: Express, Socket.io, Node.js
- **Databases**: Redis (game state), MongoDB (inventory)
- **Blockchain**: Tezos, Taquito, SmartPy
- **Storage**: IPFS via NFT.storage

For complete documentation, see `SETUP.md`.
