"use client";

import { useMemo, useState } from "react";
import { GLYPHS, isWhitePiece, isBlackPiece } from "../lib/chess";
import { legalDests, inCheck, type Dest } from "../lib/chess-rules";

const LIGHT = "#f0d9b5";
const DARK = "#b58863";
const ACCENT = "#6366f1"; // indigo — chess theme

/**
 * ChessBoard — tap-to-select, tap-to-move. Highlights legal destinations
 * using the local rules mirror (the contract re-validates on-chain).
 * Promotion moves pop a 4-choice picker.
 */
export function ChessBoard({
  board,
  mySide,
  interactive,
  onMove,
  lastFrom,
  lastTo,
}: {
  board: number[];
  /** 0 = white, 1 = black, null = spectator */
  mySide: number | null;
  interactive: boolean;
  onMove: (from: number, to: number, promo: number) => void;
  lastFrom: number;
  lastTo: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [promoPick, setPromoPick] = useState<{ from: number; to: number } | null>(null);

  const dests: Dest[] = useMemo(
    () => (selected === null ? [] : legalDests(board, selected)),
    [board, selected]
  );
  const destSet = useMemo(() => new Set(dests.map((d) => d.to)), [dests]);

  const checkSq = useMemo(() => {
    if (!inCheck(board, 0)) {
      if (!inCheck(board, 1)) return -1;
    }
    // Return the checked king's square (prefer the side to move's).
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (p === 6 && inCheck(board, 0)) return i;
      if (p === 12 && inCheck(board, 1)) return i;
    }
    return -1;
  }, [board]);

  const canSelect = (sq: number): boolean => {
    if (!interactive || mySide === null) return false;
    const p = board[sq];
    return mySide === 0 ? isWhitePiece(p) : isBlackPiece(p);
  };

  const tap = (sq: number) => {
    if (promoPick) return;
    if (selected !== null && destSet.has(sq)) {
      const promos = dests.filter((d) => d.to === sq);
      if (promos.length > 1 || (promos.length === 1 && promos[0].promo !== 0)) {
        setPromoPick({ from: selected, to: sq }); // ask which piece
      } else {
        onMove(selected, sq, 0);
        setSelected(null);
      }
      return;
    }
    if (canSelect(sq)) {
      setSelected(selected === sq ? null : sq);
    } else {
      setSelected(null);
    }
  };

  const pickPromo = (promo: number) => {
    if (!promoPick) return;
    onMove(promoPick.from, promoPick.to, promo);
    setPromoPick(null);
    setSelected(null);
  };

  const sideGlyphs = mySide === 1 ? [8, 9, 10, 11] : [2, 3, 4, 5]; // N B R Q

  return (
    <div className="relative mx-auto w-full max-w-[520px] select-none">
      <div
        className="grid grid-cols-8 overflow-hidden rounded-2xl border-2"
        style={{ borderColor: "#26314d", aspectRatio: "1" }}
      >
        {Array.from({ length: 64 }, (_, i) => {
          const r = (i / 8) | 0; // display row, 0 = top
          const c = i % 8;
          const sq = (7 - r) * 8 + c; // white at bottom
          const p = board[sq];
          const isLight = (r + c) % 2 === 0;
          const isSel = selected === sq;
          const isDest = destSet.has(sq);
          const isCapture = isDest && board[sq] !== 0;
          const isLast = sq === lastFrom || sq === lastTo;
          const isCheck = sq === checkSq;
          return (
            <button
              key={sq}
              onClick={() => tap(sq)}
              className="relative flex items-center justify-center"
              style={{
                background: isCheck
                  ? "#ef4444"
                  : isSel
                    ? "#fbbf24"
                    : isLast
                      ? isLight ? "#f7e6a2" : "#c9a86a"
                      : isLight ? LIGHT : DARK,
                cursor: interactive ? "pointer" : "default",
              }}
            >
              {p !== 0 && (
                <span
                  className="leading-none"
                  style={{
                    fontSize: "clamp(22px, 6.5vw, 40px)",
                    color: isWhitePiece(p) ? "#ffffff" : "#111111",
                    textShadow: isWhitePiece(p)
                      ? "0 0 2px #000, 0 1px 3px rgba(0,0,0,0.9)"
                      : "0 0 2px #fff, 0 1px 3px rgba(255,255,255,0.7)",
                  }}
                >
                  {GLYPHS[p]}
                </span>
              )}
              {isDest && !isCapture && (
                <span
                  className="absolute rounded-full"
                  style={{
                    width: "28%", height: "28%",
                    background: "rgba(99,102,241,0.55)",
                  }}
                />
              )}
              {isDest && isCapture && (
                <span
                  className="absolute inset-[4%] rounded-full border-4"
                  style={{ borderColor: "rgba(99,102,241,0.7)" }}
                />
              )}
              {c === 0 && (
                <span
                  className="absolute left-[3px] top-[2px] text-[9px] font-bold"
                  style={{ color: isLight ? DARK : LIGHT, opacity: 0.9 }}
                >
                  {8 - r}
                </span>
              )}
              {r === 7 && (
                <span
                  className="absolute bottom-[2px] right-[4px] text-[9px] font-bold"
                  style={{ color: isLight ? DARK : LIGHT, opacity: 0.9 }}
                >
                  {"abcdefgh"[c]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {promoPick && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
          style={{ background: "rgba(4,8,16,0.72)" }}
          onClick={() => setPromoPick(null)}
        >
          <div
            className="rounded-3xl border-2 bg-[#0b1020] p-5"
            style={{ borderColor: ACCENT }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-pixel mb-4 text-center text-[10px] uppercase tracking-widest text-zinc-400">
              Promote to
            </div>
            <div className="flex gap-3">
              {sideGlyphs.map((g, i) => (
                <button
                  key={g}
                  onClick={() => pickPromo([2, 3, 4, 5][i])}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 text-4xl transition active:scale-95"
                  style={{
                    borderColor: "#26314d",
                    background: "#131a2e",
                    color: mySide === 1 ? "#111" : "#fff",
                    textShadow: mySide === 1 ? "0 0 2px #fff" : "0 0 2px #000",
                  }}
                >
                  {GLYPHS[g]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
