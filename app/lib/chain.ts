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
 */
export const localTestChain = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

/** Active chain: anvil when local-test mode is on, Robinhood Chain otherwise. */
export const activeChain =
  process.env.NEXT_PUBLIC_LOCAL_TEST === "1" ? localTestChain : robinhoodChain;
