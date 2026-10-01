import abi from "./squad-game-abi.json";
import { erc20Abi } from "./contract";

export { erc20Abi };

/** ViperSquadGame contract. Set NEXT_PUBLIC_VIPER_SQUAD_GAME after deployment. */
export const VIPER_SQUAD_GAME_ADDRESS = (process.env.NEXT_PUBLIC_VIPER_SQUAD_GAME ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const isSquadGameDeployed =
  VIPER_SQUAD_GAME_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const squadGameAbi = abi as any;

export const SQUAD_MAX_PLAYERS = 32;

/** Elimination reasons as the contract emits them. */
export const REASON_MISSED = 0;
export const REASON_SLOWEST = 1;

/** 32 player colors, stable by join order. Dark-arena palette. */
export const SQUAD_COLORS = [
  "#ef4444", // blood red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#fb7185", // rose light
  "#fda4af", // pink light
  "#fdba74", // orange light
  "#fcd34d", // amber light
  "#fde047", // yellow light
  "#bef264", // lime light
  "#86efac", // green light
  "#6ee7b7", // emerald light
  "#5eead4", // teal light
  "#67e8f9", // cyan light
  "#7dd3fc", // sky light
  "#93c5fd", // blue light
  "#a5b4fc", // indigo light
  "#c4b5fd", // violet light
  "#e9d5ff", // purple light
];

export const SQUAD_ACCENT = "#ef4444";
export const SQUAD_BG = "#0a0a10";
