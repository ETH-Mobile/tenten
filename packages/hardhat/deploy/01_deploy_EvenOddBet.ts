import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { Contract } from 'ethers';

/**
 * Deploys the TenTen contract
 *
 * @param hre HardhatRuntimeEnvironment object.
 *
 * @notice This contract requires Chainlink VRF V2 setup:
 * - VRF Coordinator address (network-specific)
 * - Subscription ID (create at https://vrf.chain.link/)
 * - Key Hash (gas lane, network-specific)
 * - Callback Gas Limit (recommended: 500000)
 *
 * Network-specific VRF addresses:
 * - Sepolia: 0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625
 * - Mainnet: 0x271682DEB8C4E0901D1a1550aD2e64D568E69909
 * - Polygon Mumbai: 0x7a1BaC17Ccc5b313516C5E16fb24f7659aA5ebed
 * - Polygon Mainnet: 0xAE975071Be8F8eE67addBC1A82488F1C24858067
 */
const deployTenTen: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const { network } = hre;

  // Network-specific VRF configuration
  // These are example values - you'll need to set up your own Chainlink subscription
  const vrfConfig: {
    [key: string]: {
      vrfCoordinator: string;
      keyHash: string;
      subscriptionId: string;
      callbackGasLimit: number;
    };
  } = {
    sepolia: {
      vrfCoordinator: '0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625',
      keyHash:
        '0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c', // 30 gwei
      subscriptionId: process.env.VRF_SUBSCRIPTION_ID || '0',
      callbackGasLimit: 500000
    },
    mainnet: {
      vrfCoordinator: '0x271682DEB8C4E0901D1a1550aD2e64D568E69909',
      keyHash:
        '0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef', // 200 gwei
      subscriptionId: process.env.VRF_SUBSCRIPTION_ID || '0',
      callbackGasLimit: 500000
    },
    hardhat: {
      // For local testing, you can use mock values
      vrfCoordinator: '0x0000000000000000000000000000000000000000',
      keyHash:
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      subscriptionId: '0',
      callbackGasLimit: 500000
    },
    localhost: {
      // For local testing, you can use mock values
      vrfCoordinator: '0x0000000000000000000000000000000000000000',
      keyHash:
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      subscriptionId: '0',
      callbackGasLimit: 500000
    }
  };

  const networkName = network.name.toLowerCase();
  const config = vrfConfig[networkName] || vrfConfig.hardhat;

  console.log(`\n📋 Deploying TenTen to ${networkName}...`);
  console.log(`   VRF Coordinator: ${config.vrfCoordinator}`);
  console.log(`   Subscription ID: ${config.subscriptionId}`);
  console.log(`   Key Hash: ${config.keyHash}`);
  console.log(`   Callback Gas Limit: ${config.callbackGasLimit}\n`);

  if (
    config.subscriptionId === '0' &&
    networkName !== 'hardhat' &&
    networkName !== 'localhost'
  ) {
    console.warn(
      '⚠️  WARNING: VRF_SUBSCRIPTION_ID not set. Please set it in your .env file or create a subscription at https://vrf.chain.link/'
    );
  }

  await deploy('TenTen', {
    from: deployer,
    args: [
      config.vrfCoordinator,
      config.subscriptionId,
      config.keyHash,
      config.callbackGasLimit
    ],
    log: true,
    autoMine: true
  });

  // Get the deployed contract
  const TenTen = await hre.ethers.getContract<Contract>('TenTen', deployer);

  console.log('✅ TenTen deployed at:', await TenTen.getAddress());
  console.log('📊 Bet counter:', (await TenTen.getBetCount()).toString());
  console.log(
    '💰 Protocol fees:',
    (await TenTen.totalProtocolFees()).toString()
  );

  if (networkName !== 'hardhat' && networkName !== 'localhost') {
    console.log(
      '\n📝 Next steps:',
      '\n   1. Fund your Chainlink subscription: https://vrf.chain.link/',
      '\n   2. Add this contract as a consumer to your subscription',
      '\n   3. Test the contract with createBet() and challengeBet() functions'
    );
  }
};

export default deployTenTen;

deployTenTen.tags = ['TenTen'];
