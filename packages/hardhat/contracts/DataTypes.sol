//SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title DataTypes
 * @notice A library that defines the data types for the TenTen contract
 */
library DataTypes {
    enum BetState {
        PENDING,
        ACTIVE,
        RESOLVED,
        CANCELLED
    }

    enum Choice {
        EVEN,
        ODD
    }

    struct Bet {
        uint256 id;
        address bettor;
        address challenger;
        uint256 amount;
        Choice choice;
        BetState state;
        address winner;
        uint256 timestamp; // The timestamp of the bet
    }
}
