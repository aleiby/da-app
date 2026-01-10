#!/bin/bash
# Health check script for Digital Arcana development environment
# Verifies all required dependencies and services are properly configured

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
echo "         DIGITAL ARCANA - SETUP HEALTH CHECK"
echo "================================================================"
echo -e "${NC}"
echo ""

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Helper functions
pass() {
    echo -e "  ${GREEN}[PASS]${NC} $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
    echo -e "  ${RED}[FAIL]${NC} $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

warn() {
    echo -e "  ${YELLOW}[WARN]${NC} $1"
    WARN_COUNT=$((WARN_COUNT + 1))
}

# ============================================
# 1. CHECK NODE.JS VERSION
# ============================================

echo -e "${BLUE}Checking Node.js...${NC}"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

    # Read required version from .nvmrc
    if [ -f "$PROJECT_ROOT/.nvmrc" ]; then
        REQUIRED_VERSION=$(cat "$PROJECT_ROOT/.nvmrc" | tr -d '[:space:]')
        REQUIRED_MAJOR=$(echo "$REQUIRED_VERSION" | cut -d. -f1)

        if [ "$NODE_MAJOR" -eq "$REQUIRED_MAJOR" ]; then
            if [ "$NODE_VERSION" = "$REQUIRED_VERSION" ]; then
                pass "Node.js v${NODE_VERSION} (exact match with .nvmrc)"
            else
                pass "Node.js v${NODE_VERSION} (major version matches .nvmrc v${REQUIRED_VERSION})"
            fi
        else
            warn "Node.js v${NODE_VERSION} (expected v${REQUIRED_VERSION} from .nvmrc)"
        fi
    else
        if [ "$NODE_MAJOR" -ge 18 ]; then
            pass "Node.js v${NODE_VERSION}"
        else
            fail "Node.js v${NODE_VERSION} is too old (need v18+)"
        fi
    fi
else
    fail "Node.js is not installed"
fi

# ============================================
# 2. CHECK NPM VERSION
# ============================================

echo -e "${BLUE}Checking npm...${NC}"

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    NPM_MAJOR=$(echo "$NPM_VERSION" | cut -d. -f1)

    if [ "$NPM_MAJOR" -ge 10 ]; then
        pass "npm v${NPM_VERSION}"
    else
        warn "npm v${NPM_VERSION} (recommend v10+, run: npm install -g npm@latest)"
    fi
else
    fail "npm is not installed"
fi

# ============================================
# 3. CHECK REDIS
# ============================================

echo -e "${BLUE}Checking Redis...${NC}"

REDIS_CLI=""
if [ -f "$PROJECT_ROOT/.redis-install/redis-7.0.15/src/redis-cli" ]; then
    REDIS_CLI="$PROJECT_ROOT/.redis-install/redis-7.0.15/src/redis-cli"
elif command -v redis-cli &> /dev/null; then
    REDIS_CLI="redis-cli"
fi

if [ -n "$REDIS_CLI" ]; then
    if $REDIS_CLI ping > /dev/null 2>&1; then
        REDIS_VERSION=$($REDIS_CLI info server 2>/dev/null | grep redis_version | cut -d: -f2 | tr -d '\r')
        pass "Redis v${REDIS_VERSION} running and responding"
    else
        fail "Redis is installed but not running (run: npm run redis-start)"
    fi
else
    fail "Redis is not installed (run: bash scripts/install-redis.sh)"
fi

# ============================================
# 4. CHECK MONGODB CONNECTION
# ============================================

echo -e "${BLUE}Checking MongoDB configuration...${NC}"

if [ -f "$PROJECT_ROOT/private/mongodb.js" ]; then
    # Check if it's still the template
    if grep -q "<username>" "$PROJECT_ROOT/private/mongodb.js" 2>/dev/null; then
        warn "private/mongodb.js exists but contains placeholder values"
    else
        pass "private/mongodb.js is configured"

        # Optional: Try to verify connection if mongosh is available
        if command -v mongosh &> /dev/null; then
            # Extract URI from config file
            MONGO_URI=$(node -e "console.log(require('./private/mongodb.js').uri)" 2>/dev/null || echo "")
            if [ -n "$MONGO_URI" ]; then
                if mongosh "$MONGO_URI" --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
                    pass "MongoDB connection verified"
                else
                    warn "MongoDB configured but connection failed (check credentials or network)"
                fi
            fi
        fi
    fi
else
    warn "private/mongodb.js not found (copy from private.example/)"
fi

# ============================================
# 5. CHECK PRIVATE CONFIG FILES
# ============================================

echo -e "${BLUE}Checking private configuration files...${NC}"

check_private_file() {
    local file=$1
    local desc=$2

    if [ -f "$PROJECT_ROOT/private/$file" ]; then
        if grep -q "<.*>" "$PROJECT_ROOT/private/$file" 2>/dev/null; then
            warn "private/$file exists but has placeholder values"
        else
            pass "private/$file"
        fi
    else
        warn "private/$file not found ($desc)"
    fi
}

check_private_file "secrets.js" "Tezos account configuration"
check_private_file "storageKeys.js" "NFT.storage API keys"

# ============================================
# 6. CHECK NODE_MODULES
# ============================================

echo -e "${BLUE}Checking dependencies...${NC}"

if [ -d "$PROJECT_ROOT/node_modules" ]; then
    # Check if node_modules is up to date with package-lock.json
    if [ -f "$PROJECT_ROOT/package-lock.json" ]; then
        LOCK_TIME=$(stat -c %Y "$PROJECT_ROOT/package-lock.json" 2>/dev/null || stat -f %m "$PROJECT_ROOT/package-lock.json" 2>/dev/null)
        MODULES_TIME=$(stat -c %Y "$PROJECT_ROOT/node_modules" 2>/dev/null || stat -f %m "$PROJECT_ROOT/node_modules" 2>/dev/null)

        if [ -n "$LOCK_TIME" ] && [ -n "$MODULES_TIME" ]; then
            if [ "$LOCK_TIME" -gt "$MODULES_TIME" ]; then
                warn "node_modules may be out of date (run: npm install)"
            else
                pass "node_modules installed and up to date"
            fi
        else
            pass "node_modules installed"
        fi
    else
        pass "node_modules installed"
    fi
else
    fail "node_modules not found (run: npm install)"
fi

# ============================================
# 7. CHECK BUILD OUTPUT
# ============================================

echo -e "${BLUE}Checking build output...${NC}"

if [ -d "$PROJECT_ROOT/build" ] && [ -f "$PROJECT_ROOT/build/index.html" ]; then
    pass "React build exists in build/"
else
    warn "React build not found (run: npm run build)"
fi

# ============================================
# SUMMARY
# ============================================

echo ""
echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}                         SUMMARY${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}   $PASS_COUNT"
echo -e "  ${YELLOW}Warnings:${NC} $WARN_COUNT"
echo -e "  ${RED}Failed:${NC}   $FAIL_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ] && [ $WARN_COUNT -eq 0 ]; then
    echo -e "${GREEN}All checks passed! Your development environment is ready.${NC}"
    exit 0
elif [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${YELLOW}Some warnings found. Review the output above.${NC}"
    exit 0
else
    echo -e "${RED}Some checks failed. Please fix the issues above.${NC}"
    exit 1
fi
