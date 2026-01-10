"""
SmartPy Tests for FA2 NFT Token Contract

This module contains comprehensive tests for the FA2 NFT token contract
used in Digital Arcana for representing cards as NFTs on the Tezos blockchain.

Test coverage includes:
- Token minting (admin only)
- Token transfers (owner, operator, admin)
- Balance queries
- Operator approval and removal
- Edge cases and error scenarios

Run with: smartpy test python/tests/test_fa2.py
"""
import sys
import os

# Add parent directories to path to import contracts
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'contracts'))

import smartpy as sp

# Import the FA2 contract module
from fa2 import FA2, FA2_config, FA2_token_metadata, View_consumer, Balance_of


def make_test_metadata(name="Test Token", decimals=0, symbol="TST"):
    """Helper function to create token metadata for testing."""
    return FA2_token_metadata.make_metadata(
        name=name,
        decimals=decimals,
        symbol=symbol
    )


# =============================================================================
# Test: Minting Tokens
# =============================================================================

@sp.add_test(name="FA2 - Mint tokens (admin only)")
def test_mint_tokens():
    """Test that only admin can mint tokens and minting works correctly."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Minting Tests")

    # Setup accounts
    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    # Create NFT contract
    config = FA2_config(non_fungible=True, debug_mode=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    scenario.h2("Admin mints token 0 to Alice")
    tok0_md = make_test_metadata(name="Card #0", symbol="CARD0")
    contract.mint(
        address=alice.address,
        amount=1,
        metadata=tok0_md,
        token_id=0
    ).run(sender=admin)

    # Verify Alice has the token
    scenario.verify(
        contract.data.ledger[contract.ledger_key.make(alice.address, 0)].balance == 1
    )
    scenario.verify(contract.data.all_tokens == 1)

    scenario.h2("Admin mints token 1 to Bob")
    tok1_md = make_test_metadata(name="Card #1", symbol="CARD1")
    contract.mint(
        address=bob.address,
        amount=1,
        metadata=tok1_md,
        token_id=1
    ).run(sender=admin)

    scenario.verify(
        contract.data.ledger[contract.ledger_key.make(bob.address, 1)].balance == 1
    )
    scenario.verify(contract.data.all_tokens == 2)

    scenario.h2("Non-admin cannot mint tokens")
    tok2_md = make_test_metadata(name="Card #2", symbol="CARD2")
    contract.mint(
        address=alice.address,
        amount=1,
        metadata=tok2_md,
        token_id=2
    ).run(sender=alice, valid=False)

    contract.mint(
        address=bob.address,
        amount=1,
        metadata=tok2_md,
        token_id=2
    ).run(sender=bob, valid=False)

    scenario.h2("Cannot mint same NFT token twice")
    contract.mint(
        address=bob.address,
        amount=1,
        metadata=tok0_md,
        token_id=0
    ).run(sender=admin, valid=False)


@sp.add_test(name="FA2 - NFT amount must be 1")
def test_nft_amount_validation():
    """Test that NFT tokens must have amount of 1."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 NFT Amount Validation")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")

    config = FA2_config(non_fungible=True, debug_mode=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    scenario.h2("Cannot mint NFT with amount != 1")
    tok_md = make_test_metadata()
    contract.mint(
        address=alice.address,
        amount=5,
        metadata=tok_md,
        token_id=0
    ).run(sender=admin, valid=False)


# =============================================================================
# Test: Token Transfers
# =============================================================================

@sp.add_test(name="FA2 - Transfer tokens")
def test_transfer_tokens():
    """Test token transfer functionality including owner and admin transfers."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Transfer Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    config = FA2_config(non_fungible=True, debug_mode=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    # Mint tokens
    tok0_md = make_test_metadata(name="Card #0")
    contract.mint(address=alice.address, amount=1, metadata=tok0_md, token_id=0).run(sender=admin)

    tok1_md = make_test_metadata(name="Card #1")
    contract.mint(address=alice.address, amount=1, metadata=tok1_md, token_id=1).run(sender=admin)

    scenario.h2("Owner can transfer their own tokens")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=0)]
        )
    ]).run(sender=alice)

    # Verify transfer
    scenario.verify(
        contract.data.ledger[contract.ledger_key.make(bob.address, 0)].balance == 1
    )
    scenario.verify(
        contract.data.ledger[contract.ledger_key.make(alice.address, 0)].balance == 0
    )

    scenario.h2("Admin can transfer anyone's tokens")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=1)]
        )
    ]).run(sender=admin)

    scenario.verify(
        contract.data.ledger[contract.ledger_key.make(bob.address, 1)].balance == 1
    )

    scenario.h2("Non-owner/non-operator cannot transfer tokens")
    contract.transfer([
        contract.batch_transfer.item(
            from_=bob.address,
            txs=[sp.record(to_=alice.address, amount=1, token_id=0)]
        )
    ]).run(sender=alice, valid=False)


@sp.add_test(name="FA2 - Insufficient balance transfer fails")
def test_insufficient_balance():
    """Test that transfers fail when sender has insufficient balance."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Insufficient Balance Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    config = FA2_config(non_fungible=True, debug_mode=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    tok_md = make_test_metadata()
    contract.mint(address=alice.address, amount=1, metadata=tok_md, token_id=0).run(sender=admin)

    scenario.h2("Cannot transfer more than balance")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=2, token_id=0)]
        )
    ]).run(sender=alice, valid=False)

    scenario.h2("Cannot transfer token not owned")
    contract.transfer([
        contract.batch_transfer.item(
            from_=bob.address,
            txs=[sp.record(to_=alice.address, amount=1, token_id=0)]
        )
    ]).run(sender=bob, valid=False)


