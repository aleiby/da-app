#!/bin/bash
# Install Redis locally for Digital Arcana development
# Downloads and compiles Redis 7.0.15 to .redis-install/ directory

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

REDIS_VERSION="7.0.15"
REDIS_INSTALL_DIR="$PROJECT_ROOT/.redis-install"
REDIS_DIR="$REDIS_INSTALL_DIR/redis-$REDIS_VERSION"

# Check if Redis is already installed locally
if [ -f "$REDIS_DIR/src/redis-server" ]; then
    echo -e "${GREEN}Redis $REDIS_VERSION is already installed at $REDIS_DIR${NC}"
    exit 0
fi

# Check if system Redis is available
if command -v redis-server &> /dev/null; then
    SYSTEM_REDIS_VERSION=$(redis-server --version | grep -oP 'v=\K[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    echo -e "${BLUE}System Redis found (version $SYSTEM_REDIS_VERSION)${NC}"
    echo "You can use the system Redis instead of installing locally."
    echo "To install locally anyway, remove the system Redis from PATH and re-run."
    echo ""
    echo "To use system Redis:"
    echo "  npm run redis-restart"
    echo ""
    exit 0
fi

echo -e "${BLUE}"
echo "================================================================"
echo "         INSTALLING REDIS $REDIS_VERSION LOCALLY"
echo "================================================================"
echo -e "${NC}"

# Check for required build tools
echo -e "${BLUE}Checking build dependencies...${NC}"
MISSING_DEPS=""

if ! command -v make &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS make"
fi

if ! command -v gcc &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS gcc"
fi

if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS curl/wget"
fi

if [ -n "$MISSING_DEPS" ]; then
    echo -e "${RED}Error: Missing build tools:$MISSING_DEPS${NC}"
    echo ""
    echo "Please install the required dependencies:"
    echo ""
    echo "  Ubuntu/Debian:"
    echo "    sudo apt-get update && sudo apt-get install -y build-essential curl"
    echo ""
    echo "  macOS:"
    echo "    xcode-select --install"
    echo ""
    echo "  Fedora/RHEL:"
    echo "    sudo dnf install -y make gcc curl"
    echo ""
    exit 1
fi

echo -e "  ${GREEN}Build tools available${NC}"

# Create install directory
mkdir -p "$REDIS_INSTALL_DIR"
cd "$REDIS_INSTALL_DIR"

# Download Redis
REDIS_TARBALL="redis-$REDIS_VERSION.tar.gz"
REDIS_URL="https://download.redis.io/releases/$REDIS_TARBALL"

echo -e "${BLUE}Downloading Redis $REDIS_VERSION...${NC}"
if command -v curl &> /dev/null; then
    curl -fsSL -o "$REDIS_TARBALL" "$REDIS_URL"
elif command -v wget &> /dev/null; then
    wget -q -O "$REDIS_TARBALL" "$REDIS_URL"
fi

if [ ! -f "$REDIS_TARBALL" ]; then
    echo -e "${RED}Error: Failed to download Redis${NC}"
    exit 1
fi

echo -e "  ${GREEN}Downloaded successfully${NC}"

# Extract
echo -e "${BLUE}Extracting...${NC}"
tar -xzf "$REDIS_TARBALL"
rm "$REDIS_TARBALL"

if [ ! -d "$REDIS_DIR" ]; then
    echo -e "${RED}Error: Extraction failed${NC}"
    exit 1
fi

echo -e "  ${GREEN}Extracted successfully${NC}"

# Compile
echo -e "${BLUE}Compiling Redis (this may take a few minutes)...${NC}"
cd "$REDIS_DIR"

# Use parallel build if possible
MAKE_JOBS=""
if command -v nproc &> /dev/null; then
    MAKE_JOBS="-j$(nproc)"
elif command -v sysctl &> /dev/null; then
    CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo "2")
    MAKE_JOBS="-j$CORES"
fi

if make $MAKE_JOBS > "$REDIS_INSTALL_DIR/build.log" 2>&1; then
    echo -e "  ${GREEN}Compilation successful${NC}"
else
    echo -e "${RED}Error: Compilation failed${NC}"
    echo "See build log at: $REDIS_INSTALL_DIR/build.log"
    exit 1
fi

# Verify binaries exist
if [ ! -f "$REDIS_DIR/src/redis-server" ] || [ ! -f "$REDIS_DIR/src/redis-cli" ]; then
    echo -e "${RED}Error: Redis binaries not found after build${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}         REDIS $REDIS_VERSION INSTALLED SUCCESSFULLY${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo "Redis installed to: $REDIS_DIR"
echo ""
echo "Binaries:"
echo "  redis-server: $REDIS_DIR/src/redis-server"
echo "  redis-cli:    $REDIS_DIR/src/redis-cli"
echo ""
echo "The bootstrap script will automatically use this installation."
echo ""
