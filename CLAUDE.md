# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision & Constraints

Digital Arcana is intended to be a self-sustaining, community-owned card game. Key principles:

### Business Model
- **Free-to-play**: Anyone can play with a default deck at no cost
- **Self-funded via ads**: Revenue from in-game advertising should cover hosting costs (no subscriptions, no business deals requiring ongoing relationships)
- **Premium optional**: Players can purchase NFT card packs for collectible/premium decks
- **Creator revenue sharing**:
  - **Artists**: NFT contracts include royalty percentages for card set artwork creators on future sales
  - **Game designers**: Rule sets will be stored on-chain as NFTs; creators earn from purchases
- **Open-source**: Code remains public; succession via private key transfer (similar to Hic et Nunc model)

### Future: Scripting Language for Rule Sets
A planned scripting language will allow community members to create custom card game rules. These rule sets will be:
- Stored on the Tezos blockchain as NFTs
- Purchasable/sellable by players
- Revenue-sharing with the rule set creator

### Current Status
- **Prototype stage**: Functional gameplay but not production-ready
- **Hosting**: Previously on Qovery/AWS, needs new cost-effective hosting solution
- **Monetization**: Original "ads on card artwork" concept rejected by Google Ads; exploring gaming-specific ad networks (AdinPlay, Venatus, MonetizeMore)

### Decision Guidelines
When making technical decisions, consider:
1. **Cost efficiency** - Minimize hosting/operational costs; ad revenue must exceed expenses
2. **Simplicity** - Avoid over-engineering; this is a community project, not enterprise software
3. **Independence** - Prefer solutions that don't create vendor lock-in or require ongoing business relationships

## Commands

### Build & Test
- `npm run build` - Build React client for production
- `npm test` - Run all tests with Vitest + v8 coverage
- `npx vitest run --testNamePattern "test name"` - Run a specific test by name
- `npm run test-dev` - Run tests in watch mode
- `npm run test:contracts` - Run SmartPy contract tests (requires SmartPy installation)

### Development
- `npm run start` - Start production server (`ts-node ./src/server.ts`)
- `npm run start-client` - Start React development server (port 3000)
- `npm run server-dev` - Start server with nodemon in development mode (watches for changes)
- `npm run redis-start` - Start Redis server (required for development, see REDIS_SETUP.md)
- `npm run redis-restart` - Restart Redis service (for system-wide installations)

## Architecture Overview

Digital Arcana is a web platform for playing card games with NFT tarot cards on the Tezos blockchain.

### Technology Stack
- **Frontend**: React + TypeScript with Bootstrap UI, Unity WebGL for 3D card table
- **Backend**: Express + Socket.io server with real-time multiplayer communication
- **Database**: Redis for real-time game state and session management, MongoDB for card pack inventory
- **Blockchain**: Tezos (via Taquito library), SmartPy contracts (FA2 NFT standard + escrow)

### Key Architecture Components

#### Server Architecture (src/server.ts)
The Express server hosts both the Socket.io server and React build in production. Two separate Socket.io namespaces:
1. `/browser` - Browser client communication (pack purchases, minting)
2. Default namespace - Unity client connections for gameplay

Redis client is initialized at server startup and shared across modules via export. Environment-based configuration uses `QOVERY_REDIS_*` environment variables (legacy; new hosting TBD - see issue da-app-8tm).

#### Connection Management (src/connection.ts)
Each Socket.io connection creates a `Connection` instance that:
- Manages Redis event streams (`${userId}:events`, `${tableId}:events`, `${tableId}:chat`)
- Uses blocking Redis XREAD to stream events to clients
- Handles wallet connection, name setting, matchmaking, and game joining
- Routes player actions (clicks, chat) to the appropriate game via Redis pub/sub

#### Game Tables (src/cardtable.ts)
Tables are the core multiplayer primitive:
- Each table has unique ID (`table:N`) and a sorted set of player wallet addresses
- Players assigned seats (A, B, etc.) based on join order
- Tables store game state in Redis with keys like `${tableId}:${deckName}`
- Messages broadcast via Redis streams to all players at a table