@sp.add_test(name="FA2 - Undefined token transfer fails")
def test_undefined_token():
    """Test that transfers of undefined tokens fail."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Undefined Token Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    config = FA2_config(non_fungible=True, debug_mode=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    tok_md = make_test_metadata()
    contract.mint(address=alice.address, amount=1, metadata=tok_md, token_id=0).run(sender=admin)

    scenario.h2("Cannot transfer token that does not exist")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=999)]
        )
    ]).run(sender=alice, valid=False)


# =============================================================================
# Test: Balance Queries
# =============================================================================

@sp.add_test(name="FA2 - Balance queries")
def test_balance_queries():
    """Test balance_of entry point for querying token balances."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Balance Query Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    config = FA2_config(non_fungible=True, debug_mode=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    # Create consumer contract to receive balance results
    consumer = View_consumer(contract)
    scenario += consumer

    # Mint tokens
    tok0_md = make_test_metadata(name="Card #0")
    contract.mint(address=alice.address, amount=1, metadata=tok0_md, token_id=0).run(sender=admin)

    tok1_md = make_test_metadata(name="Card #1")
    contract.mint(address=alice.address, amount=1, metadata=tok1_md, token_id=1).run(sender=admin)

    tok2_md = make_test_metadata(name="Card #2")
    contract.mint(address=bob.address, amount=1, metadata=tok2_md, token_id=2).run(sender=admin)

    scenario.h2("Query Alice's balance (should be 2)")
    def arguments_for_balance_of(receiver, reqs):
        return sp.record(
            callback=sp.contract(
                Balance_of.response_type(),
                receiver.address,
                entry_point="receive_balances"
            ).open_some(),
            requests=reqs
        )

    contract.balance_of(arguments_for_balance_of(consumer, [
        sp.record(owner=alice.address, token_id=0),
        sp.record(owner=alice.address, token_id=1),
    ]))
    scenario.verify(consumer.data.last_sum == 2)

    scenario.h2("Query Bob's balance (should be 1)")
    consumer.reinit()
    contract.balance_of(arguments_for_balance_of(consumer, [
        sp.record(owner=bob.address, token_id=2),
    ]))
    scenario.verify(consumer.data.last_sum == 1)

    scenario.h2("Query non-existent balance (should be 0)")
    consumer.reinit()
    contract.balance_of(arguments_for_balance_of(consumer, [
        sp.record(owner=bob.address, token_id=0),
    ]))
    scenario.verify(consumer.data.last_sum == 0)


# =============================================================================
# Test: Operator Approval
# =============================================================================

