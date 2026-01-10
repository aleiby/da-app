#!/bin/bash
# Reset local development state for Digital Arcana
# This script clears Redis and optionally MongoDB test data
#
# WARNING: This is a destructive operation that will clear all local development data.
# It will NOT affect production data as it refuses to run when NODE_ENV=production.

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Redis CLI path (local install)
REDIS_CLI="$PROJECT_ROOT/.redis-install/redis-7.0.15/src/redis-cli"

# Check for system Redis CLI if local not available
if [ ! -f "$REDIS_CLI" ]; then
    if command -v redis-cli &> /dev/null; then
        REDIS_CLI="redis-cli"
    else
        echo -e "${RED}Error: redis-cli not found${NC}"
        echo "Please install Redis or run the local Redis installation."
        exit 1
    fi
fi

# Safety check: Refuse to run in production
if [ "$NODE_ENV" = "production" ]; then
    echo -e "${RED}ERROR: This script cannot run in production mode${NC}"
    echo "NODE_ENV is set to 'production'. This script is only for local development."
    echo "To use this script, ensure NODE_ENV is not set to 'production'."
    exit 1
fi

# Additional safety check: Look for production indicators
if [ -n "$QOVERY_REDIS_Z8BD2191C_DATABASE_URL" ]; then
    echo -e "${RED}ERROR: Production Redis URL detected${NC}"
    echo "This script is only for local development and should not be run"
    echo "when connected to a production database."
    exit 1
fi

if [ -n "$MONGODB_URI" ]; then
    echo -e "${YELLOW}WARNING: MONGODB_URI environment variable detected${NC}"
    echo "This might indicate a production or shared environment."
    echo "Please verify you intend to reset local development state only."
    echo ""
fi

# Parse command line arguments
SKIP_CONFIRM=false
INCLUDE_MONGODB=false

for arg in "$@"; do
    case $arg in
        -y|--yes)
            SKIP_CONFIRM=true
            ;;
        --include-mongodb)
            INCLUDE_MONGODB=true
            ;;
    esac
done

# Print warning banner
echo -e "${YELLOW}"
echo "================================================================"
echo "           DIGITAL ARCANA - DEVELOPMENT STATE RESET"
echo "================================================================"
echo -e "${NC}"
echo "This script will clear local development data:"
echo "  - Redis: All keys will be flushed"
echo "  - MongoDB: Test collections can optionally be cleared"
echo ""
echo -e "${YELLOW}WARNING: This action cannot be undone!${NC}"
echo ""

# Prompt for confirmation
if [ "$SKIP_CONFIRM" != "true" ]; then
    read -p "Are you sure you want to reset local development state? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Operation cancelled."
        exit 0
    fi
fi

echo ""
echo -e "${GREEN}Starting reset...${NC}"
echo ""

# ============================================
# REDIS RESET
# ============================================

echo "Checking Redis connection..."
if ! $REDIS_CLI ping > /dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Redis is not running or not accessible${NC}"
    echo "Skipping Redis flush. Start Redis with: npm run redis-start"
else
    echo "Flushing all Redis keys..."
    $REDIS_CLI FLUSHALL
    echo -e "${GREEN}Redis data cleared successfully${NC}"

    # Show Redis is now empty
    KEYS_COUNT=$($REDIS_CLI DBSIZE | grep -oP '\d+' || echo "0")
    echo "  Keys remaining: $KEYS_COUNT"
fi

echo ""

# ============================================
# MONGODB RESET (OPTIONAL)
# ============================================

# Check if user wants to reset MongoDB
if [ "$INCLUDE_MONGODB" = "true" ]; then
    echo -e "${YELLOW}MongoDB reset requested${NC}"
    echo ""
    echo "NOTE: MongoDB reset requires the mongosh CLI tool."
    echo "This will reset the 'packs' database test collections."
    echo ""

    # Check for local MongoDB configuration
    MONGODB_CONFIG="$PROJECT_ROOT/private/mongodb.js"
    if [ -f "$MONGODB_CONFIG" ]; then
        # Extract URI from the config file (simple grep, not ideal but functional)
        MONGO_URI=$(grep -oP "uri:\s*['\"][^'\"]+['\"]" "$MONGODB_CONFIG" 2>/dev/null | sed "s/uri:\s*['\"]//;s/['\"]$//" || echo "")

        if [ -n "$MONGO_URI" ]; then
            # Safety check: refuse if it looks like a production URI
            if echo "$MONGO_URI" | grep -qiE "(prod|production|live)" ; then
                echo -e "${RED}ERROR: MongoDB URI appears to be a production database${NC}"
                echo "Refusing to clear MongoDB data. Please verify your configuration."
            else
                echo "Would reset MongoDB at: ${MONGO_URI:0:50}..."
                echo ""
                echo "MongoDB reset is not fully implemented yet."
                echo "To manually reset MongoDB, use:"
                echo "  mongosh '<your-uri>' --eval 'db.getSiblingDB(\"packs\").dropDatabase()'"
            fi
        else
            echo "Could not extract MongoDB URI from config."
        fi
    else
        echo "No local MongoDB configuration found at $MONGODB_CONFIG"
        echo "MongoDB reset skipped."
    fi
else
    echo "MongoDB reset skipped (use --include-mongodb to include)"
fi

echo ""

# ============================================
# CLEAN UP LOCAL FILES (OPTIONAL)
# ============================================

# Clean up Redis dump files if they exist
REDIS_DATA_DIR="$PROJECT_ROOT/.redis"
if [ -d "$REDIS_DATA_DIR" ]; then
    echo "Cleaning Redis data directory..."
    # Only remove data files, not the directory itself
    rm -f "$REDIS_DATA_DIR/dump.rdb" 2>/dev/null || true
    rm -f "$REDIS_DATA_DIR/appendonly.aof" 2>/dev/null || true
    echo -e "${GREEN}Redis data files cleaned${NC}"
fi

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}          Development state reset complete!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo "You can now start fresh with:"
echo "  npm run server-dev    # Start the development server"
echo "  npm run start-client  # Start the React development server"
echo ""
