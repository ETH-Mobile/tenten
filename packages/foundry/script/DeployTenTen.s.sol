// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/TenTen.sol";

/**
 * @notice Deploy script for TenTen contract
 * @dev Inherits ScaffoldETHDeploy which:
 *      - Includes forge-std/Script.sol for deployment
 *      - Includes ScaffoldEthDeployerRunner modifier
 *      - Provides `deployer` variable
 * Example:
 * yarn deploy --file DeployTenTen.s.sol  # local anvil chain
 * yarn deploy --file DeployTenTen.s.sol --network optimism # live network (requires keystore)
 */
contract DeployTenTen is ScaffoldETHDeploy {
    // VRF and TenTen constructor parameters for Optimism mainnet
    address internal constant VRF_COORDINATOR = 0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625;
    bytes32 internal constant KEY_HASH = 0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c;
    uint32 internal constant CALLBACK_GAS_LIMIT = 500_000;

    // The subscription ID should be provided via environment or constructor args in your deployment framework.
    // For security, do not hardcode production subscription IDs in public repos.
    // Example: uint256 internal immutable SUBSCRIPTION_ID;

    /**
     * @dev Deployer setup based on `LOCALHOST_KEYSTORE_ACCOUNT` in `.env`:
     *      - "eth-mobile-default": Uses Anvil's account #9 (0xa0Ee7A142d267C1f36714E4a8F75612F20a79720), no password prompt
     *      - "eth-mobile-custom": requires password used while creating keystore
     *
     * Note: Must use ScaffoldEthDeployerRunner modifier to:
     *      - Setup correct `deployer` account and fund it
     *      - Export contract addresses & ABIs to `nextjs` packages
     */
    function run() external ScaffoldEthDeployerRunner {
        // Read subscription ID from .env (see forge-std `vm.envUint`)
        uint256 subscriptionId = vm.envUint("VRF_SUBSCRIPTION_ID");
        address feeCollector = deployer; // Example: use deployer address

        new TenTen(VRF_COORDINATOR, subscriptionId, KEY_HASH, CALLBACK_GAS_LIMIT, feeCollector);
    }
}