@sp.add_test(name="FA2 - Operator approval")
def test_operator_approval():
    """Test operator approval and removal functionality."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Operator Approval Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    operator = sp.test_account("Operator")

    config = FA2_config(non_fungible=True, debug_mode=True, support_operator=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    # Mint tokens to Alice
    tok0_md = make_test_metadata(name="Card #0")
    contract.mint(address=alice.address, amount=1, metadata=tok0_md, token_id=0).run(sender=admin)

    tok1_md = make_test_metadata(name="Card #1")
    contract.mint(address=alice.address, amount=1, metadata=tok1_md, token_id=1).run(sender=admin)

    scenario.h2("Operator cannot transfer without approval")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=0)]
        )
    ]).run(sender=operator, valid=False)

    scenario.h2("Owner can add operator")
    contract.update_operators([
        sp.variant("add_operator", contract.operator_param.make(
            owner=alice.address,
            operator=operator.address,
            token_id=0
        ))
    ]).run(sender=alice)

    scenario.h2("Operator can now transfer approved token")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=0)]
        )
    ]).run(sender=operator)

    scenario.verify(
        contract.data.ledger[contract.ledger_key.make(bob.address, 0)].balance == 1
    )

    scenario.h2("Operator cannot transfer non-approved token")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=1)]
        )
    ]).run(sender=operator, valid=False)

    scenario.h2("Admin can add operator for any owner")
    contract.update_operators([
        sp.variant("add_operator", contract.operator_param.make(
            owner=alice.address,
            operator=operator.address,
            token_id=1
        ))
    ]).run(sender=admin)

    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=1)]
        )
    ]).run(sender=operator)

    scenario.verify(
        contract.data.ledger[contract.ledger_key.make(bob.address, 1)].balance == 1
    )


@sp.add_test(name="FA2 - Operator removal")
def test_operator_removal():
    """Test that owners can remove operator permissions."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Operator Removal Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    operator = sp.test_account("Operator")

    config = FA2_config(non_fungible=True, debug_mode=True, support_operator=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    # Mint tokens to Alice
    tok0_md = make_test_metadata(name="Card #0")
    contract.mint(address=alice.address, amount=1, metadata=tok0_md, token_id=0).run(sender=admin)

    tok1_md = make_test_metadata(name="Card #1")
    contract.mint(address=alice.address, amount=1, metadata=tok1_md, token_id=1).run(sender=admin)

    # Add operator
    contract.update_operators([
        sp.variant("add_operator", contract.operator_param.make(
            owner=alice.address,
            operator=operator.address,
            token_id=0
        )),
        sp.variant("add_operator", contract.operator_param.make(
            owner=alice.address,
            operator=operator.address,
            token_id=1
        ))
    ]).run(sender=alice)

    scenario.h2("Owner can remove operator")
    contract.update_operators([
        sp.variant("remove_operator", contract.operator_param.make(
            owner=alice.address,
            operator=operator.address,
            token_id=0
        ))
    ]).run(sender=alice)

    scenario.h2("Removed operator cannot transfer")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=0)]
        )
    ]).run(sender=operator, valid=False)

    scenario.h2("Operator can still transfer non-removed token")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=1)]
        )
    ]).run(sender=operator)


