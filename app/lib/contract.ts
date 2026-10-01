import abi from "./abi.json";

/** ViperArena contract. Set NEXT_PUBLIC_VIPER_ARENA after deployment. */
export const VIPER_ARENA_ADDRESS = (process.env.NEXT_PUBLIC_VIPER_ARENA ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const isDeployed =
  VIPER_ARENA_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const viperAbi = abi as any;

/** ViperDoubleOrNothing contract. Set NEXT_PUBLIC_VIPER_DON after deployment. */
export const VIPER_DON_ADDRESS = (process.env.NEXT_PUBLIC_VIPER_DON ||
  process.env.NEXT_PUBLIC_VIPER_DOUBLE_OR_NOTHING ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const isDonDeployed =
  VIPER_DON_ADDRESS !== "0x0000000000000000000000000000000000000000";

export { doubleOrNothingAbi } from "./donAbi";

/** Minimal ERC20 surface needed for entry-fee approval. */
export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
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

export function shortAddr(a: string): string {
  return a.slice(0, 6) + "…" + a.slice(-4);
}
