# Agent Instructions

## Build & Test Commands
- `npm run build` - Build React client
- `npm test` - Run all tests (AVA + c8 coverage)
- `npx ava src/tests/test.ts --match "test name"` - Run single test
- `npm run start` - Start server (`ts-node ./src/server.ts`)
- `npm run start-client` - Start React dev server
- `npm run server-dev` - Start server with nodemon (dev mode)

## Architecture
- **React + TypeScript frontend** in `src/` (App.tsx, cards, escrow, marketplace)
- **Express + Socket.io server** in `src/server.ts` with Redis for real-time state
- **MongoDB** for pack storage (marketplace.ts, admin.ts)
- **SmartPy contracts** in `python/contracts/` (FA2, escrow for Tezos blockchain)
- **Games** in `src/games/` - card game implementations
- **Tests** in `src/tests/` using AVA framework

## Code Style
- TypeScript with strict typing; use `async/await` for promises
- Imports: named imports, no default exports for utilities
- Use `redis` client from server.ts; Socket.io for real-time events
- Taquito for Tezos blockchain interactions

---

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

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

