import abi from "./chess-abi.json";
import { erc20Abi } from "./contract";

export { erc20Abi };

/** ViperChess contract. Set NEXT_PUBLIC_VIPER_CHESS after deployment. */
export const VIPER_CHESS_ADDRESS = (process.env.NEXT_PUBLIC_VIPER_CHESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const isChessDeployed =
  VIPER_CHESS_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const chessAbi = abi as any;

/** Piece codes, mirroring ViperChess.sol. */
export const PIECE = {
  EMPTY: 0,
  WP: 1, WN: 2, WB: 3, WR: 4, WQ: 5, WK: 6,
  BP: 7, BN: 8, BB: 9, BR: 10, BQ: 11, BK: 12,
} as const;

/** Unicode glyphs per piece code. */
export const GLYPHS = [
  "",
  "\u2659", "\u2658", "\u2657", "\u2656", "\u2655", "\u2654", // white
  "\u265F", "\u265E", "\u2657", "\u265C", "\u265B", "\u265A", // black
];

/** 0 = white, 1 = black. */
export const isWhitePiece = (p: number) => p >= 1 && p <= 6;
export const isBlackPiece = (p: number) => p >= 7 && p <= 12;

/** Square index (rank*8+file) -> algebraic, e.g. 12 -> "e2". */
export function squareName(sq: number): string {
  const file = sq % 8;
  const rank = Math.floor(sq / 8);
  return "abcdefgh"[file] + (rank + 1);
}
