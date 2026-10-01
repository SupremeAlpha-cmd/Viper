import abi from "./snake-abi.json";
import { erc20Abi } from "./contract";

export { erc20Abi };

/** ViperSnake contract. Set NEXT_PUBLIC_VIPER_SNAKE after deployment. */
export const VIPER_SNAKE_ADDRESS = (process.env.NEXT_PUBLIC_VIPER_SNAKE ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const isSnakeDeployed =
  VIPER_SNAKE_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const snakeAbi = abi as any;

export const SNAKE_GRID = 24;

/** Directions as the contract sees them: 0=up 1=right 2=down 3=left. */
export const DIRS = [
  { dx: 0, dy: -1 }, // UP
  { dx: 1, dy: 0 }, // RIGHT
  { dx: 0, dy: 1 }, // DOWN
  { dx: -1, dy: 0 }, // LEFT
] as const;

/** 8 player colors, stable by join order. */
export const SNAKE_COLORS = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];
