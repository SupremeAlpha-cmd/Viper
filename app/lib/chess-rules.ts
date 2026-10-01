/**
 * chess-rules.ts — pure TypeScript mirror of ViperChess.sol's move rules.
 *
 * Used client-side ONLY for highlighting legal destinations when a piece is
 * selected. The contract is the source of truth: a highlighted move can still
 * revert if the chain disagrees (it shouldn't — this ports the same logic).
 *
 * Board: number[64], square = rank*8+file (rank 0 = White home rank).
 * Piece codes match the contract: 0 empty, 1-6 white P/N/B/R/Q/K,
 * 7-12 black p/n/b/r/q/k.
 *
 * Simplifications (same as contract): no castling, no en passant, no
 * threefold repetition, no draw offers. Promotion choices 2/3/4/5 = N/B/R/Q
 * (0/1 auto-queen).
 */

const WP = 1, WN = 2, WB = 3, WR = 4, WQ = 5, WK = 6;
const BP = 7, BN = 8, BB = 9, BR = 10, BQ = 11, BK = 12;

export interface Dest {
  to: number;
  /** Promotion choice to send with the move (2/3/4/5, or 0 when no promotion). */
  promo: number;
}

const file = (s: number) => s % 8;
const rank = (s: number) => (s / 8) | 0;

function isWhite(p: number): boolean { return p >= WP && p <= WK; }
function isBlack(p: number): boolean { return p >= BP && p <= BK; }

function sameColor(a: number, b: number): boolean {
  return (isWhite(a) && isWhite(b)) || (isBlack(a) && isBlack(b));
}

/** Pattern check for a pawn step (no en passant; promotion flagged separately). */
function pawnPattern(b: number[], from: number, to: number, p: number): boolean {
  const w = isWhite(p);
  const df = Math.abs(file(to) - file(from));
  let dr = rank(to) - rank(from);
  if (!w) dr = -dr;
  const t = b[to];
  if (df === 0) {
    if (t !== 0) return false;
    if (dr === 1) return true;
    if (dr === 2) {
      const home = w ? rank(from) === 1 : rank(from) === 6;
      if (!home) return false;
      const mid = from + (w ? 8 : -8);
      return b[mid] === 0;
    }
    return false;
  }
  if (df === 1 && dr === 1) return t !== 0 && !sameColor(p, t);
  return false;
}

function sliderPattern(b: number[], from: number, to: number, p: number, diag: boolean, straight: boolean): boolean {
  const df = Math.abs(file(to) - file(from));
  const dr = Math.abs(rank(to) - rank(from));
  if (df === 0 && dr === 0) return false;
  const isDiag = df === dr;
  const isStraight = df === 0 || dr === 0;
  if (isDiag && !diag) return false;
  if (isStraight && !straight) return false;
  if (!isDiag && !isStraight) return false;
  const sf = Math.sign(file(to) - file(from));
  const sr = Math.sign(rank(to) - rank(from));
  let f = file(from) + sf;
  let r = rank(from) + sr;
  while (f !== file(to) || r !== rank(to)) {
    if (b[r * 8 + f] !== 0) return false;
    f += sf;
    r += sr;
  }
  const t = b[to];
  return t === 0 || !sameColor(p, t);
}

function patternOk(b: number[], from: number, to: number, p: number): boolean {
  const t = b[to];
  if (t !== 0 && sameColor(p, t)) return false;
  const df = Math.abs(file(to) - file(from));
  const dr = Math.abs(rank(to) - rank(from));
  switch (p) {
    case WP: case BP: return pawnPattern(b, from, to, p);
    case WN: case BN:
      return (df === 1 && dr === 2) || (df === 2 && dr === 1);
    case WB: case BB: return sliderPattern(b, from, to, p, true, false);
    case WR: case BR: return sliderPattern(b, from, to, p, false, true);
    case WQ: case BQ: return sliderPattern(b, from, to, p, true, true);
    case WK: case BK: return df <= 1 && dr <= 1 && (df + dr > 0);
    default: return false;
  }
}

function findKing(b: number[], white: boolean): number {
  const want = white ? WK : BK;
  for (let i = 0; i < 64; i++) if (b[i] === want) return i;
  return 64; // missing
}

function pawnAttacks(b: number[], sq: number, byWhite: boolean): boolean {
  const f = file(sq), r = rank(sq);
  const pr = byWhite ? r - 1 : r + 1;
  if (pr < 0 || pr > 7) return false;
  const want = byWhite ? WP : BP;
  if (f > 0 && b[pr * 8 + (f - 1)] === want) return true;
  if (f < 7 && b[pr * 8 + (f + 1)] === want) return true;
  return false;
}