@sp.add_test(name="FA2 - Non-owner cannot add/remove operators")
def test_operator_permission_restrictions():
    """Test that only owner/admin can modify operators."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Operator Permission Restrictions")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    operator = sp.test_account("Operator")

    config = FA2_config(non_fungible=True, debug_mode=True, support_operator=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    tok_md = make_test_metadata()
    contract.mint(address=alice.address, amount=1, metadata=tok_md, token_id=0).run(sender=admin)

    scenario.h2("Bob cannot add operator for Alice's token")
    contract.update_operators([
        sp.variant("add_operator", contract.operator_param.make(
            owner=alice.address,
            operator=operator.address,
            token_id=0
        ))
    ]).run(sender=bob, valid=False)

    # First add operator legitimately
    contract.update_operators([
        sp.variant("add_operator", contract.operator_param.make(
            owner=alice.address,
            operator=operator.address,
            token_id=0
        ))
    ]).run(sender=alice)

    scenario.h2("Bob cannot remove operator for Alice's token")
    contract.update_operators([
        sp.variant("remove_operator", contract.operator_param.make(
            owner=alice.address,
            operator=operator.address,
            token_id=0
        ))
    ]).run(sender=bob, valid=False)


# =============================================================================
# Test: Admin Functions
# =============================================================================

@sp.add_test(name="FA2 - Admin transfer and set_administrator")
def test_admin_functions():
    """Test admin-specific functions."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Admin Functions Tests")

    admin = sp.test_account("Administrator")
    new_admin = sp.test_account("NewAdmin")
    alice = sp.test_account("Alice")

    config = FA2_config(non_fungible=True, debug_mode=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    scenario.h2("Non-admin cannot set administrator")
    contract.set_administrator(new_admin.address).run(sender=alice, valid=False)

    scenario.h2("Admin can set new administrator")
    contract.set_administrator(new_admin.address).run(sender=admin)

    scenario.verify(contract.data.administrator == new_admin.address)

    scenario.h2("Old admin can no longer mint")
    tok_md = make_test_metadata()
    contract.mint(address=alice.address, amount=1, metadata=tok_md, token_id=0).run(sender=admin, valid=False)

    scenario.h2("New admin can mint")
    contract.mint(address=alice.address, amount=1, metadata=tok_md, token_id=0).run(sender=new_admin)


@sp.add_test(name="FA2 - Pause functionality")
def test_pause_functionality():
    """Test contract pause/unpause functionality."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Pause Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")

    config = FA2_config(non_fungible=True, debug_mode=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    tok_md = make_test_metadata()
    contract.mint(address=alice.address, amount=1, metadata=tok_md, token_id=0).run(sender=admin)

    scenario.h2("Non-admin cannot pause")
    contract.set_pause(True).run(sender=alice, valid=False)

    scenario.h2("Admin can pause contract")
    contract.set_pause(True).run(sender=admin)

    scenario.h2("Transfers fail when paused")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=0)]
        )
    ]).run(sender=alice, valid=False)

    scenario.h2("Admin can unpause")
    contract.set_pause(False).run(sender=admin)

    scenario.h2("Transfers work after unpause")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[sp.record(to_=bob.address, amount=1, token_id=0)]
        )
    ]).run(sender=alice)


# =============================================================================
# Test: Batch Operations
# =============================================================================

@sp.add_test(name="FA2 - Batch transfers")
def test_batch_transfers():
    """Test batch transfer functionality."""
    scenario = sp.test_scenario()
    scenario.h1("FA2 Batch Transfer Tests")

    admin = sp.test_account("Administrator")
    alice = sp.test_account("Alice")
    bob = sp.test_account("Bob")
    charlie = sp.test_account("Charlie")

    config = FA2_config(non_fungible=True, debug_mode=True)
    contract = FA2(
        config=config,
        metadata=sp.utils.metadata_of_url("https://example.com"),
        admin=admin.address
    )
    scenario += contract

    # Mint multiple tokens to Alice
    for i in range(5):
        tok_md = make_test_metadata(name=f"Card #{i}", symbol=f"CARD{i}")
        contract.mint(address=alice.address, amount=1, metadata=tok_md, token_id=i).run(sender=admin)

    scenario.h2("Batch transfer multiple tokens to different recipients")
    contract.transfer([
        contract.batch_transfer.item(
            from_=alice.address,
            txs=[
                sp.record(to_=bob.address, amount=1, token_id=0),
                sp.record(to_=bob.address, amount=1, token_id=1),
                sp.record(to_=charlie.address, amount=1, token_id=2),
            ]
        )
    ]).run(sender=alice)

    scenario.verify(contract.data.ledger[contract.ledger_key.make(bob.address, 0)].balance == 1)
    scenario.verify(contract.data.ledger[contract.ledger_key.make(bob.address, 1)].balance == 1)
    scenario.verify(contract.data.ledger[contract.ledger_key.make(charlie.address, 2)].balance == 1)
    scenario.verify(contract.data.ledger[contract.ledger_key.make(alice.address, 3)].balance == 1)
    scenario.verify(contract.data.ledger[contract.ledger_key.make(alice.address, 4)].balance == 1)


# Compilation target for testing
sp.add_compilation_target("FA2_test_compile", FA2(
    config=FA2_config(non_fungible=True),
    metadata=sp.utils.metadata_of_url("https://example.com"),
    admin=sp.address("tz1TestAdminAddress1234567890123456")
))
