//SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ConfirmedOwner } from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import { VRFV2WrapperConsumerBase } from "@chainlink/contracts/src/v0.8/vrf/VRFV2WrapperConsumerBase.sol";
import { LinkTokenInterface } from "@chainlink/contracts/src/v0.8/shared/interfaces/LinkTokenInterface.sol";
import { DataTypes } from "./DataTypes.sol";

/**
 * @title TenTen
 * @notice A P2P betting game where players bet on random outcomes (Even or Odd)
 * @dev Uses Chainlink VRF V2 for provably fair random number generation
 */
contract TenTen is ReentrancyGuard, VRFV2WrapperConsumerBase, ConfirmedOwner {
    // chainlink vrf config
    uint32 private constant CALLBACK_GAS_LIMIT = 300_000;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 2;

    LinkTokenInterface private immutable linkToken;

    // Protocol fee (2% = 200 basis points)
    uint256 private constant PROTOCOL_FEE = 200; // 2%
    uint256 private constant FEE_DENOMINATOR = 10000;

    mapping(uint256 id => DataTypes.Bet bet) private s_bets;

    // Mapping from VRF request ID to bet ID
    mapping(uint256 requestId => uint256 betId) private s_requestIdToBetId;

    // Counter for bet IDs
    uint256 public s_betCounter;

    // Total protocol fees collected
    uint256 public s_totalProtocolFees;

    address public s_feeCollector;

    // Events
    event BetCreated(
        uint256 indexed id,
        address indexed bettor,
        uint256 indexed amount,
        DataTypes.Choice choice,
        uint256 timestamp
    );

    event BetChallenged(uint256 indexed id, address indexed challenger);

    event BetResolved(uint256 indexed id, uint256 indexed result, uint256 indexed timestamp);

    event BetCancelled(uint256 indexed id);

    event FeesWithdrawn(address indexed owner, uint256 amount);

    // Errors
    error TenTen__ZeroAmount();
    error TenTen__BetNotFound();
    error TenTen__BetNotPending();
    error TenTen__BetNotActive();
    error TenTen__CannotChallengeOwnBet();
    error TenTen__AmountMismatch();
    error TenTen__InvalidChoice();
    error TenTen__VRFRequestFailed();
    error TenTen__TransferFailed();
    error TenTen__NoFeesToWithdraw();

    /**
     * @notice Constructor
     * @param _linkAddress Address of the Link token
     * @param _wrapperAddress Address of the VRFV2Wrapper
     */
    constructor(
        address _linkAddress,
        address _wrapperAddress
    ) ConfirmedOwner(msg.sender) VRFV2WrapperConsumerBase(_linkAddress, _wrapperAddress) {
        linkToken = LinkTokenInterface(_linkAddress);
    }

    /**
     * @notice Create a new bet
     * @param choice Player's choice (EVEN or ODD)
     * @return id The ID of the created bet
     */
    function createBet(DataTypes.Choice choice) external payable returns (uint256 id) {
        if (msg.value == 0) {
            revert TenTen__ZeroAmount();
        }
        if (choice != DataTypes.Choice.EVEN && choice != DataTypes.Choice.ODD) {
            revert TenTen__InvalidChoice();
        }

        id = ++s_betCounter;

        s_bets[id] = DataTypes.Bet({
            id: id,
            bettor: msg.sender,
            challenger: address(0),
            amount: msg.value,
            choice: choice,
            state: DataTypes.BetState.PENDING,
            winner: address(0),
            timestamp: block.timestamp
        });

        emit BetCreated({ id: id, bettor: msg.sender, amount: msg.value, choice: choice, timestamp: block.timestamp });
        return id;
    }

    /**
     * @notice Challenge an existing bet
     * @param id The ID of the bet to challenge
     * @param choice Player's choice (must be opposite of bettor's choice)
     * @return requestId The Chainlink VRF request ID
     */
    function challengeBet(
        uint256 id,
        DataTypes.Choice choice
    ) external payable nonReentrant returns (uint256 requestId) {
        DataTypes.Bet storage bet = s_bets[id];

        if (bet.bettor == address(0)) {
            revert TenTen__BetNotFound();
        }
        if (bet.state != DataTypes.BetState.PENDING) {
            revert TenTen__BetNotPending();
        }
        if (msg.sender == bet.bettor) {
            revert TenTen__CannotChallengeOwnBet();
        }
        if (msg.value != bet.amount) {
            revert TenTen__AmountMismatch();
        }
        if (choice != DataTypes.Choice.EVEN && choice != DataTypes.Choice.ODD) {
            revert TenTen__InvalidChoice();
        }
        // Ensure challenger chooses the opposite
        if (choice == bet.choice) {
            revert TenTen__InvalidChoice();
        }

        bet.challenger = msg.sender;
        bet.state = DataTypes.BetState.ACTIVE;

        // Request random number from Chainlink VRF
        requestId = i_vrfCoordinator.requestRandomWords(
            i_keyHash,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );

        bet.requestId = requestId;
        s_requestIdToBetId[requestId] = id;

        emit BetChallenged(id, msg.sender);
        return requestId;
    }

    /**
     * @notice Callback function called by Chainlink VRF when random number is ready
     * @param requestId The VRF request ID
     * @param randomWords Array of random words (we only use the first one)
     */
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        if (msg.sender != address(i_vrfCoordinator)) {
            revert TenTen__VRFRequestFailed();
        }
        fulfillRandomWords(requestId, randomWords);
    }

    /**
     * @notice Internal function to process the random words
     * @param requestId The VRF request ID
     * @param randomWords Array of random words (we only use the first one)
     */
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal {
        uint256 id = s_requestIdToBetId[requestId];
        DataTypes.Bet storage bet = s_bets[id];

        if (bet.state != DataTypes.BetState.ACTIVE) {
            return; // Bet already resolved or cancelled
        }

        uint256 randomNumber = randomWords[0];
        bool isEven = (randomNumber % 2 == 0);

        // Determine winner
        address winner;
        if (isEven && bet.choice == DataTypes.Choice.EVEN) {
            winner = bet.bettor;
        } else if (!isEven && bet.choice == DataTypes.Choice.ODD) {
            winner = bet.bettor;
        } else {
            winner = bet.challenger;
        }

        bet.result = isEven ? DataTypes.Choice.EVEN : DataTypes.Choice.ODD;
        bet.state = DataTypes.BetState.RESOLVED;

        // Calculate winnings and protocol fee
        uint256 totalPot = bet.amount * 2;
        uint256 protocolFee = (totalPot * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 winnings = totalPot - protocolFee;

        s_totalProtocolFees += protocolFee;

        // Transfer winnings to winner
        (bool success, ) = winner.call{ value: winnings }("");
        if (!success) {
            revert TenTen__TransferFailed();
        }

        emit BetResolved(id, winner, winnings, protocolFee, randomNumber);
    }

    /**
     * @notice Cancel a pending bet (only by bettor)
     * @param id The ID of the bet to cancel
     */
    function cancelBet(uint256 id) external nonReentrant {
        DataTypes.Bet storage bet = s_bets[id];

        if (bet.bettor == address(0)) {
            revert TenTen__BetNotFound();
        }
        if (bet.state != DataTypes.BetState.PENDING) {
            revert TenTen__BetNotPending();
        }
        if (msg.sender != bet.bettor) {
            revert TenTen__BetNotFound(); // Using same error for security
        }

        bet.state = DataTypes.BetState.CANCELLED;

        // Refund bettor
        (bool success, ) = bet.bettor.call{ value: bet.amount }("");
        if (!success) {
            revert TenTen__TransferFailed();
        }

        emit BetCancelled(id);
    }

    /**
     * @notice Withdraw protocol fees (only owner)
     */
    function withdrawProtocolFees() external onlyOwner nonReentrant {
        uint256 fees = s_totalProtocolFees;
        if (fees == 0) {
            revert TenTen__NoFeesToWithdraw();
        }

        s_totalProtocolFees = 0;

        (bool success, ) = owner().call{ value: fees }("");
        if (!success) {
            revert TenTen__TransferFailed();
        }

        emit ProtocolFeesWithdrawn(owner(), fees);
    }

    /**
     * @notice Get bet details
     * @param id The ID of the bet
     * @return The bet struct
     */
    function getBet(uint256 id) external view returns (DataTypes.Bet memory) {
        return s_bets[id];
    }

    /**
     * @notice Get the total number of bets created
     * @return The bet counter
     */
    function getBetCount() external view returns (uint256) {
        return s_betCounter;
    }
}
