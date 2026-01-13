# Agent Instructions

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

### Design Principles
1. **Verify with metrics, not narratives** - When checking test results, verify quantitative metrics (counts, exit codes, timing) first. Message logs may be historical, cached, or misleading. "Rounds played: 0" matters more than chat messages showing gameplay.
2. **Symmetric events** - If there's a notification for entering a state, there should be one for leaving it. "Player joined" needs "Player left". This applies to game events, UI feedback, and state transitions.

## Commands

### Build & Test
- `npm run build` - Build React client for production
- `npm test` - Run all tests with Vitest + v8 coverage
- `npx vitest run --testNamePattern "test name"` - Run a specific test by name
- `npm run test-dev` - Run tests in watch mode
- `npm run test:contracts` - Run SmartPy contract tests (requires SmartPy installation)

### Playwright (Ad-hoc Verification)
Use Playwright for browser-based verification (console warnings, UI behavior, etc.). Write test scripts in `e2e/` as needed.
```bash
npx playwright test e2e/my-check.spec.ts --reporter=list
```
Config in `playwright.config.ts` auto-starts the dev server.

**Cleanup**: Delete one-off verification scripts after use. Keep scripts that would be useful for recurring checks (e.g., smoke tests, regression verification).

**Note**: Playwright reuses an existing server on port 3000 if running. Ensure the dev server has latest code (HMR should handle this) before verification.

### E2E Wallet Testing

The mock wallet (`e2e/mocks/beacon-wallet-mock.ts`) replaces `@taquito/beacon-wallet` during E2E tests, enabling automated testing without Beacon popup dialogs.

**Two modes:**
| Mode | Trigger | Behavior |
|------|---------|----------|
| Mock | `E2E_MOCK_WALLET=true` only | Fake operations, no network, fast |
| Real Signer | + `VITE_E2E_WALLET_KEY=edsk...` | Actual Ghostnet transactions |

**Running tests:**
```bash
# Mock mode (default, fast)
npx playwright test e2e/wallet-connect.spec.ts

# Real signer mode (actual Ghostnet transactions)
export $(grep -v '^#' .env.test | xargs) && npx playwright test e2e/wallet-connect.spec.ts
```

**Funded test wallet:** A funded Ghostnet wallet is configured in `.env.test` (git-ignored):
- Address: `tz1XMTb9x2xxagq9BZe8NZKHd7sp2iXmAxRj`
- Used for real blockchain tests (pack purchases, etc.)

**If wallet needs replacement or refunding:**
1. Generate new wallet: `npx ts-node scripts/generate-tezos-account.ts`
2. Fund via faucet: https://faucet.ghostnet.teztnets.com/
3. Update `.env.test` with new address and key

### Multiplayer Game Testing

The `e2e/war-game.spec.ts` test connects via Socket.io to play War against a human player.

**To play War with Claude:**
1. Start server: `npm run server-dev`
2. Start client: `npm run start-client`
3. In your browser, click the soldier icon to queue for War
4. Run: `npx playwright test e2e/war-game.spec.ts --reporter=list`

**Exit conditions:**
- Either player says "Bye" in chat
- Other player leaves (player count drops)
- 60 seconds of inactivity

**Note:** This test uses Socket.io directly, bypassing the Unity canvas. Claude plays as a second player with wallet `tz1ClaudeTestWallet00000000000000000`.

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

### Related Repositories
- **Unity Client**: https://github.com/a-digitalarcana/unity - 3D card table (C# scripts in `Assets/Scripts/`)

### Key Architecture Components

#### Server Architecture (src/server.ts)
The Express server hosts both the Socket.io server and React build in production. Two separate Socket.io namespaces:
1. `/browser` - Browser client communication (pack purchases, minting)
2. Default namespace - Unity client connections for gameplay

Redis client is initialized at server startup and shared across modules via export. Environment-based configuration uses `QOVERY_REDIS_*` environment variables (legacy; new hosting TBD).

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

### Game-Specific vs Shared Code
**Critical**: Keep game-specific logic in `src/games/*.ts`, not in shared modules.

- **Game-specific code** (`src/games/browse.ts`, `war.ts`, `solitaire.ts`): Card sorting, display rules, game flow, win conditions
- **Shared code** (`cards.ts`, `cardtable.ts`, `marketplace.ts`, `connection.ts`): Card data, table management, purchases, connections

**Rules:**
1. Shared code must NOT assume which game is running or start/restart games
2. Card sorting/filtering for a specific game belongs in that game's file, not `cards.ts`
3. After actions like pack purchases, update data (Redis cache) but don't manipulate active games
4. If you're importing from `src/games/` into shared code, reconsider the design

## Project-Specific bd Practices

### Future Work Gate
When creating issues for future/deferred work (not immediate priorities), you can gate them behind a "Future Work Gate" issue to keep them out of `bd ready`:
```bash
bd create --title="Future Work Gate" --type=epic --priority=3
# Note the issue ID (e.g., da-xxx)
bd create --title="..." --type=feature --priority=3
bd dep add <new-issue-id> <future-gate-id>
```
This pattern keeps future work organized and prevents it from appearing in `bd ready` until the gate is explicitly removed or resolved.

### Labels for Grouping Related Issues
Use labels to group related issues (e.g., `unity` for Unity-related work, `marketplace` for purchase flow issues). Labels help with filtering and discovery:
```bash
bd label add <issue-id> <label>      # Add label
bd list --label=<label>              # Find issues with label
bd label list-all                    # See all labels in use
```

If closing an issue should trigger review of related issues, document that in the issue's description as an "On close" instruction.

### No TODOs in Code
Use bd issues instead of TODO/FIXME comments in code. Inline comments get lost; bd issues are tracked, searchable, and have dependencies. Brief contextual comments are fine (e.g., `// Set after deployment`), but actionable work items belong in bd.

### Avoid Interactive Commands
**CRITICAL for autonomous agents**: Never use `bd edit` - it opens an interactive editor (vim/nano) that blocks execution. Always use `bd update` for field modifications:

```bash
# ✓ CORRECT - Inline field updates
bd update <id> --title "New title"
bd update <id> --status in_progress
bd update <id> --priority 0

# ✗ WRONG - Opens interactive editor
bd edit <id> --title
bd edit <id> --description
```

`bd update` supports all common fields inline: `--title`, `--description`, `--status`, `--priority`, `--assignee`, `--notes`, `--design`, `--acceptance`.
