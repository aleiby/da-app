#!/bin/bash
# Start Redis server for Digital Arcana development

REDIS_BIN="./.redis-install/redis-7.0.15/src/redis-server"
REDIS_CONF="./redis.conf"

if [ ! -f "$REDIS_BIN" ]; then
    echo "Error: Redis binary not found at $REDIS_BIN"
    echo "Please run the installation script first."
    exit 1
fi

if [ ! -f "$REDIS_CONF" ]; then
    echo "Error: Redis configuration not found at $REDIS_CONF"
    exit 1
fi

echo "Starting Redis server..."
$REDIS_BIN $REDIS_CONF
