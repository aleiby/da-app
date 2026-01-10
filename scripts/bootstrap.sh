#!/bin/bash
# Bootstrap script for Digital Arcana development environment
# This script sets up the development environment for new developers or AI agents.
# Safe to re-run (idempotent).

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo -e "${BLUE}"
echo "================================================================"
echo "         DIGITAL ARCANA - DEVELOPMENT BOOTSTRAP"
echo "================================================================"
echo -e "${NC}"
echo ""

# Track overall status
ERRORS=0

# ============================================
# 1. CHECK NODE/NPM VERSIONS
# ============================================

echo -e "${BLUE}[1/5] Checking Node.js and npm versions...${NC}"

# Required versions from package.json
REQUIRED_NODE_MAJOR=18
REQUIRED_NPM_MAJOR=10

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js v${REQUIRED_NODE_MAJOR}.x or later"
    echo "Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
    echo -e "${RED}Error: Node.js version $NODE_VERSION is too old${NC}"
    echo "Required: v${REQUIRED_NODE_MAJOR}.x or later"
    echo "Current: v${NODE_VERSION}"
    exit 1
fi
echo -e "  ${GREEN}Node.js v${NODE_VERSION}${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
NPM_MAJOR=$(echo "$NPM_VERSION" | cut -d. -f1)

if [ "$NPM_MAJOR" -lt "$REQUIRED_NPM_MAJOR" ]; then
    echo -e "${YELLOW}Warning: npm version $NPM_VERSION is older than recommended${NC}"
    echo "  Recommended: v${REQUIRED_NPM_MAJOR}.x or later"
    echo "  You can update npm with: npm install -g npm@latest"
else
    echo -e "  ${GREEN}npm v${NPM_VERSION}${NC}"
fi

echo ""

# ============================================
# 2. INSTALL NPM DEPENDENCIES
# ============================================

echo -e "${BLUE}[2/5] Installing npm dependencies...${NC}"

if [ -d "node_modules" ]; then
    echo "  node_modules exists, checking for updates..."
fi

npm install --silent 2>&1 | while read line; do
    # Only show important lines
    if echo "$line" | grep -qE "(added|removed|changed|up to date|npm warn)"; then
        echo "  $line"
    fi
done

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo -e "  ${GREEN}Dependencies installed successfully${NC}"
else
    echo -e "${RED}Error: npm install failed${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# ============================================
# 3. START REDIS (IF NOT RUNNING)
# ============================================

echo -e "${BLUE}[3/5] Checking Redis...${NC}"

REDIS_CLI="$PROJECT_ROOT/.redis-install/redis-7.0.15/src/redis-cli"

# Check for system Redis CLI if local not available
if [ ! -f "$REDIS_CLI" ]; then
    if command -v redis-cli &> /dev/null; then
        REDIS_CLI="redis-cli"
    fi
fi

# Check if Redis is running
REDIS_RUNNING=false
if [ -n "$REDIS_CLI" ] && [ -f "$REDIS_CLI" ] || command -v redis-cli &> /dev/null; then
    if $REDIS_CLI ping > /dev/null 2>&1; then
        REDIS_RUNNING=true
        echo -e "  ${GREEN}Redis is already running${NC}"
    fi
fi

if [ "$REDIS_RUNNING" = "false" ]; then
    # Check if local Redis is installed
    REDIS_SERVER="$PROJECT_ROOT/.redis-install/redis-7.0.15/src/redis-server"
    if [ -f "$REDIS_SERVER" ]; then
        echo "  Starting local Redis server in background..."
        if [ -f "$PROJECT_ROOT/redis.conf" ]; then
            nohup $REDIS_SERVER "$PROJECT_ROOT/redis.conf" > /dev/null 2>&1 &
            sleep 2
            if $REDIS_CLI ping > /dev/null 2>&1; then
                echo -e "  ${GREEN}Redis started successfully${NC}"
            else
                echo -e "${YELLOW}Warning: Could not start Redis${NC}"
                echo "  Try manually with: npm run redis-start"
                ERRORS=$((ERRORS + 1))
            fi
        else
            echo -e "${YELLOW}Warning: redis.conf not found${NC}"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e "${YELLOW}Warning: Redis is not installed locally${NC}"
        echo "  See REDIS_SETUP.md for installation instructions"
        echo "  Or install system Redis and run: npm run redis-restart"
        ERRORS=$((ERRORS + 1))
    fi
fi

echo ""

# ============================================
# 4. COPY PRIVATE CONFIG TEMPLATES
# ============================================

echo -e "${BLUE}[4/5] Setting up private configuration...${NC}"

if [ -d "$PROJECT_ROOT/private" ]; then
    echo -e "  ${GREEN}private/ directory already exists${NC}"
    echo "  (Skipping copy to preserve existing configuration)"
else
    if [ -d "$PROJECT_ROOT/private.example" ]; then
        echo "  Copying private.example/ to private/..."
        cp -r "$PROJECT_ROOT/private.example" "$PROJECT_ROOT/private"
        echo -e "  ${GREEN}Configuration templates copied${NC}"
        echo -e "  ${YELLOW}NOTE: You need to update private/ files with your credentials${NC}"
    else
        echo -e "${RED}Error: private.example/ directory not found${NC}"
        ERRORS=$((ERRORS + 1))
    fi
fi

echo ""

# ============================================
# 5. VERIFY SETUP (TYPECHECK + TESTS)
# ============================================

echo -e "${BLUE}[5/5] Verifying setup...${NC}"

# Run typecheck
echo "  Running TypeScript type check..."
if npm run typecheck --silent 2>&1; then
    echo -e "  ${GREEN}Type check passed${NC}"
else
    echo -e "${YELLOW}Warning: Type check had issues${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Run tests (only if Redis is available)
if $REDIS_CLI ping > /dev/null 2>&1; then
    echo "  Running tests..."
    if npm test --silent 2>&1; then
        echo -e "  ${GREEN}Tests passed${NC}"
    else
        echo -e "${YELLOW}Warning: Some tests failed${NC}"
        echo "  Run 'npm test' to see details"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}  Skipping tests (Redis not available)${NC}"
fi

echo ""

# ============================================
# FINAL STATUS AND NEXT STEPS
# ============================================

echo -e "${BLUE}================================================================${NC}"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}         Bootstrap completed successfully!${NC}"
else
    echo -e "${YELLOW}         Bootstrap completed with $ERRORS warning(s)${NC}"
fi
echo -e "${BLUE}================================================================${NC}"
echo ""

echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo "1. Configure API keys (if not already done):"
echo "   - Edit private/mongodb.js  - MongoDB Atlas connection URI"
echo "   - Edit private/secrets.js  - Tezos account private key"
echo "   - Edit private/storageKeys.js - NFT.storage API key"
echo "   See private/README.md for details."
echo ""
echo "2. Start the development server:"
echo "   npm run server-dev     # Backend (watches for changes)"
echo "   npm run start-client   # Frontend (Vite dev server)"
echo ""
echo "3. Or run both for production-like setup:"
echo "   npm run build          # Build React client"
echo "   npm run start          # Start production server"
echo ""
echo "For more information:"
echo "   - QUICKSTART.md   - Quick start guide"
echo "   - SETUP.md        - Detailed setup documentation"
echo "   - CLAUDE.md       - Architecture & development guide"
echo ""

exit $ERRORS