function rayAttacks(b: number[], sq: number, byWhite: boolean): boolean {
  const f0 = file(sq), r0 = rank(sq);
  const wantN = byWhite ? WN : BN;
  const wantK = byWhite ? WK : BK;
  const wantDiag = byWhite ? [WB, WQ] : [BB, BQ];
  const wantStraight = byWhite ? [WR, WQ] : [BR, BQ];
  const KN: [number, number][] = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
  for (const [df, dr] of KN) {
    const f = f0 + df, r = r0 + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8 && b[r * 8 + f] === wantN) return true;
  }
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = f0 + df, r = r0 + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8 && b[r * 8 + f] === wantK) return true;
    }
  }
  const RAYS: [number, number][] = [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  for (const [sf, sr] of RAYS) {
    const diag = sf !== 0 && sr !== 0;
    let f = f0 + sf, r = r0 + sr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const q = b[r * 8 + f];
      if (q !== 0) {
        if (diag ? wantDiag.includes(q) : wantStraight.includes(q)) return true;
        break;
      }
      f += sf; r += sr;
    }
  }
  return false;
}

function isAttacked(b: number[], sq: number, byWhite: boolean): boolean {
  return pawnAttacks(b, sq, byWhite) || rayAttacks(b, sq, byWhite);
}

/** True iff moving `from`->`to` (with `promo`) is fully legal for the mover. */
export function moveIsLegal(b: number[], from: number, to: number, promo: number): boolean {
  const p = b[from];
  if (p === 0) return false;
  const w = isWhite(p);
  if (promo !== 0 && (p !== WP && p !== BP)) return false;
  if (promo !== 0 && promo !== 2 && promo !== 3 && promo !== 4 && promo !== 5) return false;
  const lastRank = w ? 7 : 0;
  const promotes = (p === WP || p === BP) && rank(to) === lastRank;
  if (!promotes && promo !== 0) return false;
  if (!patternOk(b, from, to, p)) return false;
  const sim = b.slice();
  sim[to] = promotes ? (promo === 0 ? (w ? WQ : BQ) : (w ? promo - 1 : promo + 5)) : p;
  sim[from] = 0;
  const ksq = findKing(sim, w);
  if (ksq === 64) return false;
  return !isAttacked(sim, ksq, !w);
}

/** Pseudo-legal destinations (pattern-level) for the piece on `from`. */
function genDests(b: number[], from: number): Dest[] {
  const p = b[from];
  if (p === 0) return [];
  const w = isWhite(p);
  const lastRank = w ? 7 : 0;
  const out: Dest[] = [];
  const push = (to: number) => {
    const promotes = (p === WP || p === BP) && rank(to) === lastRank;
    if (promotes) {
      for (const pr of [2, 3, 4, 5]) out.push({ to, promo: pr });
    } else {
      out.push({ to, promo: 0 });
    }
  };
  const f0 = file(from), r0 = rank(from);
  if (p === WP || p === BP) {
    const dir = w ? 1 : -1;
    const one = (r0 + dir) * 8 + f0;
    if (r0 + dir >= 0 && r0 + dir < 8) {
      if (b[one] === 0) {
        push(one);
        const home = w ? r0 === 1 : r0 === 6;
        const two = (r0 + 2 * dir) * 8 + f0;
        if (home && b[two] === 0) push(two);
      }
      for (const df of [-1, 1]) {
        const f = f0 + df;
        if (f < 0 || f > 7) continue;
        const to = (r0 + dir) * 8 + f;
        const t = b[to];
        if (t !== 0 && !sameColor(p, t)) push(to);
      }
    }
    return out;
  }
  if (p === WN || p === BN) {
    const KN: [number, number][] = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
    for (const [df, dr] of KN) {
      const f = f0 + df, r = r0 + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const to = r * 8 + f;
      const t = b[to];
      if (t === 0 || !sameColor(p, t)) push(to);
    }
    return out;
  }
  if (p === WK || p === BK) {
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue;
        const f = f0 + df, r = r0 + dr;
        if (f < 0 || f > 7 || r < 0 || r > 7) continue;
        const to = r * 8 + f;
        const t = b[to];
        if (t === 0 || !sameColor(p, t)) push(to);
      }
    }
    return out;
  }
  const RAYS: [number, number][] =
    (p === WB || p === BB) ? [[1,1],[1,-1],[-1,1],[-1,-1]] :
    (p === WR || p === BR) ? [[1,0],[-1,0],[0,1],[0,-1]] :
    [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  for (const [sf, sr] of RAYS) {
    let f = f0 + sf, r = r0 + sr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const to = r * 8 + f;
      const t = b[to];
      if (t === 0) { push(to); f += sf; r += sr; continue; }
      if (!sameColor(p, t)) push(to);
      break;
    }
  }
  return out;
}

/**
 * Fully legal destinations for the piece on `from` (pattern + king safety).
 * Promotion moves appear once per choice (2/3/4/5).
 */
export function legalDests(board: number[], from: number): Dest[] {
  return genDests(board, from).filter((d) => moveIsLegal(board, from, d.to, d.promo));
}

/** True iff `side` (0=white, 1=black) has any legal move. */
export function hasLegalMove(board: number[], side: number): boolean {
  const white = side === 0;
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (p === 0 || isWhite(p) !== white) continue;
    const dests = genDests(board, from);
    for (const d of dests) {
      if (moveIsLegal(board, from, d.to, d.promo)) return true;
    }
  }
  return false;
}

/** True iff `side`'s king is currently in check. */
export function inCheck(board: number[], side: number): boolean {
  const white = side === 0;
  const ksq = findKing(board, white);
  if (ksq === 64) return false;
  return isAttacked(board, ksq, !white);
}
