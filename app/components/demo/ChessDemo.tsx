"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChessBoard } from "../ChessBoard";
import { legalDests, hasLegalMove, inCheck } from "../../lib/chess-rules";

const ACCENT = "#6366f1";
const PIECE_VALUE: Record<number, number> = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 0, 7: 1, 8: 3, 9: 3, 10: 5, 11: 9, 12: 0 };

function initialBoard(): number[] {
  const b = new Array(64).fill(0);
  const back = [4, 2, 3, 5, 6, 3, 2, 4]; // R N B Q K B N R
  for (let f = 0; f < 8; f++) {
    b[f] = back[f];           // white home rank
    b[8 + f] = 1;             // white pawns
    b[48 + f] = 7;            // black pawns
    b[56 + f] = back[f] + 6;  // black home rank
  }
  return b;
}

const sqName = (s: number) => "abcdefgh"[s % 8] + (((s / 8) | 0) + 1);

function applyMove(board: number[], from: number, to: number, promo: number): number[] {
  const p = board[from];
  const white = p >= 1 && p <= 6;
  const lastRank = white ? 7 : 0;
  const promotes = (p === 1 || p === 7) && ((to / 8) | 0) === lastRank;
  const next = board.slice();
  if (promotes) {
    // promo 2/3/4/5 = N/B/R/Q of the mover's color.
    next[to] = promo === 0 ? (white ? 5 : 11) : white ? promo : promo + 6;
  } else {
    next[to] = p;
  }
  next[from] = 0;
  return next;
}

/** Greedy bot: captures the highest-value piece, else a random legal move. */
function botMove(board: number[]): { from: number; to: number } | null {
  let best: { from: number; to: number; score: number }[] = [];
  let bestScore = -1;
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (p < 7 || p > 12) continue; // black pieces
    for (const d of legalDests(board, from)) {
      const captured = board[d.to];
      const score = captured === 0 ? 0 : 10 + (PIECE_VALUE[captured] ?? 0);
      if (score > bestScore) {
        bestScore = score;
        best = [{ from, to: d.to, score }];
      } else if (score === bestScore) {
        best.push({ from, to: d.to, score });
      }
    }
  }
  if (best.length === 0) return null;
  return best[(Math.random() * best.length) | 0];
}

/** Solo demo: you (white) vs a greedy bot. No wallet, no chain. */
export function ChessDemo() {
  const [board, setBoard] = useState<number[]>(initialBoard);
  const [turn, setTurn] = useState<0 | 1>(0);
  const [lastFrom, setLastFrom] = useState(-1);
  const [lastTo, setLastTo] = useState(-1);
  const [over, setOver] = useState<string | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [botThinking, setBotThinking] = useState(false);
  const stateRef = useRef({ board, turn, over });
  stateRef.current = { board, turn, over };

  const finishTurn = useCallback((next: number[], from: number, to: number, mover: 0 | 1, promo: number) => {
    const label = `${sqName(from)}→${sqName(to)}${promo ? "⚡" : ""}`;
    setBoard(next);
    setLastFrom(from);
    setLastTo(to);
    setMoves((m) => [...m, (mover === 0 ? "You: " : "Bot: ") + label]);
    const nextSide = (1 - mover) as 0 | 1;
    if (!hasLegalMove(next, nextSide)) {
      setOver(inCheck(next, nextSide) ? (mover === 0 ? "🏆 CHECKMATE — YOU WIN!" : "🤖 CHECKMATE — BOT WINS") : "🤝 STALEMATE — DRAW");
    } else {
      setTurn(nextSide);
    }
  }, []);

  const onPlayerMove = useCallback((from: number, to: number, promo: number) => {
    const s = stateRef.current;
    if (s.over || s.turn !== 0) return;
    finishTurn(applyMove(s.board, from, to, promo), from, to, 0, promo);
  }, [finishTurn]);

  // Bot replies after a beat.
  useEffect(() => {
    if (turn !== 1 || over) return;
    setBotThinking(true);
    const t = setTimeout(() => {
      const s = stateRef.current;
      const mv = botMove(s.board);
      setBotThinking(false);
      if (!mv) return;
      const p = s.board[mv.from];
      const promotes = p === 7 && ((mv.to / 8) | 0) === 0;
      finishTurn(applyMove(s.board, mv.from, mv.to, promotes ? 5 : 0), mv.from, mv.to, 1, promotes ? 5 : 0);
    }, 750);
    return () => clearTimeout(t);
  }, [turn, over, finishTurn]);

  const reset = useCallback(() => {
    setBoard(initialBoard());
    setTurn(0);
    setLastFrom(-1);
    setLastTo(-1);
    setOver(null);
    setMoves([]);
    setBotThinking(false);
  }, []);

  const check = !over && inCheck(board, turn);

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 border-[#26314d] bg-[#0b1020] px-4 py-3">
        <span className="font-pixel text-[10px]" style={{ color: ACCENT }}>🎮 SOLO DEMO — YOU'RE WHITE</span>
        <span className="text-xs font-bold text-zinc-200">
          {over ? over : botThinking ? "🤖 bot thinking…" : turn === 0 ? (check ? "⚠️ check — your move" : "your move") : "bot's move"}
        </span>
        <span className="ml-auto text-xs font-bold text-zinc-500">no wallet · no stakes</span>
      </div>

      <ChessBoard
        board={board}
        mySide={0}
        interactive={turn === 0 && !over && !botThinking}
        onMove={onPlayerMove}
        lastFrom={lastFrom}
        lastTo={lastTo}
      />

      {moves.length > 0 && (
        <div className="mt-4 max-h-32 overflow-y-auto rounded-2xl border-2 border-[#26314d] bg-[#0b1020] px-4 py-3">
          {moves.slice(-8).map((m, i) => (
            <div key={i} className="font-mono text-xs text-zinc-400">{m}</div>
          ))}
        </div>
      )}

      {over && (
        <button
          onClick={reset}
          className="font-pixel mt-6 w-full rounded-2xl py-4 text-xs text-white transition active:scale-[0.98]"
          style={{ background: ACCENT }}
        >
          PLAY AGAIN →
        </button>
      )}
      {!over && (
        <button
          onClick={reset}
          className="font-pixel mt-6 w-full rounded-2xl border-2 border-[#26314d] py-3 text-[10px] text-zinc-400 transition active:scale-[0.98]"
        >
          RESTART DEMO
        </button>
      )}
    </div>
  );
}
