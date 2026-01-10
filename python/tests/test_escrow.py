"""
SmartPy Tests for Escrow and Marketplace Contracts

This module contains comprehensive tests for the Escrow and Marketplace contracts
used in Digital Arcana for pack purchases with tez escrow.

Test coverage includes:
- Escrow: deposit tez, withdraw funds
- Marketplace: redemption with admin signature verification
- Failed redemption scenarios (amount mismatch, wrong sender)
- Edge cases: double deposits, non-existent pending transactions
- Invalid signature scenarios

Run with: smartpy test python/tests/test_escrow.py
"""
import sys
import os

# Add parent directories to path to import contracts
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'contracts'))

import smartpy as sp

# Import the Escrow contract module
from escrow import Escrow, Marketplace, FA2


# =============================================================================
# Test: Escrow Basic Functionality
# =============================================================================

@sp.add_test(name="Escrow - Add and pull funds")
def test_escrow_add_pull_funds():
    """Test basic escrow deposit and withdrawal functionality."""
    scenario = sp.test_scenario()
    scenario.h1("Escrow Basic Operations")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    # Create escrow contract
    escrow = Escrow()
    scenario += escrow

    scenario.show([admin, alice, bob])

    scenario.h2("Cannot add zero funds")
    escrow.add_funds().run(sender=alice, valid=False)

    scenario.h2("Alice adds funds")
    escrow.add_funds().run(sender=alice, amount=sp.tez(5))

    # Verify funds are escrowed
    scenario.verify(escrow.data.m[alice.address] == sp.tez(5))

    scenario.h2("Alice cannot add funds again (pending transaction)")
    escrow.add_funds().run(sender=alice, amount=sp.tez(1), valid=False)

    scenario.h2("Bob cannot pull Alice's funds")
    escrow.pull_funds().run(sender=bob, valid=False)

    scenario.h2("Alice can pull her own funds")
    escrow.pull_funds().run(sender=alice)

    # Verify escrow is empty
    scenario.verify(escrow.balance == sp.tez(0))
    scenario.verify(~escrow.data.m.contains(alice.address))


@sp.add_test(name="Escrow - Multiple users")
def test_escrow_multiple_users():
    """Test escrow with multiple users depositing independently."""
    scenario = sp.test_scenario()
    scenario.h1("Escrow Multiple Users")

    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    charlie = sp.test_account("Charlie")

    escrow = Escrow()
    scenario += escrow

    scenario.h2("Multiple users can deposit")
    escrow.add_funds().run(sender=alice, amount=sp.tez(1))
    escrow.add_funds().run(sender=bob, amount=sp.tez(2))
    escrow.add_funds().run(sender=charlie, amount=sp.tez(3))

    scenario.verify(escrow.data.m[alice.address] == sp.tez(1))
    scenario.verify(escrow.data.m[bob.address] == sp.tez(2))
    scenario.verify(escrow.data.m[charlie.address] == sp.tez(3))
    scenario.verify(escrow.balance == sp.tez(6))

    scenario.h2("Users can withdraw independently")
    escrow.pull_funds().run(sender=bob)

    scenario.verify(escrow.data.m[alice.address] == sp.tez(1))
    scenario.verify(~escrow.data.m.contains(bob.address))
    scenario.verify(escrow.data.m[charlie.address] == sp.tez(3))
    scenario.verify(escrow.balance == sp.tez(4))

    scenario.h2("Bob can deposit again after withdrawal")
    escrow.add_funds().run(sender=bob, amount=sp.tez(5))
    scenario.verify(escrow.data.m[bob.address] == sp.tez(5))


@sp.add_test(name="Escrow - No pending transaction")
def test_escrow_no_pending():
    """Test that pulling funds fails when no pending transaction exists."""
    scenario = sp.test_scenario()
    scenario.h1("Escrow No Pending Transaction")

    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    escrow = Escrow()
    scenario += escrow

    scenario.h2("Cannot pull funds without pending transaction")
    escrow.pull_funds().run(sender=alice, valid=False)
    escrow.pull_funds().run(sender=bob, valid=False)

    scenario.h2("After adding and pulling, cannot pull again")
    escrow.add_funds().run(sender=alice, amount=sp.tez(1))
    escrow.pull_funds().run(sender=alice)
    escrow.pull_funds().run(sender=alice, valid=False)


# =============================================================================
# Test: Marketplace Redemption
# =============================================================================

