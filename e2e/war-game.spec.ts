/**
 * E2E test for two-player War game via Socket.io.
 *
 * This test connects directly to the game server via Socket.io (bypassing
 * the Unity WebGL canvas) to play a game of War against another player.
 *
 * Exit conditions:
 * - "Bye" appears in chat
 * - No game activity for 60 seconds
 *
 * Usage:
 * - Start server: npm run server-dev
 * - Have human player queue for War (click soldier icon in Unity)
 * - Run: npx playwright test e2e/war-game.spec.ts --reporter=list
 */

import { test, expect } from '@playwright/test';
import { io, Socket } from 'socket.io-client';

// Test wallet address for Claude's player
const CLAUDE_WALLET = 'tz1ClaudeTestWallet00000000000000000';
const CLAUDE_NAME = 'Claude';

// Increase test timeout for real-time gameplay (2 minutes)
test.setTimeout(120000);

test.describe('War Game', () => {
  test('play War against another player via Socket.io', async () => {
    // Connect to the game server
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    console.log(`Connecting to ${serverUrl}...`);

    const socket: Socket = io(serverUrl, {
      transports: ['websocket'],
      timeout: 10000,
    });

    // Track game state
    let mySeat = '';
    let myDeckName = '';
    let playerCount = 0;
    let inWarGame = false;
    let lastActivityTime = Date.now();
    let shouldExit = false;
    const messages: string[] = [];

    // Promise to track connection
    const connected = new Promise<void>((resolve, reject) => {
      socket.on('connect', () => {
        console.log('Connected to server');
        resolve();
      });
      socket.on('connect_error', (err) => {
        console.error('Connection error:', err);
        reject(err);
      });
    });

    // Track messages for exit condition and game state
    socket.on('msg', (msg: string) => {
      console.log(`[MSG] ${msg}`);
      messages.push(msg);
      lastActivityTime = Date.now();

      // Check for exit conditions
      if (msg.toLowerCase().includes('bye')) {
        console.log('Received "Bye" - will exit');
        shouldExit = true;
      }
      if (msg.includes('has left the table')) {
        console.log('Other player left - will exit');
        shouldExit = true;
      }
    });

    // Track deck initialization
    socket.on('initDeck', (deckKey: string, cards: { id: number; facing: number }[]) => {
      console.log(`[INIT] ${deckKey} with ${cards.length} cards`);
      lastActivityTime = Date.now();
    });

    // Track cards being added to decks (after shuffling)
    socket.on('addCards', (deckKey: string, cardIds: number[], _toStart: boolean) => {
      console.log(`[ADD] ${cardIds.length} cards to ${deckKey}`);
      lastActivityTime = Date.now();
    });

    // Track cards moving between decks (during gameplay)
    socket.on('moveCards', (deckKey: string, cardIds: number[], _toStart: boolean) => {
      console.log(`[MOVE] ${cardIds.length} cards to ${deckKey}`);
      lastActivityTime = Date.now();
    });

    // Track table assignment
    let wasInGame = false;
    socket.on('setTable', (tableId: string, seat: string, count: number) => {
      console.log(`[TABLE] Joined ${tableId} as seat ${seat} (${count} players)`);
      lastActivityTime = Date.now();

      // Detect if other player left (was 2 players, now 1)
      if (wasInGame && playerCount === 2 && count < 2) {
        console.log('Other player left - will exit');
        shouldExit = true;
      }

      mySeat = seat;
      playerCount = count;
      // In War, seat A uses DeckA, seat B uses DeckB
      myDeckName = `Deck${seat}`;
      console.log(`My seat: ${seat}, my deck: ${myDeckName}`);

      if (count === 2) {
        wasInGame = true;
      }
    });

    // Track game resume (tells us which game we're in)
    socket.on('resumeGame', (game: string) => {
      console.log(`[GAME] ${game}`);
      lastActivityTime = Date.now();
      if (game === 'War') {
        inWarGame = true;
      }
    });

    // Track card reveals (when cards are flipped)
    socket.on('revealCards', (cards: { id: number; value: number }[]) => {
      if (cards.length > 0) {
        console.log(`[REVEAL] ${cards.length} cards: ${JSON.stringify(cards)}`);
        lastActivityTime = Date.now();
      }
    });

    // Track card facing changes
    socket.on('facing', (deckKey: string, cardStates: { id: number; facing: number }[]) => {
      console.log(`[FACING] ${deckKey}: ${cardStates.length} cards flipped`);
      lastActivityTime = Date.now();
    });

    // Wait for connection
    await connected;

    // Set wallet
    console.log(`Setting wallet to ${CLAUDE_WALLET}...`);
    socket.emit('setWallet', CLAUDE_WALLET);
    await new Promise((r) => setTimeout(r, 1000));

    // Set name
    console.log(`Setting name to ${CLAUDE_NAME}...`);
    socket.emit('userName', CLAUDE_NAME);
    await new Promise((r) => setTimeout(r, 1000));

    // Always quit any existing game and rejoin fresh.
    // When connecting to an unknown game state (e.g., human already in War), our local
    // tracking variables may not match reality since we miss events that happened before
    // we connected. Quitting ensures we start from a clean, synchronized state.
    console.log(`Current state: inWarGame=${inWarGame}, playerCount=${playerCount}`);

    if (inWarGame || playerCount > 0) {
      console.log('Quitting existing game to start fresh...');
      socket.emit('quitGame', 'War');
      await new Promise((r) => setTimeout(r, 1000));
      // Reset state after quitting
      inWarGame = false;
      playerCount = 0;
      mySeat = '';
      myDeckName = '';
    }

    // Join War matchmaking
    console.log('Joining War matchmaking...');
    socket.emit('playGame', 'War');

    // Wait for matchmaking
    console.log('Waiting for match...');
    await new Promise((r) => setTimeout(r, 3000));

    // Game loop - click deck every second
    const TIMEOUT_MS = 60000; // 1 minute timeout
    const POLL_INTERVAL_MS = 1000;
    let roundCount = 0;

    // Reset exit flag - historical messages from reconnection may have set it
    shouldExit = false;
    lastActivityTime = Date.now();

    console.log('Entering game loop...');
    console.log('Waiting for 2 players in War game...');

    while (!shouldExit) {
      // Check for inactivity timeout
      if (Date.now() - lastActivityTime > TIMEOUT_MS) {
        console.log('No activity for 60 seconds - exiting');
        break;
      }

      // Only click if we're in a 2-player War game
      if (inWarGame && playerCount === 2 && myDeckName && mySeat) {
        roundCount++;
        console.log(`Round ${roundCount}: Clicking ${myDeckName} (seat ${mySeat})...`);
        socket.emit('clickDeck', myDeckName, [], false);
      } else if (roundCount === 0) {
        // Still waiting for match
        console.log(`Waiting... (inWarGame=${inWarGame}, players=${playerCount})`);
      }

      // Wait before next action
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Say goodbye before leaving
    console.log('Sending Bye...');
    socket.emit('chat', 'Bye');
    await new Promise((r) => setTimeout(r, 500));

    // Clean up
    console.log('Disconnecting...');
    socket.disconnect();

    // Log summary
    console.log(`\n=== Game Summary ===`);
    console.log(`Rounds played: ${roundCount}`);
    console.log(`Messages: ${messages.length}`);
    messages.forEach((m) => console.log(`  ${m}`));

    // Test passes if we played and got some game messages
    expect(
      messages.some((m) => m.includes('played') || m.includes('wins') || m.includes('Welcome'))
    ).toBe(true);
  });

  test('reconnection restores game state mid-game', async () => {
    const serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    console.log(`[RECONNECT TEST] Connecting to ${serverUrl}...`);

    // Track state across reconnection
    let mySeat = '';
    let myDeckName = '';
    let playerCount = 0;
    let inWarGame = false;
    let lastActivityTime = Date.now();
    let shouldExit = false;
    const messages: string[] = [];

    // State restoration tracking
    let stateRestored = false;
    let receivedResumeGame = false;
    let receivedSetTable = false;

    function createSocket(): Socket {
      return io(serverUrl, {
        transports: ['websocket'],
        timeout: 10000,
      });
    }

    function setupSocketHandlers(socket: Socket, phase: string): void {
      socket.on('msg', (msg: string) => {
        console.log(`[${phase}][MSG] ${msg}`);
        messages.push(msg);
        lastActivityTime = Date.now();

        if (msg.toLowerCase().includes('bye')) {
          console.log(`[${phase}] Received "Bye" - will exit`);
          shouldExit = true;
        }
        if (msg.includes('has left the table')) {
          console.log(`[${phase}] Other player left - will exit`);
          shouldExit = true;
        }
      });

      socket.on('initDeck', (deckKey: string, cards: { id: number; facing: number }[]) => {
        console.log(`[${phase}][INIT] ${deckKey} with ${cards.length} cards`);
        lastActivityTime = Date.now();
      });

      socket.on('addCards', (deckKey: string, cardIds: number[], _toStart: boolean) => {
        console.log(`[${phase}][ADD] ${cardIds.length} cards to ${deckKey}`);
        lastActivityTime = Date.now();
      });

      socket.on('moveCards', (deckKey: string, cardIds: number[], _toStart: boolean) => {
        console.log(`[${phase}][MOVE] ${cardIds.length} cards to ${deckKey}`);
        lastActivityTime = Date.now();
      });

      socket.on('setTable', (tableId: string, seat: string, count: number) => {
        console.log(`[${phase}][TABLE] Joined ${tableId} as seat ${seat} (${count} players)`);
        lastActivityTime = Date.now();

        mySeat = seat;
        playerCount = count;
        myDeckName = `Deck${seat}`;
        console.log(`[${phase}] My seat: ${seat}, my deck: ${myDeckName}`);

        if (phase === 'RECONNECT') {
          receivedSetTable = true;
        }
      });

      socket.on('resumeGame', (game: string) => {
        console.log(`[${phase}][GAME] ${game}`);
        lastActivityTime = Date.now();
        if (game === 'War') {
          inWarGame = true;
          if (phase === 'RECONNECT') {
            receivedResumeGame = true;
          }
        }
      });

      socket.on('revealCards', (cards: { id: number; value: number }[]) => {
        if (cards.length > 0) {
          console.log(`[${phase}][REVEAL] ${cards.length} cards`);
          lastActivityTime = Date.now();
        }
      });

      socket.on('facing', (deckKey: string, cardStates: { id: number; facing: number }[]) => {
        console.log(`[${phase}][FACING] ${deckKey}: ${cardStates.length} cards`);
        lastActivityTime = Date.now();
      });
    }

    // === PHASE 1: Initial connection and start game ===
    console.log('\n=== PHASE 1: Initial Connection ===');
    let socket = createSocket();
    setupSocketHandlers(socket, 'INITIAL');

    const connected = new Promise<void>((resolve, reject) => {
      socket.on('connect', () => {
        console.log('[INITIAL] Connected to server');
        resolve();
      });
      socket.on('connect_error', (err) => {
        console.error('[INITIAL] Connection error:', err);
        reject(err);
      });
    });

    await connected;

    // Set wallet and name
    console.log(`[INITIAL] Setting wallet to ${CLAUDE_WALLET}...`);
    socket.emit('setWallet', CLAUDE_WALLET);
    await new Promise((r) => setTimeout(r, 1000));

    console.log(`[INITIAL] Setting name to ${CLAUDE_NAME}...`);
    socket.emit('userName', CLAUDE_NAME);
    await new Promise((r) => setTimeout(r, 1000));

    // Quit any existing game
    if (inWarGame || playerCount > 0) {
      console.log('[INITIAL] Quitting existing game...');
      socket.emit('quitGame', 'War');
      await new Promise((r) => setTimeout(r, 1000));
      inWarGame = false;
      playerCount = 0;
      mySeat = '';
      myDeckName = '';
    }

    // Join War matchmaking
    console.log('[INITIAL] Joining War matchmaking...');
    socket.emit('playGame', 'War');

    // Wait for matchmaking and play a few rounds
    console.log('[INITIAL] Waiting for match...');
    const POLL_INTERVAL_MS = 1000;
    let roundCount = 0;
    const ROUNDS_BEFORE_DISCONNECT = 5;

    lastActivityTime = Date.now();
    shouldExit = false;

    while (!shouldExit && roundCount < ROUNDS_BEFORE_DISCONNECT) {
      if (Date.now() - lastActivityTime > 60000) {
        console.log('[INITIAL] Timeout waiting for match');
        break;
      }

      if (inWarGame && playerCount === 2 && myDeckName && mySeat) {
        roundCount++;
        console.log(`[INITIAL] Round ${roundCount}: Clicking ${myDeckName}...`);
        socket.emit('clickDeck', myDeckName, [], false);
      } else {
        console.log(`[INITIAL] Waiting... (inWarGame=${inWarGame}, players=${playerCount})`);
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Verify we played some rounds before disconnecting
    expect(roundCount).toBeGreaterThan(0);
    console.log(`[INITIAL] Played ${roundCount} rounds before disconnect`);

    // Store state before disconnect for verification
    const seatBeforeDisconnect = mySeat;
    const deckBeforeDisconnect = myDeckName;

    // === PHASE 2: Disconnect mid-game ===
    console.log('\n=== PHASE 2: Disconnecting Mid-Game ===');
    socket.disconnect();
    console.log('[DISCONNECT] Socket disconnected');

    // Wait a moment to ensure server registers disconnect
    await new Promise((r) => setTimeout(r, 2000));

    // === PHASE 3: Reconnect with same wallet ===
    console.log('\n=== PHASE 3: Reconnecting ===');

    // Reset tracking flags for reconnection phase
    receivedResumeGame = false;
    receivedSetTable = false;
    inWarGame = false;
    playerCount = 0;
    mySeat = '';
    myDeckName = '';

    socket = createSocket();
    setupSocketHandlers(socket, 'RECONNECT');

    const reconnected = new Promise<void>((resolve, reject) => {
      socket.on('connect', () => {
        console.log('[RECONNECT] Connected to server');
        resolve();
      });
      socket.on('connect_error', (err) => {
        console.error('[RECONNECT] Connection error:', err);
        reject(err);
      });
    });

    await reconnected;

    // Set the SAME wallet to trigger state restoration
    console.log(`[RECONNECT] Setting wallet to ${CLAUDE_WALLET}...`);
    socket.emit('setWallet', CLAUDE_WALLET);

    // Wait for state restoration events
    console.log('[RECONNECT] Waiting for state restoration...');
    const stateRestoreTimeout = 10000;
    const startWait = Date.now();

    while (Date.now() - startWait < stateRestoreTimeout) {
      if (receivedResumeGame && receivedSetTable) {
        stateRestored = true;
        console.log('[RECONNECT] State restored successfully!');
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // Verify state was restored
    expect(stateRestored).toBe(true);
    expect(receivedResumeGame).toBe(true);
    expect(receivedSetTable).toBe(true);
    expect(mySeat).toBe(seatBeforeDisconnect);
    expect(myDeckName).toBe(deckBeforeDisconnect);
    console.log(`[RECONNECT] Restored to seat ${mySeat} with deck ${myDeckName}`);

    // === PHASE 4: Continue and complete the game ===
    console.log('\n=== PHASE 4: Completing Game ===');
    shouldExit = false;
    lastActivityTime = Date.now();
    let postReconnectRounds = 0;

    while (!shouldExit) {
      if (Date.now() - lastActivityTime > 60000) {
        console.log('[COMPLETE] Timeout - exiting');
        break;
      }

      if (inWarGame && playerCount === 2 && myDeckName && mySeat) {
        postReconnectRounds++;
        console.log(
          `[COMPLETE] Round ${roundCount + postReconnectRounds}: Clicking ${myDeckName}...`
        );
        socket.emit('clickDeck', myDeckName, [], false);
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Say goodbye
    console.log('[COMPLETE] Sending Bye...');
    socket.emit('chat', 'Bye');
    await new Promise((r) => setTimeout(r, 500));

    // Clean up
    console.log('[COMPLETE] Disconnecting...');
    socket.disconnect();

    // Log summary
    console.log(`\n=== Reconnection Test Summary ===`);
    console.log(`Rounds before disconnect: ${roundCount}`);
    console.log(`Rounds after reconnect: ${postReconnectRounds}`);
    console.log(`State restored: ${stateRestored}`);
    console.log(`Seat preserved: ${mySeat === seatBeforeDisconnect}`);

    // Test passes if state was restored and we continued playing
    expect(stateRestored).toBe(true);
    expect(postReconnectRounds).toBeGreaterThan(0);
  });
});
