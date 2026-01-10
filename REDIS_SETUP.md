# Redis Setup for Digital Arcana

This document describes the Redis installation and configuration for local development.

## Installation

Redis has been compiled from source and installed locally in the project directory at `.redis-install/redis-7.0.15/`.

### Redis Version
- Version: 7.0.15
- Malloc: libc
- Build: acd3439eaec010aa

### Installation Location
- Binaries: `.redis-install/redis-7.0.15/src/`
- Configuration: `redis.conf`
- Data directory: `.redis/`

## Starting Redis

### Option 1: Using npm script (recommended)
```bash
npm run redis-start
```

### Option 2: Using the shell script directly
```bash
./start-redis.sh
```

### Option 3: Manually
```bash
./.redis-install/redis-7.0.15/src/redis-server redis.conf --daemonize yes
```

## Stopping Redis

```bash
./.redis-install/redis-7.0.15/src/redis-cli shutdown
```

## Checking Redis Status

```bash
# Ping Redis
./.redis-install/redis-7.0.15/src/redis-cli ping

# Get server info
./.redis-install/redis-7.0.15/src/redis-cli info server
```

## Configuration

The `redis.conf` file contains development-specific settings:

- **Host**: 127.0.0.1 (localhost only)
- **Port**: 6379 (default)
- **Data directory**: `.redis/`
- **Persistence**: AOF enabled with RDB snapshots
- **Protected mode**: Disabled for local development
- **Logging**: Notice level to stdout

## Connection

The application connects to Redis using the URL:
- Development: `redis://127.0.0.1:6379` (default)
- Production: Uses `QOVERY_REDIS_Z8BD2191C_DATABASE_URL` environment variable

See `src/server.ts` for connection details.

## Troubleshooting

### Redis not starting
- Check if port 6379 is already in use: `lsof -i :6379`
- Check Redis logs in the `.redis/` directory
- Ensure the `.redis/` directory exists and is writable

### Connection timeout
- Verify Redis is running: `pgrep -f redis-server`
- Test connection: `./.redis-install/redis-7.0.15/src/redis-cli ping`

### Permission errors
- Ensure the `.redis/` directory has write permissions
- Check file ownership of Redis binaries

## Development Workflow

1. Start Redis: `npm run redis-start`
2. Start the development server: `npm run server-dev`
3. When done, stop Redis: `./.redis-install/redis-7.0.15/src/redis-cli shutdown`

## Notes

- Redis data persists between sessions in the `.redis/` directory
- The `.redis/` directory should be added to `.gitignore`
- For production deployment, use a managed Redis service (Qovery configuration in place)
