import abi from "./abi.json";
import { erc20Abi } from "../lib/contract";

export const VIPER_SL_ADDRESS = (process.env.NEXT_PUBLIC_VIPER_SL ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const isDeployed =
  VIPER_SL_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const viperSlAbi = abi as any;
export { erc20Abi };

export enum Team {
  RED = 0,
  BLUE = 1,
  GREEN = 2,
  YELLOW = 3,
}

export interface TeamMeta {
  id: Team;
  name: string;
  label: string;
  color: string;
  bgLight: string;
  border: string;
  emoji: string;
  glyph: string;
}

export const TEAM_META: Record<Team, TeamMeta> = {
  [Team.RED]: {
    id: Team.RED,
    name: "RED",
    label: "Red Vipers",
    color: "#ef4444",
    bgLight: "#fee2e2",
    border: "#b91c1c",
    emoji: "🔴",
    glyph: "🐍",
  },
  [Team.BLUE]: {
    id: Team.BLUE,
    name: "BLUE",
    label: "Blue Cobras",
    color: "#2e7cf6",
    bgLight: "#dbeafe",
    border: "#1d4ed8",
    emoji: "🔵",
    glyph: "💎",
  },
  [Team.GREEN]: {
    id: Team.GREEN,
    name: "GREEN",
    label: "Green Pythons",
    color: "#10b981",
    bgLight: "#d1fae5",
    border: "#047857",
    emoji: "🟢",
    glyph: "🌿",
  },
  [Team.YELLOW]: {
    id: Team.YELLOW,
    name: "YELLOW",
    label: "Yellow Adders",
    color: "#f59e0b",
    bgLight: "#fef3c7",
    border: "#b45309",
    emoji: "🟡",
    glyph: "⚡",
  },
};

export const LADDERS: [number, number][] = [
  [4, 14],
  [9, 31],
  [20, 38],
  [28, 84],
  [40, 59],
  [51, 67],
  [63, 81],
  [71, 91],
];

export const SNAKES: [number, number][] = [
  [17, 7],
  [54, 34],
  [62, 18],
  [64, 60],
  [87, 24],
  [93, 73],
  [95, 75],
  [99, 78],
];

export const LADDER_MAP: Record<number, number> = Object.fromEntries(LADDERS);
export const SNAKE_MAP: Record<number, number> = Object.fromEntries(SNAKES);

export const TURN_TIMEOUT_BLOCKS = 30;
export const WINNING_SQUARE = 100;
