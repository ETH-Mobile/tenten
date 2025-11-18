//SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ConfirmedOwner } from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import { VRFV2WrapperConsumerBase } from "@chainlink/contracts/src/v0.8/vrf/VRFV2WrapperConsumerBase.sol";
import { LinkTokenInterface } from "@chainlink/contracts/src/v0.8/shared/interfaces/LinkTokenInterface.sol";
import { DataTypes } from "./DataTypes.sol";

/**
 * @title TenTen
 * @notice A P2P betting game where players bet on random outcomes (Even or Odd)
 * @dev Uses Chainlink VRF V2 for provably fair random number generation
 */
contract TenTen is VRFV2WrapperConsumerBase, ConfirmedOwner {
    // chainlink vrf config
    uint32 private constant CALLBACK_GAS_LIMIT = 300_000;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    LinkTokenInterface private immutable linkToken;

    // Protocol fee (2% = 200 basis points)
    uint256 private constant PROTOCOL_FEE = 200; // 2%
    uint256 private constant FEE_DENOMINATOR = 10000;

    mapping(uint256 id => DataTypes.Bet bet) private s_bets;

    // Mapping from VRF request ID to bet ID
    mapping(uint256 requestId => uint256 betId) private s_resultRequests;

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

    event BetMatched(uint256 indexed id, address indexed challenger);

    event BetResolved(uint256 indexed id, DataTypes.Choice indexed result, uint256 indexed timestamp);

    event BetCancelled(uint256 indexed id);

    event FeesWithdrawn(address indexed owner, uint256 amount);

    event FeeCollectorSet(address indexed oldFeeCollector, address indexed newFeeCollector);

    // Errors
    error TenTen__ZeroAmount();
    error TenTen__ZeroAddress();
    error TenTen__BetNotFound();
    error TenTen__BetNotPending();
    error TenTen__BetNotActive();
    error TenTen__CannotChallengeOwnBet();
    error TenTen__AmountMismatch();
    error TenTen__InvalidChoice();
    error TenTen__VRFRequestFailed();
    error TenTen__TransferFailed();
    error TenTen__NoFeesToWithdraw();
    error TenTen__MustBeBettor();
    error TenTen__InsufficientLINKTokens(uint256 balance, uint256 paid);
    error TenTen__BetAlreadyChallenged();

    /**
     * @notice Constructor
     * @param _linkAddress Address of the Link token
     * @param _wrapperAddress Address of the VRFV2Wrapper
     */
    constructor(
        address _linkAddress,
        address _wrapperAddress,
        address _feeCollector
    ) ConfirmedOwner(msg.sender) VRFV2WrapperConsumerBase(_linkAddress, _wrapperAddress) {
        linkToken = LinkTokenInterface(_linkAddress);
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

    function matchBet(uint256 _id) external payable returns (uint256 requestId) {
        DataTypes.Bet memory bet = s_bets[_id];
        require(bet.bettor != address(0), TenTen__BetNotFound());
        require(bet.state == DataTypes.BetState.PENDING, TenTen__BetNotPending());
        require(msg.value == bet.amount, TenTen__AmountMismatch());
        require(bet.challenger == address(0), TenTen__BetAlreadyChallenged());
        require(msg.sender != bet.bettor, TenTen__CannotChallengeOwnBet());

        s_bets[_id].challenger = msg.sender;

        // cost of request
        uint256 paid = VRF_V2_WRAPPER.calculateRequestPrice(CALLBACK_GAS_LIMIT);
        uint256 balance = linkToken.balanceOf(address(this));

        // revert if CryptoAnts cannot pay the cost
        require(balance >= paid, TenTen__InsufficientLINKTokens(balance, paid));

        // request random numbers from chainlink
        requestId = requestRandomness(CALLBACK_GAS_LIMIT, REQUEST_CONFIRMATIONS, NUM_WORDS);
        emit BetMatched(_id, msg.sender);
    }

    function fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal override {
        DataTypes.Bet memory bet = s_bets[s_resultRequests[_requestId]];

        uint256 randomWord = _randomWords[0];
        bool isEven = randomWord % 2 == 0;
        DataTypes.Choice resultChoice = isEven ? DataTypes.Choice.EVEN : DataTypes.Choice.ODD;

        address winner;
        if (bet.choice == resultChoice) {
            winner = bet.bettor;
        } else {
            winner = bet.challenger;
        }

        // Calculate protocol fee and send to fee collector, pay winner
        uint256 protocolFee = (bet.amount * PROTOCOL_FEE) / FEE_DENOMINATOR;
        uint256 payout = (bet.amount * 2) - protocolFee;
        s_totalProtocolFees += protocolFee;

        s_bets[bet.id].winner = winner;

        emit BetResolved(bet.id, resultChoice, block.timestamp);

        (bool success, ) = winner.call{ value: payout }("");
        require(success, TenTen__TransferFailed());
    }

    function cancelBet(uint256 _id) external {
        DataTypes.Bet memory bet = s_bets[_id];

        require(bet.bettor != address(0), TenTen__BetNotFound());
        require(bet.state == DataTypes.BetState.PENDING, TenTen__BetNotPending());
        require(msg.sender == bet.bettor, TenTen__MustBeBettor());

        s_bets[_id].state = DataTypes.BetState.CANCELLED;
        emit BetCancelled(_id);

        (bool success, ) = bet.bettor.call{ value: bet.amount }("");
        require(success, TenTen__TransferFailed());
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), TenTen__ZeroAddress());

        address oldFeeCollector = s_feeCollector;
        s_feeCollector = _feeCollector;
        emit FeeCollectorSet(oldFeeCollector, _feeCollector);
    }

    /**
     * @notice Withdraw fees (only owner)
     */
    function withdrawFees() external onlyOwner {
        uint256 fees = s_totalProtocolFees;
        require(fees > 0, TenTen__NoFeesToWithdraw());

        s_totalProtocolFees = 0;

        (bool success, ) = s_feeCollector.call{ value: fees }("");
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

    /**
     * @notice Get the total number of bets created
     * @return The bet counter
     */
    function getBetCount() external view returns (uint256) {
        return s_betCounter;
    }
}
