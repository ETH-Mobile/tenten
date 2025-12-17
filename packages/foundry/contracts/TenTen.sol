//SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { DataTypes } from "./libraries/DataTypes.sol";
import { PRNG } from "./libraries/PRNG.sol";
import { ITenTen } from "./interfaces/ITenTen.sol";

import { console } from "forge-std/console.sol";

/**
 * @title TenTen
 * @notice A P2P betting game where players bet on random outcomes (Even or Odd)
 * @dev Uses a pseudo-random number generator (PRNG) for randomness.
 */
contract TenTen is ITenTen, Ownable {
    // Protocol fee (2% = 200 basis points)
    uint256 private constant PROTOCOL_FEE = 200;
    uint256 private constant FEE_DENOMINATOR = 10000;

    mapping(uint256 id => DataTypes.Bet bet) private s_bets;

    // Counter for bet IDs
    uint256 public s_betCounter;

    // Total protocol fees collected
    uint256 public s_totalProtocolFees;

    address public s_feeCollector;

    /**
     * @notice Constructor
     * @param _feeCollector The address where collected protocol fees will be sent.
     */
    constructor(address _feeCollector) Ownable(msg.sender) {
        s_feeCollector = _feeCollector;
    }

    /**
     * @notice Create a new bet
     * @param _choice Player's choice (EVEN or ODD)
     * @return id The ID of the created bet
     */
    function createBet(DataTypes.Choice _choice) external payable returns (uint256 id) {
        require(msg.value > 0, TenTen__ZeroAmount());
        require(_choice == DataTypes.Choice.EVEN || _choice == DataTypes.Choice.ODD, TenTen__InvalidChoice());

        id = ++s_betCounter;

        s_bets[id] = DataTypes.Bet({
            id: id,
            bettor: msg.sender,
            challenger: address(0),
            amount: msg.value,
            choice: _choice,
            state: DataTypes.BetState.PENDING,
            winner: address(0),
            timestamp: block.timestamp
        });

        emit BetCreated({ id: id, bettor: msg.sender, amount: msg.value, choice: _choice, timestamp: block.timestamp });
        return id;
    }

    function matchBet(uint256 _id) external payable returns (uint256 randomNumber) {
        DataTypes.Bet memory bet = s_bets[_id];
        require(bet.bettor != address(0), TenTen__BetNotFound());
        require(bet.state == DataTypes.BetState.PENDING, TenTen__BetNotPending());
        require(msg.value == bet.amount, TenTen__AmountMismatch());
        require(bet.challenger == address(0), TenTen__BetAlreadyChallenged());
        require(msg.sender != bet.bettor, TenTen__CannotChallengeOwnBet());

        s_bets[_id].challenger = msg.sender;

        // Resolve the bet immediately using PRNG-based randomness.
        // We keep the `randomNumber` return value for ABI compatibility; it now holds
        // the raw random number used to derive the outcome.
        bytes32 seed = keccak256(abi.encodePacked(_id, bet.bettor, msg.sender, block.timestamp));
        randomNumber = PRNG.randomNumber(seed);

        bool isEven = randomNumber % 2 == 0;
        DataTypes.Choice resultChoice = isEven ? DataTypes.Choice.EVEN : DataTypes.Choice.ODD;

        address winner;
        if (bet.choice == resultChoice) {
            winner = bet.bettor;
        } else {
            winner = msg.sender;
        }

        // Calculate protocol fee and send to fee collector, pay winner
        uint256 protocolFee = (bet.amount * PROTOCOL_FEE) / FEE_DENOMINATOR;
        uint256 payout = (bet.amount * 2) - protocolFee;
        s_totalProtocolFees += protocolFee;

        s_bets[bet.id].winner = winner;

        emit BetResolved(bet.id, resultChoice, block.timestamp);

        (bool success,) = winner.call{ value: payout }("");
        require(success, TenTen__TransferFailed());

        emit BetMatched(_id, msg.sender);
    }

    function cancelBet(uint256 _id) external {
        DataTypes.Bet memory bet = s_bets[_id];

        require(bet.bettor != address(0), TenTen__BetNotFound());
        require(bet.state == DataTypes.BetState.PENDING, TenTen__BetNotPending());
        require(msg.sender == bet.bettor, TenTen__MustBeBettor());

        s_bets[_id].state = DataTypes.BetState.CANCELLED;
        emit BetCancelled(_id);

        (bool success,) = bet.bettor.call{ value: bet.amount }("");
        require(success, TenTen__TransferFailed());
    }

    function setFeeCollector(address _newFeeCollector) external onlyOwner {
        require(_newFeeCollector != address(0), TenTen__ZeroAddress());

        address oldFeeCollector = s_feeCollector;
        s_feeCollector = _newFeeCollector;
        emit FeeCollectorSet(oldFeeCollector, _newFeeCollector);
    }

    /**
     * @notice Withdraw fees (only owner)
     */
    function withdrawFees() external onlyOwner {
        uint256 fees = s_totalProtocolFees;
        require(fees > 0, TenTen__NoFeesToWithdraw());

        s_totalProtocolFees = 0;

        (bool success,) = s_feeCollector.call{ value: fees }("");
        require(success, TenTen__TransferFailed());

        emit FeesWithdrawn(s_feeCollector, fees);
    }

    /**
     * @notice Get bet details
     * @param id The ID of the bet
     * @return The bet struct
     */
    function getBet(uint256 id) external view returns (DataTypes.Bet memory) {
        return s_bets[id];
    }
}
