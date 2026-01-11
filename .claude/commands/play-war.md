---
name: play-war
description: Play War card game with the user for testing
allowed-tools: Bash(npx playwright:*), Bash(curl:*), Bash(lsof:*), Bash(npm run server-dev:*), Bash(pgrep:*), Bash(sleep:*)
---

# Play War Command

Play a game of War with the user via Socket.io. This command handles server startup and waits for the user to join.

## When Invoked

1. **Check if server is running:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/socket.io/?EIO=4&transport=polling 2>/dev/null || echo "000"
   ```
   - If response is `200` or `400`, server is running
   - If `000` or connection refused, server needs to start

2. **Start server if needed:**
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

3. **Inform user:**
   Tell the user:
   > Server is ready. Joining War matchmaking - I'll wait for you to join.
   > Open http://localhost:3000 and click the soldier icon (crossed swords) to play!

4. **Run the game:**
   ```bash
   npx playwright test e2e/war-game.spec.ts --reporter=list
   ```

5. **Report results:**
   - Summarize how many rounds were played
   - Note the exit condition (Bye, player left, or timeout)
   - Keep it brief and friendly

## Exit Conditions

The test exits when:
- Either player says "Bye" in chat
- The other player leaves (player count drops)
- 60 seconds of inactivity (no game events)

## Notes

- The test connects via Socket.io directly (bypasses Unity canvas)
- Claude plays as `tz1ClaudeTestWallet00000000000000000` with name "Claude"
- The test clicks Claude's deck once per second during gameplay
- Server logs are written to `/tmp/da-app-server.log` if started by this command
