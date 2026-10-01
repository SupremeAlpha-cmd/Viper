import abi from "./abi.json";

/** ViperArena contract. Set NEXT_PUBLIC_VIPER_ARENA after deployment. */
export const VIPER_ARENA_ADDRESS = (process.env.NEXT_PUBLIC_VIPER_ARENA ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const isDeployed =
  VIPER_ARENA_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const viperAbi = abi as any;

/** Minimal ERC20 surface needed for entry-fee approval. */
export const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

export const GRID = 11;
export const LOBBY_SECONDS = 60;
/** Keep in sync with ViperArena.MAX_PATH_STEPS (contract constant). */
export const MAX_PATH_STEPS = 20;

export function shortAddr(a: string): string {
  return a.slice(0, 6) + "…" + a.slice(-4);
}
