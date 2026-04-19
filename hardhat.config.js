require('@nomicfoundation/hardhat-toolbox');
require('dotenv/config');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    sepolia: {
      url: process.env.BLOCKCHAIN_RPC_URL || '',
      accounts: process.env.BLOCKCHAIN_PRIVATE_KEY ? [process.env.BLOCKCHAIN_PRIVATE_KEY] : [],
    },
    hardhat: {
      chainId: 1337,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || '',
  },
  paths: {
    sources: './contracts',
    tests: './contracts/test',
    cache: './contracts/cache',
    artifacts: './contracts/artifacts',
  },
};
