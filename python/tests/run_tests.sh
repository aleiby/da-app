#!/bin/bash
#
# SmartPy Contract Test Runner
#
# This script runs all SmartPy tests for the Digital Arcana smart contracts.
# It supports both the legacy SmartPy CLI and the newer pip-based installation.
#
# Usage:
#   ./run_tests.sh [test_file]
#
# Examples:
#   ./run_tests.sh              # Run all tests
#   ./run_tests.sh test_fa2.py  # Run only FA2 tests
#   ./run_tests.sh test_escrow.py  # Run only Escrow tests
#
# Prerequisites:
#   - SmartPy installed via pip (pip install smartpy-tezos) or
#   - SmartPy CLI installed (sh <(curl -s https://legacy.smartpy.io/cli/install.sh))

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/../contracts"
OUTPUT_DIR="$SCRIPT_DIR/output"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  SmartPy Contract Test Runner"
echo "========================================"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Detect SmartPy installation
SMARTPY_CMD=""

# Try pip-based smartpy first
if command -v smartpy &> /dev/null; then
    SMARTPY_CMD="smartpy"
    echo -e "${GREEN}Found SmartPy (pip installation)${NC}"
# Try legacy SmartPy CLI
elif [ -f "$HOME/smartpy-cli/SmartPy.sh" ]; then
    SMARTPY_CMD="$HOME/smartpy-cli/SmartPy.sh"
    echo -e "${GREEN}Found SmartPy CLI (legacy installation)${NC}"
# Check for SmartPy in PATH
elif command -v SmartPy.sh &> /dev/null; then
    SMARTPY_CMD="SmartPy.sh"
    echo -e "${GREEN}Found SmartPy CLI in PATH${NC}"
else
    echo -e "${RED}Error: SmartPy not found!${NC}"
    echo ""
    echo "Please install SmartPy using one of these methods:"
    echo ""
    echo "  Option 1 (recommended): pip install smartpy-tezos"
    echo ""
    echo "  Option 2 (legacy): sh <(curl -s https://legacy.smartpy.io/cli/install.sh)"
    echo ""
    exit 1
fi

echo "Using: $SMARTPY_CMD"
echo ""

# Function to run a single test file
run_test() {
    local test_file="$1"
    local test_name=$(basename "$test_file" .py)

    echo "----------------------------------------"
    echo "Running: $test_name"
    echo "----------------------------------------"

    # Run with smartpy test command
    if [[ "$SMARTPY_CMD" == "smartpy" ]]; then
        # Newer pip-based SmartPy
        if $SMARTPY_CMD test "$test_file" "$OUTPUT_DIR/$test_name" --html; then
            echo -e "${GREEN}PASSED: $test_name${NC}"
            return 0
        else
            echo -e "${RED}FAILED: $test_name${NC}"
            return 1
        fi
    else
        # Legacy SmartPy CLI
        if "$SMARTPY_CMD" test "$test_file" "$OUTPUT_DIR/$test_name" --html; then
            echo -e "${GREEN}PASSED: $test_name${NC}"
            return 0
        else
            echo -e "${RED}FAILED: $test_name${NC}"
            return 1
        fi
    fi
}

# Track results
PASSED=0
FAILED=0
TESTS_RUN=0

# Determine which tests to run
if [ -n "$1" ]; then
    # Run specific test
    if [ -f "$SCRIPT_DIR/$1" ]; then
        TEST_FILES=("$SCRIPT_DIR/$1")
    elif [ -f "$1" ]; then
        TEST_FILES=("$1")
    else
        echo -e "${RED}Error: Test file not found: $1${NC}"
        exit 1
    fi
else
    # Run all tests
    TEST_FILES=("$SCRIPT_DIR"/test_*.py)
fi

echo "Tests to run: ${#TEST_FILES[@]}"
echo ""

# Run tests
for test_file in "${TEST_FILES[@]}"; do
    if [ -f "$test_file" ]; then
        TESTS_RUN=$((TESTS_RUN + 1))
        if run_test "$test_file"; then
            PASSED=$((PASSED + 1))
        else
            FAILED=$((FAILED + 1))
        fi
        echo ""
    fi
done

# Summary
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo "  Tests run: $TESTS_RUN"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "  ${RED}Failed: $FAILED${NC}"
fi
echo ""
echo "  Output: $OUTPUT_DIR"
echo "========================================"

# Exit with error if any tests failed
if [ $FAILED -gt 0 ]; then
    exit 1
fi

exit 0
