import { defineChain } from "viem";

/** Robinhood Chain — EVM L2, chain ID 4663. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

/**
 * Local anvil test chain — enabled only when NEXT_PUBLIC_LOCAL_TEST=1.
 * Run: anvil --port 8545, then the DeployLocal script, then
 * NEXT_PUBLIC_LOCAL_TEST=1 NEXT_PUBLIC_VIPER_ARENA=<arena> npm run dev
 * For remote playtesters (tunnelled anvil), override the RPC URL with
 * NEXT_PUBLIC_LOCAL_RPC (e.g. https://your-tunnel.trycloudflare.com).
 */
export const localTestChain = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8545"],
    },
  },
});

/**
 * Robinhood testnet — chain ID 46630. Enabled with NEXT_PUBLIC_RH_TESTNET=1.
 * Used for the pre-launch gameplay preview (contracts from
 * contracts/script/DeployTestnet.s.sol).
 */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  testnet: true,
});

/** Active chain: testnet when NEXT_PUBLIC_RH_TESTNET=1, anvil when NEXT_PUBLIC_LOCAL_TEST=1, Robinhood Chain otherwise. */
export const activeChain =
  process.env.NEXT_PUBLIC_RH_TESTNET === "1"
    ? robinhoodTestnet
    : process.env.NEXT_PUBLIC_LOCAL_TEST === "1"
      ? localTestChain
      : robinhoodChain;
