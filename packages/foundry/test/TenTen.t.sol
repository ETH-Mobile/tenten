// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../contracts/TenTen.sol";
import "../contracts/libraries/DataTypes.sol";
import "../contracts/interfaces/ITenTen.sol";
import { DeployTenTen } from "../script/DeployTenTen.s.sol";

contract TenTenTest is Test {
    uint256 private constant FORK_BLOCK = 5_993_582;

    TenTen private tenten;

    event BetCreated(
        uint256 indexed id, address indexed bettor, uint256 indexed amount, DataTypes.Choice choice, uint256 timestamp
    );

    event BetCancelled(uint256 indexed id);

    function setUp() public {
        // vm.createSelectFork(vm.rpcUrl("sepolia"));

        DeployTenTen deployTenTen = new DeployTenTen();

        tenten = deployTenTen.run();
    }

    function testCreateBetStoresStateAndEmitsEvent() public {
        createBet();
    }

    function testMatchBetSetsChallengerAndResolvesWinnerAndFees() public {
        // Arrange: create initial bet
        (address bettor, uint256 stake) = createBet();

        address challenger = makeAddr("challenger");
        vm.deal(challenger, stake);

        // Track initial balances before the challenger matches the bet
        uint256 bettorStartBalance = bettor.balance;
        uint256 challengerStartBalance = challenger.balance;

        // Fast-forward time for PRNG entropy
        vm.warp(1234567);

        // Act: challenger matches the bet, which also resolves it immediately
        vm.prank(challenger);
        tenten.matchBet{ value: stake }(1);

        // Assert: basic bet data
        DataTypes.Bet memory bet = tenten.getBet(1);
        assertEq(bet.id, 1, "bet id mismatch");
        assertEq(bet.challenger, challenger, "challenger mismatch");
        assertTrue(bet.winner == bettor || bet.winner == challenger, "winner must be either bettor or challenger");

        // Protocol fee and payout expectations (mirrors TenTen.sol logic)
        uint256 protocolFee = (stake * 200) / 10_000;
        uint256 payout = (stake * 2) - protocolFee;

        // Total protocol fees should be updated
        assertEq(tenten.s_totalProtocolFees(), protocolFee, "protocol fee mismatch");

        // Final balances should reflect winner and loser
        uint256 bettorEndBalance = bettor.balance;
        uint256 challengerEndBalance = challenger.balance;

        if (bet.winner == bettor) {
            assertEq(bettorEndBalance, bettorStartBalance + payout, "bettor balance incorrect");
            assertEq(
                challengerEndBalance,
                challengerStartBalance - stake,
                "challenger balance incorrect (should lose full stake)"
            );
        } else {
            assertEq(challengerEndBalance, challengerStartBalance - stake + payout, "challenger balance incorrect");
            assertEq(bettorEndBalance, bettorStartBalance, "bettor balance incorrect (should lose full stake)");
        }
    }

    function createBet() internal returns (address bettor, uint256 stake) {
        bettor = makeAddr("bettor");
        stake = 1 ether;
        vm.deal(bettor, stake);
        vm.warp(12345678);

        vm.expectEmit(true, true, true, true, address(tenten));
        emit BetCreated(1, bettor, stake, DataTypes.Choice.EVEN, block.timestamp);

        vm.prank(bettor);
        tenten.createBet{ value: stake }(DataTypes.Choice.EVEN);

        DataTypes.Bet memory bet = tenten.getBet(1);
        assertEq(bet.id, 1, "bet id mismatch");
        assertEq(bet.bettor, bettor, "bettor mismatch");
        assertEq(bet.amount, stake, "amount mismatch");
        assertEq(uint8(bet.choice), uint8(DataTypes.Choice.EVEN), "choice mismatch");
        assertEq(uint8(bet.state), uint8(DataTypes.BetState.PENDING), "state mismatch");
        assertEq(bet.challenger, address(0), "challenger should be unset");
    }

    function testCancelBetRefundsAndUpdatesState() public {
        (address bettor, uint256 stake) = createBet();

        uint256 bettorStartBalance = bettor.balance;

        vm.expectEmit(true, false, false, false, address(tenten));
        emit BetCancelled(1);

        vm.prank(bettor);
        tenten.cancelBet(1);

        DataTypes.Bet memory bet = tenten.getBet(1);
        assertEq(uint8(bet.state), uint8(DataTypes.BetState.CANCELLED), "bet state should be CANCELLED");

        // Bettor should be refunded their full stake
        assertEq(bettor.balance, bettorStartBalance + stake, "bettor refund incorrect");
    }

    function testMatchBetRevertsForNonexistentBet() public {
        address challenger = makeAddr("challenger");
        vm.deal(challenger, 1 ether);

        vm.prank(challenger);
        vm.expectRevert(ITenTen.TenTen__BetNotFound.selector);
        tenten.matchBet{ value: 1 ether }(1);
    }

    function testMatchBetRevertsWhenChallengerIsBettor() public {
        (address bettor, uint256 stake) = createBet();

        vm.deal(bettor, stake);

        vm.prank(bettor);
        vm.expectRevert(ITenTen.TenTen__CannotChallengeOwnBet.selector);
        tenten.matchBet{ value: stake }(1);
    }

    function testCancelBetRevertsWhenNotBettor() public {
        createBet();

        address attacker = makeAddr("attacker");

        vm.prank(attacker);
        vm.expectRevert(ITenTen.TenTen__MustBeBettor.selector);
        tenten.cancelBet(1);
    }
}