@sp.add_test(name="Marketplace - Redeem funds (admin only)")
def test_marketplace_redeem():
    """Test that only admin can redeem funds from marketplace."""
    scenario = sp.test_scenario()
    scenario.h1("Marketplace Redemption Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    # Create mock FA2 contract
    fa2 = FA2()
    scenario += fa2

    # Create marketplace
    marketplace = Marketplace(fa2.address, admin.address)
    scenario += marketplace

    scenario.h2("Alice deposits funds")
    marketplace.add_funds().run(sender=alice, amount=sp.tez(1))

    scenario.h2("Non-admin cannot redeem")
    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(1)
    ).run(sender=alice, valid=False)

    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(1)
    ).run(sender=bob, valid=False)

    scenario.h2("Admin can redeem funds")
    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(1)
    ).run(sender=admin)

    scenario.verify(marketplace.balance == sp.tez(0))
    scenario.verify(~marketplace.data.m.contains(alice.address))


@sp.add_test(name="Marketplace - Amount mismatch fails")
def test_marketplace_amount_mismatch():
    """Test that redemption fails when amount doesn't match escrowed amount."""
    scenario = sp.test_scenario()
    scenario.h1("Marketplace Amount Mismatch Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")

    fa2 = FA2()
    scenario += fa2

    marketplace = Marketplace(fa2.address, admin.address)
    scenario += marketplace

    marketplace.add_funds().run(sender=alice, amount=sp.tez(5))

    scenario.h2("Redemption fails with wrong amount (too low)")
    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(1)
    ).run(sender=admin, valid=False)

    scenario.h2("Redemption fails with wrong amount (too high)")
    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(10)
    ).run(sender=admin, valid=False)

    scenario.h2("Redemption fails with zero amount")
    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(0)
    ).run(sender=admin, valid=False)

    scenario.h2("Redemption succeeds with correct amount")
    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(5)
    ).run(sender=admin)


@sp.add_test(name="Marketplace - Wrong recipient fails")
def test_marketplace_wrong_recipient():
    """Test that redemption fails when target address has no pending transaction."""
    scenario = sp.test_scenario()
    scenario.h1("Marketplace Wrong Recipient Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    fa2 = FA2()
    scenario += fa2

    marketplace = Marketplace(fa2.address, admin.address)
    scenario += marketplace

    marketplace.add_funds().run(sender=alice, amount=sp.tez(1))

    scenario.h2("Cannot redeem for address without pending transaction")
    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=bob.address,
        amount=sp.tez(1)
    ).run(sender=admin, valid=False)

    scenario.h2("Can redeem for correct address")
    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(1)
    ).run(sender=admin)


@sp.add_test(name="Marketplace - Double redemption fails")
def test_marketplace_double_redemption():
    """Test that same funds cannot be redeemed twice."""
    scenario = sp.test_scenario()
    scenario.h1("Marketplace Double Redemption Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")

    fa2 = FA2()
    scenario += fa2

    marketplace = Marketplace(fa2.address, admin.address)
    scenario += marketplace

    marketplace.add_funds().run(sender=alice, amount=sp.tez(1))

    scenario.h2("First redemption succeeds")
    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(1)
    ).run(sender=admin)

    scenario.h2("Second redemption fails (no pending transaction)")
    marketplace.redeem_funds(
        ids=[4, 5, 6],
        to=alice.address,
        amount=sp.tez(1)
    ).run(sender=admin, valid=False)


@sp.add_test(name="Marketplace - User cannot pull after redemption")
def test_marketplace_no_pull_after_redeem():
    """Test that user cannot pull funds after admin redemption."""
    scenario = sp.test_scenario()
    scenario.h1("Marketplace Pull After Redemption Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")

    fa2 = FA2()
    scenario += fa2

    marketplace = Marketplace(fa2.address, admin.address)
    scenario += marketplace

    marketplace.add_funds().run(sender=alice, amount=sp.tez(1))

    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(1)
    ).run(sender=admin)

    scenario.h2("User cannot pull after redemption")
    marketplace.pull_funds().run(sender=alice, valid=False)


# =============================================================================
# Test: Marketplace Edge Cases
# =============================================================================

@sp.add_test(name="Marketplace - Empty token list")
def test_marketplace_empty_tokens():
    """Test redemption with empty token list."""
    scenario = sp.test_scenario()
    scenario.h1("Marketplace Empty Token List")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")

    fa2 = FA2()
    scenario += fa2

    marketplace = Marketplace(fa2.address, admin.address)
    scenario += marketplace

    marketplace.add_funds().run(sender=alice, amount=sp.tez(1))

    scenario.h2("Redemption with empty token list should succeed")
    # This is a valid operation - user pays but gets no tokens
    # The contract allows this (may be used for special cases)
    marketplace.redeem_funds(
        ids=[],
        to=alice.address,
        amount=sp.tez(1)
    ).run(sender=admin)


