# SmartPy Contract Tests

This directory contains automated tests for the Digital Arcana SmartPy smart contracts.

## Prerequisites

### Install SmartPy

**Option 1: pip (recommended)**
```bash
# Create virtual environment (optional but recommended)
python -m venv smartpy-env
source smartpy-env/bin/activate

# Install SmartPy
pip install smartpy-tezos
```

**Option 2: Legacy CLI**
```bash
sh <(curl -s https://legacy.smartpy.io/cli/install.sh)
```

### System Requirements
- Python 3.8+
- Linux or macOS (Intel Macs require Docker)

## Running Tests

### Run All Tests
```bash
# Using npm script
npm run test:contracts

# Or directly
./python/tests/run_tests.sh
```

### Run Specific Test File
```bash
./python/tests/run_tests.sh test_fa2.py
./python/tests/run_tests.sh test_escrow.py
```

### Direct SmartPy Command
```bash
smartpy test python/tests/test_fa2.py python/tests/output/fa2 --html
smartpy test python/tests/test_escrow.py python/tests/output/escrow --html
```

## Test Files

### test_fa2.py
Tests for the FA2 NFT token contract:
- Token minting (admin only)
- Token transfers (owner, operator, admin)
- Balance queries
- Operator approval and removal
- Batch transfers
- Admin functions (set_administrator, pause)
- Edge cases (insufficient balance, undefined tokens)

### test_escrow.py
Tests for the Escrow and Marketplace contracts:
- Escrow deposit and withdrawal
- Marketplace redemption (admin only)
- Amount mismatch validation
- Wrong recipient handling
- Double redemption prevention
- Edge cases (empty tokens, multiple users)

## Test Output

Test results are saved to `python/tests/output/` with HTML reports for visual inspection.

## Writing New Tests

Tests use SmartPy's scenario-based testing framework:

```python
import smartpy as sp

@sp.add_test(name="Test name")
def test_example():
    scenario = sp.test_scenario()
    scenario.h1("Test Title")

    # Setup accounts
    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")

    # Create contract
    contract = MyContract(admin.address)
    scenario += contract

    # Test operations
    contract.my_entry_point(param=value).run(sender=alice)

    # Verify expected state
    scenario.verify(contract.data.some_field == expected_value)

    # Test failure cases
    contract.should_fail(param=value).run(sender=alice, valid=False)
```

## Troubleshooting

### SmartPy not found
Ensure SmartPy is installed and in your PATH:
```bash
which smartpy  # pip installation
which SmartPy.sh  # legacy CLI
```

### Import errors
The test files add the contracts directory to sys.path. If you move files, update the path in the test file headers.

### Test failures
Check the HTML output in `python/tests/output/` for detailed error messages and scenario visualizations.
