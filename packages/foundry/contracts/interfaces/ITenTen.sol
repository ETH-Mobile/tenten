//SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DataTypes } from "../libraries/DataTypes.sol";

/**
 * @title ITenTen
 * @notice Interface for the TenTen peer-to-peer betting game using a PRNG-based randomness source.
 */
interface ITenTen {
    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a bettor creates a new wager.
    event BetCreated(
        uint256 indexed id, address indexed bettor, uint256 indexed amount, DataTypes.Choice choice, uint256 timestamp
    );

    /// @notice Emitted when a challenger matches an existing wager.
    event BetMatched(uint256 indexed id, address indexed challenger);

    /// @notice Emitted after randomness resolves a bet.
    event BetResolved(uint256 indexed id, DataTypes.Choice indexed result, uint256 indexed timestamp);

    /// @notice Emitted when a bettor cancels their pending wager.
    event BetCancelled(uint256 indexed id);

    /// @notice Emitted whenever protocol fees are distributed to the collector.
    event FeesWithdrawn(address indexed owner, uint256 amount);

    /// @notice Emitted when the protocol fee collector address changes.
    event FeeCollectorSet(address indexed oldFeeCollector, address indexed newFeeCollector);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error TenTen__ZeroAmount();
    error TenTen__ZeroAddress();
    error TenTen__BetNotFound();
    error TenTen__BetNotPending();
    error TenTen__BetNotActive();
    error TenTen__CannotChallengeOwnBet();
    error TenTen__AmountMismatch();
    error TenTen__InvalidChoice();
    error TenTen__TransferFailed();
    error TenTen__NoFeesToWithdraw();
    error TenTen__MustBeBettor();
    error TenTen__InsufficientLINKTokens(uint256 balance, uint256 paid);
    error TenTen__BetAlreadyChallenged();

    /*//////////////////////////////////////////////////////////////
                              FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Create a new bet predicting EVEN or ODD outcome.
     * @param _choice Player's wager selection.
     * @return id Unique identifier assigned to the newly created bet.
     */
    function createBet(DataTypes.Choice _choice) external payable returns (uint256 id);

    /**
     * @notice Challenge an existing bet by matching its stake.
     * @param _id Identifier of the bet to match.
     * @return requestId Pseudo-random value used internally to derive the outcome.
     */
    function matchBet(uint256 _id) external payable returns (uint256 requestId);

    /**
     * @notice Cancel a still-pending bet and refund the stake.
     * @param _id Identifier of the bet to cancel.
     */
    function cancelBet(uint256 _id) external;

    /**
     * @notice Update the protocol fee collector destination.
     * @param _feeCollector Address that will receive accumulated protocol fees.
     */
    function setFeeCollector(address _feeCollector) external;

    /**
     * @notice Withdraw accumulated protocol fees to the fee collector.
     */
    function withdrawFees() external;

    /**
     * @notice View helper returning a fully populated bet struct.
     * @param id Identifier of the bet to fetch.
     * @return bet Bet data stored on-chain.
     */
    function getBet(uint256 id) external view returns (DataTypes.Bet memory bet);

    /**
     * @notice Getter for the current bet counter.
     * @return counter Current value of the bet counter.
     */
    function s_betCounter() external view returns (uint256 counter);

    /**
     * @notice Getter for the total protocol fees accrued.
     * @return fees Total fees (in wei) awaiting withdrawal.
     */
    function s_totalProtocolFees() external view returns (uint256 fees);

    /**
     * @notice Getter for the active fee collector address.
     * @return collector Address receiving protocol fees.
     */
    function s_feeCollector() external view returns (address collector);
}
