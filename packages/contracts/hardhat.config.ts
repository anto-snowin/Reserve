import "dotenv/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],

  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },

      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },

  networks: {
    // Local networks
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },

    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },

    // 1. Ethereum Sepolia
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },

    // 2. Polygon Amoy
    polygonAmoy: {
      type: "http",
      chainType: "l1",
      url: configVariable("POLYGON_AMOY_RPC_URL"),
      accounts: [configVariable("POLYGON_AMOY_PRIVATE_KEY")],
    },

    // 3. BNB Smart Chain Testnet
    bscTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("BSC_TESTNET_RPC_URL"),
      accounts: [configVariable("BSC_TESTNET_PRIVATE_KEY")],
    },

    // 4. Arbitrum Sepolia
    arbitrumSepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("ARBITRUM_SEPOLIA_RPC_URL"),
      accounts: [configVariable("ARBITRUM_SEPOLIA_PRIVATE_KEY")],
    },

    // 5. Base Sepolia
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      accounts: [configVariable("BASE_SEPOLIA_PRIVATE_KEY")],
    },

    //6. OP Sepolia
    opSepolia: {
      type: "http",
      chainType: "op",
      url: "https://sepolia.optimism.io",
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },

    //7. Linea Sepolia
    lineaSepolia: {
      type: "http",
      chainType: "l1",
      url: "https://rpc.sepolia.linea.build",
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },

    //8. World Chain Sepolia
    worldChainSepolia: {
      type: "http",
      chainType: "op",
      url: "https://worldchain-sepolia.g.alchemy.com/public",
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },

    //9. 
    zksyncSepolia: {
      type: "http",
      chainType: "generic",
      url: "https://sepolia.era.zksync.dev",
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },

    //10. 
    avalancheFuji: {
      type: "http",
      url: configVariable("AVALANCHE_FUJI_RPC_URL"),
      chainId: 43113,
      accounts: [configVariable("AVALANCHE_FUJI_PRIVATE_KEY")],
    },
  },
});