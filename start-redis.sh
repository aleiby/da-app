#!/bin/bash
# Start Redis server for Digital Arcana development

REDIS_CONF="./redis.conf"

# Prefer system Redis, fall back to local install
if command -v redis-server &> /dev/null; then
    REDIS_BIN="redis-server"
elif [ -f "./.redis-install/redis-7.0.15/src/redis-server" ]; then
    REDIS_BIN="./.redis-install/redis-7.0.15/src/redis-server"
else
    echo "Error: redis-server not found"
    echo "Install Redis system-wide or run: bash scripts/install-redis.sh"
    exit 1
fi

if [ ! -f "$REDIS_CONF" ]; then
    echo "Error: Redis configuration not found at $REDIS_CONF"
    exit 1
fi

# Ensure data directory exists
mkdir -p .redis

echo "Starting Redis server..."
$REDIS_BIN $REDIS_CONF
