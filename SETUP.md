# Digital Arcana - Setup Guide

This guide provides comprehensive instructions for setting up the Digital Arcana development environment.

## Table of Contents
- [Prerequisites](#prerequisites)
- [System Requirements](#system-requirements)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Smart Contract Configuration](#smart-contract-configuration)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Node.js**: v18.x (tested with v18.20.8) - see [Node.js Version Management](#nodejs-version-management) below
- **npm**: v10.x or higher (tested with v10.8.2)
- **Redis**: v6.x or higher (for real-time game state and session management)
- **MongoDB**: v4.x or higher (for card pack inventory)
- **Git**: For version control

### Recommended Tools

- **nvm** or **fnm**: For Node.js version management (strongly recommended)
- **nodemon**: For server development (auto-restart on changes)
- **WSL2** (Windows users): For running Redis and development environment

### Node.js Version Management

This project includes an `.nvmrc` file specifying the required Node.js version. We strongly recommend using a version manager to ensure consistency across development environments.

#### Using nvm (Node Version Manager)

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# In the project directory, install and use the correct Node.js version
nvm install
nvm use
```

#### Using fnm (Fast Node Manager)

```bash
# Install fnm (if not already installed)
curl -fsSL https://fnm.vercel.app/install | bash

# In the project directory, install and use the correct Node.js version
fnm install
fnm use
```

Both tools will automatically detect the `.nvmrc` file and use the specified Node.js version.

## System Requirements

- **OS**: Linux, macOS, or Windows with WSL2
- **RAM**: Minimum 4GB, recommended 8GB+
- **Storage**: At least 2GB free space for dependencies and build artifacts

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/a-digitalarcana/app.git da-app
cd da-app
```

### 2. Install Node.js Dependencies

```bash
npm ci
```

This installs exact versions from `package-lock.json` for consistency. Use `npm install` only if updating dependencies.

### 3. Install Redis

#### Ubuntu/Debian/WSL2
```bash
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

#### macOS
```bash
brew install redis
brew services start redis
```

#### Verify Installation
```bash
redis-cli ping
# Should return: PONG
```

### 4. Set Up MongoDB

Digital Arcana uses MongoDB Atlas for cloud database hosting. See [MONGODB_SETUP.md](MONGODB_SETUP.md) for detailed setup instructions.

Quick summary:
1. Create a MongoDB Atlas account at https://www.mongodb.com/cloud/atlas
2. Create a new cluster (free tier works for development)
3. Create a database user with read/write permissions
4. Whitelist your IP address (or use 0.0.0.0/0 for development)
5. Get your connection URI (format: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/packs`)

## Environment Configuration

Digital Arcana uses different configuration approaches for development and production:

### Development Mode

Create a `private/` directory for local configuration files (this directory is gitignored):

```bash
mkdir -p private
```

#### private/mongodb.js
```javascript
module.exports = {
    uri: "mongodb+srv://<username>:<password>@<cluster>.mongodb.net/digitalarcana?retryWrites=true&w=majority"
};
```

#### private/secrets.js
```javascript
module.exports = {
    default: {
        account4: "edsk..." // Tezos private key for signing transactions
    }
};
```

#### private/storageKeys.js
```javascript
module.exports = {
    default: {
        apiKey: "eyJ..." // NFT.storage API key
    }
};
```

### Production Mode

In production (e.g., on Qovery), configure environment variables instead:

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `8080` |
| `QOVERY_REDIS_Z8BD2191C_DATABASE_URL` | Redis connection URL | `redis://localhost:6379` |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `SIGNER_KEY` | Tezos private key for signing | `edsk...` |

### Environment Detection

The application automatically detects the environment:
- **Development**: `NODE_ENV === 'development'` - Uses `private/` directory files
- **Production**: Otherwise - Uses environment variables

See `src/utils.ts` for the `isDevelopment` flag.

## Database Setup

### Redis

Redis is used for:
- Real-time game state storage
- Player session management
- Event streaming (XREAD)
- Pub/sub messaging for multiplayer communication

**Key Patterns:**
- `${userId}:events` - Player event streams
- `${tableId}:events` - Table event streams
- `${tableId}:chat` - Table chat messages
- `${tableId}:${deckName}` - Game state storage
- `table:${N}` - Table player lists (sorted sets)

**Configuration:**
- Development: Connects to `localhost:6379` by default
- Production: Uses `QOVERY_REDIS_Z8BD2191C_DATABASE_URL` environment variable
- Connection timeout: 600s in development, 5s in production

### MongoDB

MongoDB is used for:
- Card pack inventory storage
- Pre-sorted pack management
- Purchase tracking

**Collections:**
- Packs: `{_id, tokenIds: number[], sold: boolean, pending: number}`

**Setup:**
1. Connect to MongoDB Atlas
2. Create database named `digitalarcana`
3. The application will create collections automatically on first use

## Smart Contract Configuration

Digital Arcana uses Tezos smart contracts for NFT management and escrow.

### Current Testnet Configuration (Hangzhounet)

Located in `src/contracts.ts`:

```typescript
export const fa2Contract = "KT1N1a7TA1rEedQo2pEQXhuVgSQNvgRWKkdJ";
export const escrowContract = "KT1WZY4nrsHbQn6VHX6Ny1X1LYcPb7mss9iK";
export const indexerUrl = "https://api.hangzhou2net.tzkt.io/v1/contracts/";
export const rpcUrl = "https://hangzhounet.api.tez.ie/";
export const network = NetworkType.HANGZHOUNET;
```

### Deploying New Contracts

If you need to deploy fresh contracts:

1. **Set up Tezos account:**
   ```bash
   # Generate a new testnet account
   npm run generate-tezos-account

   # This will output:
   # - A 24-word mnemonic (save this securely as backup)
   # - The account address (tz1...)
   # - The private key (edsk...)

   # Fund the account at https://faucet.ghostnet.teztnets.com/
   # Update private/secrets.js with the private key
   ```

2. **Deploy contracts:**
   - FA2 contract: `python/contracts/fa2.py`
   - Escrow contract: `python/contracts/escrow.py`
   - Use SmartPy CLI or IDE: https://smartpy.io/

3. **Update configuration:**
   - Edit `src/contracts.ts` with new contract addresses
   - Update `adminAddress` in `src/admin.ts`

### NFT.storage API Key

Required for uploading card images to IPFS:

1. Create account at https://nft.storage/
2. Generate API key from dashboard
3. Add to `private/storageKeys.js` (development) or environment variable (production)

## Development Workflow

### Starting the Development Environment

#### Terminal 1: Start Redis
```bash
sudo service redis-server start
# Or use: npm run redis-restart
```

#### Terminal 2: Start Backend Server
```bash
npm run server-dev
```
This starts the Express + Socket.io server on port 8080 with auto-reload.

#### Terminal 3: Start React Development Server
```bash
npm run start-client
```
This starts the React development server on port 3000 with hot reload.

### Development URLs

- **React App**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Backend Test Endpoint**: http://localhost:8080/ping (returns "pong" in dev mode)

### Build Commands

```bash
# Build React client for production
npm run build

# Start production server (serves built React app)
npm start

# Run tests with coverage
npm test

# Run tests in watch mode
npm run test-dev

# Run specific test
npx ava src/tests/test.ts --match "test name"
```

## Project Structure

```
da-app/
├── src/
│   ├── server.ts           # Express + Socket.io server entry point
│   ├── connection.ts       # Socket.io connection management
│   ├── cardtable.ts        # Table and multiplayer logic
│   ├── cardgame.ts         # Abstract game class
│   ├── games/              # Game implementations (War, Solitaire, Browse)
│   ├── marketplace.ts      # Pack purchase logic
│   ├── admin.ts            # Minting and admin operations
│   ├── contracts.ts        # Blockchain contract addresses
│   ├── cards.ts            # Card data management
│   ├── App.tsx             # React application entry
│   └── tests/              # Test files
├── python/contracts/       # SmartPy smart contracts
├── build/                  # Production React build (generated)
├── private/                # Local config files (gitignored)
├── sets/                   # Card image assets (gitignored)
├── public/                 # Static React assets
└── package.json           # Dependencies and scripts
```

## Configuration Files

### package.json Scripts

- `start` - Production server (ts-node)
- `start-client` - React dev server (port 3000)
- `server-dev` - Backend dev server with nodemon
- `build` - Build React for production
- `test` - Run tests with coverage (AVA + c8)
- `test-dev` - Run tests in watch mode
- `redis-restart` - Restart Redis service

### tsconfig.json

TypeScript configuration for both server and client code.

### .gitignore

Excludes from version control:
- `/node_modules` - Dependencies
- `/build` - Production build
- `/private` - Local configuration files
- `/sets` - Card image assets
- `.env.*` - Environment variables
- `/coverage` - Test coverage reports

## Troubleshooting

### Redis Connection Issues

**Error**: `Redis: ECONNREFUSED`

**Solution**:
```bash
# Check if Redis is running
sudo service redis-server status

# Start Redis
sudo service redis-server start

# Or restart
npm run redis-restart
```

### MongoDB Connection Issues

**Error**: `MongoNetworkError: connection timeout`

**Solutions**:
1. Verify connection URI in `private/mongodb.js`
2. Check MongoDB Atlas network access (IP whitelist)
3. Verify database user credentials
4. Ensure cluster is running (not paused)

### Port Already in Use

**Error**: `EADDRINUSE: address already in use :::8080`

**Solution**:
```bash
# Find process using port 8080
lsof -i :8080
# Or on Windows/WSL: netstat -ano | findstr :8080

# Kill the process
kill -9 <PID>
```

### Missing Dependencies

**Error**: `Cannot find module '...'`

**Solution**:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Compilation Errors

**Solution**:
```bash
# Clear TypeScript cache
rm -rf node_modules/.cache

# Rebuild
npm run build
```

### Unity WebGL Build Missing

**Error**: Unity build files not found

**Note**: Unity WebGL build files are not included in the repository. You'll need:
1. The Unity build output in `public/Build/` directory
2. Or run in headless mode for backend-only testing

## Testing

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test-dev
```

### Run Specific Test
```bash
npx ava src/tests/test.ts --match "test name"
```

### Test Configuration

Located in `package.json` under `ava` key:
- Extensions: `["ts"]`
- Files: `["src/tests/*"]`
- Requires: `["ts-node/register"]`
- Timeout: `1m`

Coverage reports generated with c8 in `/coverage` directory.

## Next Steps

After completing setup:

1. Verify all services are running (Redis, MongoDB, server, client)
2. Test the development environment
3. Review the architecture documentation in `CLAUDE.md` and `AGENTS.md`
4. Explore the codebase starting with `src/server.ts`
5. Run the test suite to ensure everything works

## Additional Resources

- **Tezos Documentation**: https://tezos.com/developers
- **Taquito Library**: https://tezostaquito.io/
- **SmartPy**: https://smartpy.io/
- **Socket.io**: https://socket.io/docs/
- **React**: https://react.dev/
- **Redis**: https://redis.io/docs/
- **MongoDB Atlas**: https://docs.atlas.mongodb.com/

## Support

For issues or questions:
- Check the troubleshooting section above
- Review existing issues on GitHub
- Create a new issue with detailed information about your setup and error messages
