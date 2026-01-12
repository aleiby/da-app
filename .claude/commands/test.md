---
name: test
description: Run automated game tests via socket.io
allowed-tools: Bash(npx vitest:*), Bash(curl:*), Bash(npm run server-dev:*), Bash(pgrep:*), Bash(sleep:*), Bash(lsof:*)
---

# Test Game Command

Run automated game tests via Vitest and Socket.io. Tests run headlessly without browser/UI overhead.

## Usage

```
/test <game>
```

Where `<game>` is one of:
- `war` - Run War game tests
- `solitaire` - Run Solitaire game tests
- `all` - Run all game tests

## When Invoked

1. **Validate argument:**
   - If no argument provided, list available options and exit
   - If invalid game name, show error and list options

2. **Check if server is running:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/socket.io/?EIO=4&transport=polling 2>/dev/null || echo "000"
   ```
   - If response is `200` or `400`, server is running
   - If `000` or connection refused, server needs to start

3. **Start server if needed:**
   ```bash
   npm run server-dev > /tmp/da-app-server.log 2>&1 &
   ```
   Then poll until ready (max 30 seconds):
   ```bash
   for i in {1..30}; do
     curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/socket.io/?EIO=4&transport=polling 2>/dev/null | grep -q "200\|400" && break
     sleep 1
   done
   ```

4. **Run appropriate tests:**

   For `war`:
   ```bash
   npx vitest run --testNamePattern "War:" src/tests/games/test-war.ts --reporter=verbose
   ```

   For `solitaire`:
   ```bash
   npx vitest run --testNamePattern "Solitaire:" src/tests/games/test-solitaire.ts --reporter=verbose
   ```

   For `all`:
   ```bash
   npx vitest run src/tests/games/ --reporter=verbose
   ```

5. **Report results:**
   - Summarize pass/fail counts
   - If failures, show relevant error messages
   - Keep it concise

## Test File Locations

- War tests: `src/tests/games/test-war.ts`
- Solitaire tests: `src/tests/games/test-solitaire.ts`

## Notes

- Tests use Socket.io directly (no browser/Playwright overhead)
- Each test uses unique wallet addresses (tz1TestXXX pattern)
- Tests clean up Redis data after completion
- Server logs written to `/tmp/da-app-server.log` if started by this command
