// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../contracts/TenTen.sol";
import "../contracts/DataTypes.sol";
import { DeployTenTen } from "../script/DeployTenTen.s.sol";

contract TenTenTest is Test {
    uint256 private constant FORK_BLOCK = 5_993_582;

    TenTen private tenten;

    event BetCreated(
        uint256 indexed id, address indexed bettor, uint256 indexed amount, DataTypes.Choice choice, uint256 timestamp
    );

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("sepolia"));

        DeployTenTen deployTenTen = new DeployTenTen();

        tenten = deployTenTen.run();
    }

    function testCreateBetStoresStateAndEmitsEvent() public {
        createBet();
    }

    function testMatchBet() public {
        createBet();

        address challenger = makeAddr("challenger");
        uint256 stake = 1 ether;
        vm.deal(challenger, stake);
        vm.warp(12345678);

        vm.prank(challenger);
        tenten.matchBet{ value: stake }(1);

        DataTypes.Bet memory bet = tenten.getBet(1);
        assertEq(bet.id, 1, "bet id mismatch");
        assertEq(bet.challenger, challenger, "challenger mismatch");
    }

    function createBet() internal {
        address bettor = makeAddr("bettor");
        uint256 stake = 1 ether;
        vm.deal(bettor, stake);
        vm.warp(1234567);

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
}
