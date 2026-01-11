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

      // Check for exit condition
      if (msg.toLowerCase().includes('bye')) {
        console.log('Received "Bye" - will exit');
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
    socket.on('setTable', (tableId: string, seat: string, count: number) => {
      console.log(`[TABLE] Joined ${tableId} as seat ${seat} (${count} players)`);
      lastActivityTime = Date.now();
      mySeat = seat;
      playerCount = count;
      // In War, seat A uses DeckA, seat B uses DeckB
      myDeckName = `Deck${seat}`;
      console.log(`My seat: ${seat}, my deck: ${myDeckName}`);
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

    // Check if we're already in a valid War game with another player
    console.log(`Current state: inWarGame=${inWarGame}, playerCount=${playerCount}`);

    if (inWarGame && playerCount === 2) {
      console.log('Already in a 2-player War game, ready to play!');
    } else {
      // Need to quit and rejoin
      if (inWarGame || playerCount > 0) {
        console.log('Quitting broken/solo game...');
        socket.emit('quitGame', 'War');
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Join War matchmaking
      console.log('Joining War matchmaking...');
      socket.emit('playGame', 'War');

      // Wait for matchmaking
      console.log('Waiting for match...');
      await new Promise((r) => setTimeout(r, 5000));
    }

    // Game loop - click deck every second
    const TIMEOUT_MS = 60000; // 1 minute timeout
    const POLL_INTERVAL_MS = 1000;
    let roundCount = 0;

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
});
