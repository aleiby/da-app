# Digital Arcana Scripting Language (DASL) Design Document

## Executive Summary

This document outlines the design for a domain-specific scripting language that enables community members to create custom card game rules for Digital Arcana. Rule sets will be stored on the Tezos blockchain as NFTs, enabling creators to earn revenue from their game designs.

## Table of Contents

1. [Goals and Requirements](#goals-and-requirements)
2. [Language Design Philosophy](#language-design-philosophy)
3. [Core Language Specification](#core-language-specification)
4. [Game API Reference](#game-api-reference)
5. [Security Model](#security-model)
6. [On-Chain Storage Strategy](#on-chain-storage-strategy)
7. [Runtime Architecture](#runtime-architecture)
8. [NFT Integration and Revenue Sharing](#nft-integration-and-revenue-sharing)
9. [Migration Path from Existing Games](#migration-path-from-existing-games)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Goals and Requirements

### Primary Goals

1. **Accessibility**: Non-programmers should be able to create simple card games
2. **Expressiveness**: Complex games like Solitaire variants should be possible
3. **Security**: Sandboxed execution with no access to system resources
4. **Portability**: Scripts run identically on server and can be validated on-chain
5. **Revenue Sharing**: Creators earn from rule set purchases

### Technical Requirements

1. **Deterministic Execution**: Same inputs must produce same outputs (for validation)
2. **Resource Bounded**: Time and memory limits enforced
3. **Compact Representation**: On-chain storage is expensive
4. **Integration**: Must work with existing card/deck/table infrastructure

### Constraints from Tezos

- Contract storage cost: ~0.00025 tez per byte
- Reasonable rule set target: < 10KB compressed
- Max operation gas limit: ~1 million gas units

---

## Language Design Philosophy

### Why a Custom DSL (vs. Existing Language Subset)

After analyzing the existing game implementations (War, Solitaire, Browse), the decision is to create a **domain-specific language (DSL)** rather than a subset of JavaScript/Lua because:

1. **Smaller on-chain footprint**: DSL bytecode is more compact
2. **Easier security sandboxing**: No need to block dangerous built-ins
3. **Card-game primitives**: First-class support for decks, cards, players, turns
4. **Simpler validation**: Grammar is constrained to game operations

### Language Paradigm

DASL uses a **declarative-imperative hybrid** approach:

- **Declarative**: Game setup, win conditions, valid moves
- **Imperative**: Turn logic, action sequences, state transitions

---

## Core Language Specification

### Data Types

```
# Primitives
Number      : Integer or decimal (e.g., 42, 3.14)
Boolean     : true | false
String      : "text in quotes"
CardId      : Unique identifier for a card instance
PlayerId    : Unique identifier for a player

# Collections
List<T>     : Ordered collection [item1, item2, ...]
Set<T>      : Unordered unique collection {item1, item2, ...}
Map<K,V>    : Key-value mapping {key1: value1, key2: value2}

# Game Types
Card        : {id: CardId, value: Number, suit: String, rarity: String}
Deck        : Named collection of cards with position/facing state
Player      : {id: PlayerId, name: String, seat: Number}
```

### Card Value System (Tarot-specific)

```
# Minor Arcana: value 0-55 (14 cards x 4 suits)
# Major Arcana: value 56-77 (22 cards)

card.rank       # 0-13 for minor (ace=0, king=13), full value for major
card.suit       # "pentacles", "swords", "wands", "cups", or "major"
card.isMajor    # true if major arcana
card.isMinor    # true if minor arcana
```

### Game Structure

A DASL game is organized into sections:

```
game "Game Name" {
    # Metadata
    version: "1.0"
    author: "tz1..."
    description: "A brief description"

    # Player configuration
    players {
        min: 2
        max: 4
    }

    # Deck configuration
    setup {
        # Define decks and initial card distribution
    }

    # Turn structure
    turn {
        # What happens each turn
    }

    # Event handlers
    on clickDeck(player, deck, selected) {
        # Handle deck clicks
    }

    on clickTable(player, x, z, selected) {
        # Handle table clicks
    }

    # Win condition
    win when {
        # Boolean expression
    }
}
```

### Example: War Game in DASL

```
game "War" {
    version: "1.0"
    author: "tz1DigitalArcana..."
    description: "Classic two-player card battle"

    players {
        min: 2
        max: 2
    }

    state {
        currentCardA: null
        currentCardB: null
    }

    setup {
        # Create decks for each player
        for player in players {
            deck "${player.seat}:draw" at player.position
            deck "${player.seat}:played" at player.position.offset(0.1, 0)
            deck "${player.seat}:won" at player.position.offset(0.2, 0)

            # Deal shuffled cards
            "${player.seat}:draw".add(shuffled(player.cards))
        }
    }

    function getValue(card) {
        if card.isMajor {
            return card.value  # Major arcana beats minor
        }
        return card.rank  # Use rank for minor arcana
    }

    on clickDeck(player, deck, selected) {
        let playerSeat = player.seat
        let drawDeck = "${playerSeat}:draw"
        let playedDeck = "${playerSeat}:played"

        # Only respond to clicks on own draw deck
        if deck.name != drawDeck { return }

        # Check if already played this round
        let currentCard = if playerSeat == "A" { state.currentCardA }
                          else { state.currentCardB }
        if currentCard != null { return }

        # Draw and reveal card
        let card = drawDeck.draw()
        if card == null { return }

        playedDeck.add(card)
        playedDeck.flip(card)
        reveal(card)

        broadcast("${player.name} played ${card.name}")

        # Store current card
        if playerSeat == "A" {
            state.currentCardA = card
        } else {
            state.currentCardB = card
        }

        # Check if both players have played
        if state.currentCardA != null and state.currentCardB != null {
            wait(1000)  # Dramatic pause

            let valueA = getValue(state.currentCardA)
            let valueB = getValue(state.currentCardB)

            if valueA > valueB {
                "A:won".addFrom("A:played", "B:played")
                broadcast("${playerA.name} wins the round!")
            } else if valueB > valueA {
                "B:won".addFrom("A:played", "B:played")
                broadcast("${playerB.name} wins the round!")
            } else {
                broadcast("It's a tie!")
            }

            # Reset for next round
            state.currentCardA = null
            state.currentCardB = null
        }
    }

    win when {
        # Win when opponent has no cards in draw pile
        any player in players where {
            "${player.seat}:draw".isEmpty and state.currentCardA == null
        }
    }
}
```

### Control Flow

```
# Conditionals
if condition {
    # statements
} else if otherCondition {
    # statements
} else {
    # statements
}

# Loops
for item in collection {
    # statements
}

for i in 1..10 {
    # statements (range inclusive)
}

while condition {
    # statements (with iteration limit for safety)
}

# Pattern matching
match card.suit {
    "pentacles" => { /* earth */ }
    "swords" => { /* air */ }
    "wands" => { /* fire */ }
    "cups" => { /* water */ }
    _ => { /* default */ }
}
```

### Operators

```
# Arithmetic
+, -, *, /, %

# Comparison
==, !=, <, >, <=, >=

# Logical
and, or, not

# Collection
in, contains, isEmpty

# Card-specific
beats (custom comparison)
```

---

## Game API Reference

### Deck Operations

```
# Creation and access
deck "name" at position           # Create named deck
deck "name"                       # Reference existing deck

# Card movement
deck.draw() -> Card               # Remove and return top card
deck.draw(n) -> List<Card>        # Remove and return n cards
deck.peek() -> Card               # View top card without removing
deck.add(card)                    # Add card to top
deck.add(cards)                   # Add multiple cards
deck.addToBottom(card)            # Add card to bottom
deck.addFrom(...decks)            # Move all cards from other decks
deck.shuffle()                    # Randomize order
deck.flip(card)                   # Toggle face up/down

# Queries
deck.count() -> Number            # Number of cards
deck.isEmpty -> Boolean           # True if no cards
deck.cards -> List<Card>          # All cards (read-only)
deck.topCard -> Card              # Top card reference
```

### Player Operations

```
players                           # List of all players
player.id -> PlayerId             # Unique identifier
player.name -> String             # Display name
player.seat -> String             # "A", "B", "C", etc.
player.position -> Position       # Table position
player.cards -> List<Card>        # Player's owned cards (NFTs)
```

### Table Operations

```
# Messaging
broadcast(message)                # Send to all players
whisper(player, message)          # Send to specific player

# Card revelation
reveal(card)                      # Show card to all players
reveal(card, player)              # Show card to specific player

# Timing
wait(milliseconds)                # Pause execution

# Table state
table.decks -> List<Deck>         # All decks on table
```

### State Management

```
# Game-specific state
state.variableName = value        # Set state variable
let x = state.variableName        # Read state variable

# State is automatically persisted to Redis
# State must be serializable (primitives, cards, lists, maps)
```

### Card Queries

```
card.id -> CardId
card.value -> Number              # 0-77 for tarot
card.rank -> Number               # 0-13 for minor, full for major
card.suit -> String
card.rarity -> String
card.name -> String               # Human-readable name
card.isFaceUp -> Boolean
card.isMajor -> Boolean
card.isMinor -> Boolean
```

---

## Security Model

### Sandboxing Requirements

1. **No I/O Access**: Scripts cannot read/write files, network, etc.
2. **No Globals**: Only game API available
3. **Bounded Execution**: Time limits per operation
4. **Memory Limits**: Maximum heap size enforced
5. **Deterministic**: No randomness outside provided functions

### Execution Limits

```
MAX_EXECUTION_TIME = 1000ms per event handler
MAX_LOOP_ITERATIONS = 10000
MAX_RECURSION_DEPTH = 100
MAX_MEMORY = 10MB
```

### Sandboxed Runtime Implementation

```typescript
// Conceptual implementation
class DASLRuntime {
    private sandbox: vm.Context;
    private iterationCount: number;
    private startTime: number;

    execute(bytecode: Bytecode, gameAPI: GameAPI): Result {
        this.startTime = Date.now();
        this.iterationCount = 0;

        // Create isolated context with only game API
        this.sandbox = vm.createContext({
            deck: gameAPI.deck,
            players: gameAPI.players,
            broadcast: gameAPI.broadcast,
            reveal: gameAPI.reveal,
            state: new Proxy(gameAPI.state, stateHandler),
            // ... other safe APIs
        });

        // Execute with timeout
        return vm.runInContext(bytecode, this.sandbox, {
            timeout: MAX_EXECUTION_TIME
        });
    }

    checkLimits() {
        if (++this.iterationCount > MAX_LOOP_ITERATIONS) {
            throw new ExecutionLimitError("Loop iteration limit exceeded");
        }
        if (Date.now() - this.startTime > MAX_EXECUTION_TIME) {
            throw new ExecutionLimitError("Execution time limit exceeded");
        }
    }
}
```

### Validation Pipeline

```
Source Code (DASL)
      |
      v
[Parser] --> AST
      |
      v
[Static Analyzer] --> Warnings, Type Errors
      |
      v
[Bytecode Compiler] --> Compact Bytecode
      |
      v
[On-chain Storage] --> NFT Token Metadata
```

---

## On-Chain Storage Strategy

### Storage Format

Rule sets are stored in token metadata using TZIP-16/TZIP-21 standards:

```json
{
    "name": "War - Classic Edition",
    "description": "Two-player card battle game",
    "version": "1.0.0",
    "creators": ["tz1CreatorAddress..."],
    "tags": ["2-player", "competitive", "classic"],
    "formats": {
        "dasl": {
            "mimeType": "application/x-dasl-bytecode",
            "uri": "ipfs://Qm..."
        }
    },
    "thumbnailUri": "ipfs://Qm...",
    "royalties": {
        "shares": {
            "tz1CreatorAddress": 100
        },
        "decimals": 2
    }
}
```

### Compression Strategy

1. **Bytecode Compilation**: Parse to compact bytecode format
2. **GZIP Compression**: Typically 60-70% size reduction
3. **IPFS Storage**: Larger assets stored off-chain with hash reference
4. **On-chain Hash**: Content hash for validation

### Size Estimates

| Game Complexity | Source Size | Bytecode | Compressed |
|-----------------|-------------|----------|------------|
| Simple (War)    | ~2 KB       | ~500 B   | ~200 B     |
| Medium          | ~5 KB       | ~1.5 KB  | ~600 B     |
| Complex         | ~15 KB      | ~5 KB    | ~2 KB      |

### Storage Costs (Tezos)

- 2 KB rule set: ~0.5 tez storage cost
- Rule set as NFT: Standard minting cost + storage
- Total per game: ~1-2 tez

---

## Runtime Architecture

### Integration with Existing System

```
┌─────────────────────────────────────────────────────────────┐
│                     Unity Client                            │
│  - Renders cards, table                                     │
│  - Sends click events via Socket.io                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Socket.io Events
                              v
┌─────────────────────────────────────────────────────────────┐
│                    Express Server                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              DASL Runtime Engine                     │   │
│  │  - Loads bytecode from NFT/IPFS                     │   │
│  │  - Executes in sandbox                              │   │
│  │  - Calls Game API                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         v                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Game API Adapter                        │   │
│  │  - Maps DASL calls to existing cardtable.ts         │   │
│  │  - Manages state in Redis                           │   │
│  │  - Broadcasts events                                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              v
┌─────────────────────────────────────────────────────────────┐
│                         Redis                               │
│  - Game state persistence                                   │
│  - Event streams                                            │
│  - Player connections                                       │
└─────────────────────────────────────────────────────────────┘
```

### Game Lifecycle

```
1. Player selects "Play [GameName]"
   |
   v
2. Server fetches rule set NFT metadata
   |
   v
3. Load bytecode from IPFS/on-chain
   |
   v
4. Create DASL Runtime instance
   |
   v
5. Execute setup block
   |
   v
6. Subscribe to click events
   |
   v
7. For each event:
   a. Deserialize event
   b. Execute handler in sandbox
   c. Apply state changes
   d. Broadcast updates
   |
   v
8. Check win condition after each action
   |
   v
9. On game end: cleanup, record results
```

### ScriptedGame Class

```typescript
// Extension of existing CardGame pattern
class ScriptedGame extends CardGame {
    private runtime: DASLRuntime;
    private bytecode: Bytecode;
    private ruleSetId: number;  // NFT token ID

    constructor(tableId: string, ruleSetId: number) {
        super(tableId);
        this.ruleSetId = ruleSetId;
    }

    getName(): string {
        return this.runtime.metadata.name;
    }

    getMinPlayers(): number {
        return this.runtime.config.players.min;
    }

    getMaxPlayers(): number {
        return this.runtime.config.players.max;
    }

    async begin(initialSetup: boolean): Promise<boolean> {
        // Load bytecode from blockchain/IPFS
        this.bytecode = await this.loadRuleSet(this.ruleSetId);

        // Initialize runtime with game API
        this.runtime = new DASLRuntime(this.bytecode, {
            tableId: this.tableId,
            players: this.players,
            deck: this.createDeckAPI(),
            broadcast: (msg) => broadcastMsg(this.tableId, msg),
            reveal: (card) => revealCard(this.tableId, card),
            state: await this.loadState()
        });

        if (initialSetup) {
            await this.runtime.executeSetup();
        }

        // Wire up event handlers
        this.onClickDeck(args => this.runtime.executeHandler('clickDeck', args));
        this.onClickTable(args => this.runtime.executeHandler('clickTable', args));

        return true;
    }
}
```

---

## NFT Integration and Revenue Sharing

### Rule Set NFT Contract Extension

Extend the existing FA2 contract to support rule set metadata:

```python
# Addition to fa2.py

class RuleSetMetadata:
    def get_type(self):
        return sp.TRecord(
            name = sp.TString,
            version = sp.TString,
            bytecode_hash = sp.TBytes,  # IPFS CID or on-chain hash
            min_players = sp.TNat,
            max_players = sp.TNat,
            creator = sp.TAddress,
            royalty_pct = sp.TNat,  # Basis points (100 = 1%)
        )
```

### Revenue Distribution Model

```
Game Purchase Flow:
1. Player purchases rule set NFT
2. Payment split:
   - Creator royalty: 10-30% (configurable)
   - Platform fee: 5%
   - Previous owner: remainder (if secondary sale)

Play Session Revenue (Future):
1. Player pays small fee to play premium games
2. Fee split:
   - Rule set creator: 70%
   - Card set artists: 20%
   - Platform: 10%
```

### Marketplace Integration

```typescript
// Extend marketplace.ts
interface RuleSetListing {
    tokenId: number;
    name: string;
    description: string;
    creator: string;
    price: number;
    royaltyPct: number;
    playerCount: { min: number; max: number };
    plays: number;  // Popularity metric
    rating: number;
}

async function purchaseRuleSet(
    buyer: string,
    tokenId: number,
    price: number
): Promise<void> {
    // 1. Verify payment
    // 2. Calculate royalty split
    // 3. Transfer NFT to buyer
    // 4. Distribute payments
}
```

---

## Migration Path from Existing Games

### Step 1: Create DASL Equivalents

Convert existing TypeScript games to DASL syntax:

| Game      | Priority | Complexity | Notes |
|-----------|----------|------------|-------|
| Browse    | Low      | Simple     | Utility, not a game |
| War       | High     | Simple     | Good first example |
| Solitaire | Medium   | Complex    | Tests advanced features |

### Step 2: Dual Runtime Support

```typescript
// cardtable.ts modification
const gameTypes: GameRegistry = {
    // Built-in games (TypeScript)
    Browse,
    War,
    Solitaire,

    // Scripted games (DASL)
    // Loaded dynamically from NFT
};

async function createGame(name: string, tableId: string): Promise<CardGame> {
    if (name in gameTypes) {
        // Built-in game
        return new gameTypes[name](tableId);
    } else {
        // Try to load as scripted game
        const ruleSetId = await lookupRuleSetByName(name);
        if (ruleSetId) {
            return new ScriptedGame(tableId, ruleSetId);
        }
        throw new Error(`Unknown game: ${name}`);
    }
}
```

### Step 3: Deprecation Path

1. Release DASL equivalents of built-in games
2. Mark TypeScript versions as deprecated
3. Transition users to DASL versions
4. Remove TypeScript game implementations

---

## Implementation Roadmap

### Phase 1: Language Foundation (4-6 weeks)

- [ ] Define complete grammar specification
- [ ] Implement lexer and parser
- [ ] Build AST representation
- [ ] Create type checker
- [ ] Implement bytecode compiler
- [ ] Build basic interpreter

### Phase 2: Game API Integration (3-4 weeks)

- [ ] Design Game API adapter layer
- [ ] Implement deck operations
- [ ] Implement player operations
- [ ] Implement state management
- [ ] Wire up event handlers

### Phase 3: Security Hardening (2-3 weeks)

- [ ] Implement sandbox isolation
- [ ] Add execution limits
- [ ] Build validation pipeline
- [ ] Security audit

### Phase 4: On-Chain Integration (3-4 weeks)

- [ ] Extend FA2 contract for rule sets
- [ ] Implement IPFS storage integration
- [ ] Build rule set loader
- [ ] Create minting workflow

### Phase 5: Creator Tools (4-6 weeks)

- [ ] Web-based DASL editor
- [ ] Syntax highlighting
- [ ] Error reporting
- [ ] Local testing environment
- [ ] Publishing workflow

### Phase 6: Marketplace (3-4 weeks)

- [ ] Rule set browser/discovery
- [ ] Purchase flow
- [ ] Rating/review system
- [ ] Creator dashboard

---

## Appendix A: Complete Grammar (EBNF)

```ebnf
program         = game_decl ;
game_decl       = "game" STRING "{" game_body "}" ;
game_body       = (metadata | players_decl | state_decl |
                   setup_decl | function_decl | handler_decl |
                   win_decl)* ;

metadata        = IDENT ":" (STRING | NUMBER) ;
players_decl    = "players" "{" player_config "}" ;
player_config   = ("min" | "max") ":" NUMBER ;
state_decl      = "state" "{" var_decl* "}" ;
setup_decl      = "setup" block ;
function_decl   = "function" IDENT "(" params? ")" block ;
handler_decl    = "on" event_name "(" params? ")" block ;
win_decl        = "win" "when" "{" expr "}" ;

event_name      = "clickDeck" | "clickTable" | "rightClickDeck" |
                  "rightClickTable" ;
params          = IDENT ("," IDENT)* ;

block           = "{" statement* "}" ;
statement       = var_decl | assignment | if_stmt | for_stmt |
                  while_stmt | match_stmt | expr_stmt | return_stmt ;
var_decl        = "let" IDENT ("=" expr)? ;
assignment      = (IDENT | member_expr) "=" expr ;
if_stmt         = "if" expr block ("else" "if" expr block)*
                  ("else" block)? ;
for_stmt        = "for" IDENT "in" expr block ;
while_stmt      = "while" expr block ;
match_stmt      = "match" expr "{" match_case+ "}" ;
match_case      = pattern "=>" block ;
return_stmt     = "return" expr? ;
expr_stmt       = expr ;

expr            = or_expr ;
or_expr         = and_expr ("or" and_expr)* ;
and_expr        = comp_expr ("and" comp_expr)* ;
comp_expr       = add_expr (comp_op add_expr)? ;
add_expr        = mul_expr (("+"|"-") mul_expr)* ;
mul_expr        = unary_expr (("*"|"/"|"%") unary_expr)* ;
unary_expr      = ("not"|"-") unary_expr | call_expr ;
call_expr       = member_expr ("(" args? ")")? ;
member_expr     = primary ("." IDENT | "[" expr "]")* ;
primary         = NUMBER | STRING | BOOLEAN | IDENT |
                  "(" expr ")" | list_expr | map_expr ;

list_expr       = "[" (expr ("," expr)*)? "]" ;
map_expr        = "{" (map_entry ("," map_entry)*)? "}" ;
map_entry       = (IDENT | STRING) ":" expr ;

comp_op         = "==" | "!=" | "<" | ">" | "<=" | ">=" ;
pattern         = STRING | NUMBER | IDENT | "_" ;
args            = expr ("," expr)* ;

IDENT           = [a-zA-Z_][a-zA-Z0-9_]* ;
NUMBER          = [0-9]+ ("." [0-9]+)? ;
STRING          = '"' [^"]* '"' ;
BOOLEAN         = "true" | "false" ;
```

---

## Appendix B: Bytecode Specification

### Instruction Set

```
# Stack operations
PUSH_NUM n          # Push number constant
PUSH_STR s          # Push string constant
PUSH_BOOL b         # Push boolean
PUSH_NULL           # Push null
POP                 # Discard top of stack
DUP                 # Duplicate top of stack

# Variables
LOAD_VAR name       # Load variable onto stack
STORE_VAR name      # Store top of stack to variable
LOAD_STATE name     # Load from game state
STORE_STATE name    # Store to game state

# Object/Member access
GET_MEMBER name     # Get property of object on stack
SET_MEMBER name     # Set property
GET_INDEX           # Get by index/key
SET_INDEX           # Set by index/key

# Control flow
JUMP offset         # Unconditional jump
JUMP_IF offset      # Jump if top is truthy
JUMP_UNLESS offset  # Jump if top is falsy
CALL func nargs     # Call function
RETURN              # Return from function

# Arithmetic
ADD, SUB, MUL, DIV, MOD

# Comparison
EQ, NEQ, LT, GT, LTE, GTE

# Logical
AND, OR, NOT

# Collections
MAKE_LIST n         # Create list from n stack items
MAKE_MAP n          # Create map from n key-value pairs
ITER_START          # Begin iteration
ITER_NEXT           # Get next item or jump

# Game operations (built-in functions)
GAME_DECK           # Create/access deck
GAME_DRAW           # Draw card
GAME_ADD            # Add card to deck
GAME_SHUFFLE        # Shuffle deck
GAME_REVEAL         # Reveal card
GAME_BROADCAST      # Send message
GAME_WAIT           # Pause execution
```

---

## Appendix C: Example Bytecode

War game "clickDeck" handler compiled to bytecode:

```
; on clickDeck(player, deck, selected)
clickDeck:
    ; let playerSeat = player.seat
    LOAD_VAR player
    GET_MEMBER seat
    STORE_VAR playerSeat

    ; let drawDeck = "${playerSeat}:draw"
    LOAD_VAR playerSeat
    PUSH_STR ":draw"
    CONCAT
    STORE_VAR drawDeck

    ; if deck.name != drawDeck { return }
    LOAD_VAR deck
    GET_MEMBER name
    LOAD_VAR drawDeck
    NEQ
    JUMP_UNLESS skip_return_1
    RETURN
skip_return_1:

    ; ... rest of handler
```

---

## Document History

| Version | Date       | Author | Changes |
|---------|------------|--------|---------|
| 0.1     | 2026-01-10 | DASL Design Team | Initial draft |

---

## Next Steps

1. Review and feedback from core team
2. Prototype parser implementation
3. Test War game conversion
4. Security review of sandbox approach
5. Cost analysis for on-chain storage