#### Card Games (src/cardgame.ts + src/games/)
Games extend `CardGame` abstract class and implement:
- `getName()`, `getMinPlayers()`, `getMaxPlayers()`
- `begin(initialSetup: boolean)` - Setup on first start or resume
- Click handlers via `onClickDeck()`, `onClickTable()`, etc.

Games register with Redis pub/sub channels for player input (`${tableId}:clickDeck`, etc.). Current games:
- **Browse** (src/games/browse.ts) - Card collection browser
- **War** (src/games/war.ts) - Two-player card battle game
- **Solitaire** (src/games/solitaire.ts) - Single-player card game

#### Card Management (src/cards.ts)
Cards are NFTs on Tezos blockchain. The system:
- Queries Tezos FA2 contract for owned tokens per wallet
- Caches card data in Redis
- Virtual decks stored as Redis sorted sets with card IDs
- Card data includes: id, value, suit, rarity (from token metadata)

#### Marketplace & Packs (src/marketplace.ts, src/admin.ts)
Pack purchasing flow:
1. User escrows tez in smart contract (src/escrow.ts)
2. Server verifies escrow, picks random unsold pack from MongoDB
3. Atomically: redeem escrow + transfer NFTs to buyer via batch operation
4. Mark pack as sold in MongoDB

MongoDB collections store presorted packs with `{_id, tokenIds[], sold, pending}` structure.

#### Frontend (src/App.tsx)
React app embeds Unity WebGL build for 3D card table. Communicates via:
- Socket.io `/browser` namespace for non-game actions
- Unity bridge for game state (UnityContext.send/on pattern)
- Taquito Beacon wallet for Tezos blockchain interactions

#### Smart Contracts (python/contracts/)
- **fa2.py** - FA2 NFT token contract (cards as NFTs)
- **escrow.py** - Escrow contract for pack purchases (prevents front-running)
- Deployed on Tezos testnet and mainnet (see README for addresses)

#### Smart Contract Tests (python/tests/)
SmartPy tests for contract verification:
- **test_fa2.py** - FA2 token tests (minting, transfers, operators, balance queries)
- **test_escrow.py** - Escrow/Marketplace tests (deposits, redemption, edge cases)
- Run with: `npm run test:contracts` or `./python/tests/run_tests.sh`
- Requires SmartPy: `pip install smartpy-tezos`
- See `python/tests/README.md` for detailed documentation

### Data Flow Example: Playing War
1. Player clicks "Play War" → Connection.playGame() → matchmaking via Redis list
2. newTable([playerA, playerB]) creates table, assigns seats
3. beginGame('War', tableId) → War class subscribes to Redis pub/sub
4. Players click deck → clickDeck event → Redis pub/sub → War.onClickDeck()
5. Game logic executed server-side, broadcasts card reveals and messages to table
6. Connection event streams deliver updates to both Unity clients

### Code Style
- TypeScript with async/await (no .then() chains)
- Named imports preferred over default exports for utilities
- Redis client accessed via `import { redis } from "./server"`
- Socket.io for all real-time events (no polling)
- Taquito for Tezos blockchain interactions

## Issue Tracking with bd (beads)

This project uses **bd** for issue tracking. Run `bd onboard` to get started.

### Common bd commands:
- `bd ready` - Find available work
- `bd show <id>` - View issue details
- `bd update <id> --status in_progress` - Claim work
- `bd close <id>` - Complete work
- `bd sync` - Sync with git

### Future Work Gate
When creating issues for future/deferred work (not immediate priorities), add a dependency on the **Future Work Gate** (`da-app-ke2`):
```bash
bd create --title="..." --type=feature --priority=3
bd dep add <new-issue-id> da-app-ke2
```
This keeps future work out of `bd ready` until explicitly approved.

### No TODOs in Code
Use bd issues instead of TODO/FIXME comments in code. Inline comments get lost; bd issues are tracked, searchable, and have dependencies. Brief contextual comments are fine (e.g., `// Set after deployment`), but actionable work items belong in bd.

### Landing the Plane (Session Completion)

When ending a work session, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