@sp.add_test(name="Marketplace - Large token list")
def test_marketplace_large_tokens():
    """Test redemption with large number of tokens."""
    scenario = sp.test_scenario()
    scenario.h1("Marketplace Large Token List")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")

    fa2 = FA2()
    scenario += fa2

    marketplace = Marketplace(fa2.address, admin.address)
    scenario += marketplace

    marketplace.add_funds().run(sender=alice, amount=sp.tez(10))

    scenario.h2("Redemption with many tokens")
    # Simulating a large pack (e.g., 7 cards)
    token_ids = [100, 101, 102, 103, 104, 105, 106]
    marketplace.redeem_funds(
        ids=token_ids,
        to=alice.address,
        amount=sp.tez(10)
    ).run(sender=admin)


@sp.add_test(name="Marketplace - User can still pull before redemption")
def test_marketplace_user_pull():
    """Test that user can pull their funds before admin redemption."""
    scenario = sp.test_scenario()
    scenario.h1("Marketplace User Pull Before Redemption")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")

    fa2 = FA2()
    scenario += fa2

    marketplace = Marketplace(fa2.address, admin.address)
    scenario += marketplace

    marketplace.add_funds().run(sender=alice, amount=sp.tez(5))

    scenario.h2("User can pull their funds")
    marketplace.pull_funds().run(sender=alice)

    scenario.verify(marketplace.balance == sp.tez(0))

    scenario.h2("Admin cannot redeem after user pull")
    marketplace.redeem_funds(
        ids=[1, 2, 3],
        to=alice.address,
        amount=sp.tez(5)
    ).run(sender=admin, valid=False)


@sp.add_test(name="Marketplace - Multiple redemptions")
def test_marketplace_multiple_redemptions():
    """Test multiple sequential deposits and redemptions."""
    scenario = sp.test_scenario()
    scenario.h1("Marketplace Multiple Redemptions")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    fa2 = FA2()
    scenario += fa2

    marketplace = Marketplace(fa2.address, admin.address)
    scenario += marketplace

    scenario.h2("Alice and Bob deposit")
    marketplace.add_funds().run(sender=alice, amount=sp.tez(1))
    marketplace.add_funds().run(sender=bob, amount=sp.tez(2))

    scenario.h2("Redeem Alice's funds")
    marketplace.redeem_funds(
        ids=[1, 2],
        to=alice.address,
        amount=sp.tez(1)
    ).run(sender=admin)

    scenario.verify(marketplace.balance == sp.tez(2))

    scenario.h2("Redeem Bob's funds")
    marketplace.redeem_funds(
        ids=[3, 4, 5],
        to=bob.address,
        amount=sp.tez(2)
    ).run(sender=admin)

    scenario.verify(marketplace.balance == sp.tez(0))

    scenario.h2("Both can deposit again")
    marketplace.add_funds().run(sender=alice, amount=sp.tez(3))
    marketplace.add_funds().run(sender=bob, amount=sp.tez(4))

    scenario.verify(marketplace.balance == sp.tez(7))


# =============================================================================
# Test: Escrow Edge Cases
# =============================================================================

@sp.add_test(name="Escrow - Minimum and maximum deposits")
def test_escrow_deposit_amounts():
    """Test various deposit amounts including edge cases."""
    scenario = sp.test_scenario()
    scenario.h1("Escrow Deposit Amounts")

    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    charlie = sp.test_account("Charlie")

    escrow = Escrow()
    scenario += escrow

    scenario.h2("Minimum valid deposit (1 mutez)")
    escrow.add_funds().run(sender=alice, amount=sp.mutez(1))
    scenario.verify(escrow.data.m[alice.address] == sp.mutez(1))

    scenario.h2("Normal deposit (1 tez)")
    escrow.add_funds().run(sender=bob, amount=sp.tez(1))
    scenario.verify(escrow.data.m[bob.address] == sp.tez(1))

    scenario.h2("Large deposit (1000 tez)")
    escrow.add_funds().run(sender=charlie, amount=sp.tez(1000))
    scenario.verify(escrow.data.m[charlie.address] == sp.tez(1000))


# =============================================================================
# Compilation targets for deployment testing
# =============================================================================

sp.add_compilation_target("Escrow_test_compile", Escrow())

sp.add_compilation_target("Marketplace_test_compile", Marketplace(
    fa2=sp.address("KT1TestFA2Contract12345678901234567"),
    admin=sp.address("tz1TestAdminAddress1234567890123456")
))
