/**
 * Node unit test for chess-rules.ts — the client-side mirror of
 * ViperChess.sol's move rules. Run:
 *   cd app && ./node_modules/.bin/tsc lib/chess-rules.ts lib/chess-rules.test.ts \
 *     --outDir /tmp/chess-rules-test --module nodenext --target es2022 --skipLibCheck \
 *     && node /tmp/chess-rules-test/chess-rules.test.js
 *
 * These positions mirror contracts/test/ViperChess.t.sol so the two
 * implementations stay in agreement.
 */
import { strict as assert } from "node:assert";
import { legalDests, moveIsLegal, inCheck, hasLegalMove } from "./chess-rules";

// Piece codes (match ViperChess.sol).
const WP = 1, WN = 2, WB = 3, WR = 4, WQ = 5, WK = 6;
const BP = 7, BN = 8, BB = 9, BR = 10, BQ = 11, BK = 12;

function initialBoard(): number[] {
  const b = new Array(64).fill(0);
  const back = [WR, WN, WB, WQ, WK, WB, WN, WR];
  for (let f = 0; f < 8; f++) {
    b[f] = back[f];
    b[8 + f] = WP;
    b[48 + f] = BP;
    b[56 + f] = back[f] + 6;
  }
  return b;
}

/** Apply a move the way the contract does (no legality check). */
function applyMove(b: number[], from: number, to: number, promo: number): void {
  const p = b[from];
  const w = p <= 6;
  const lastRank = w ? 7 : 0;
  const promotes = (p === WP || p === BP) && ((to / 8) | 0) === lastRank;
  b[to] = promotes ? (promo === 0 ? (w ? WQ : BQ) : w ? promo - 1 : promo + 5) : p;
  b[from] = 0;
}

const destTos = (b: number[], from: number) =>
  legalDests(b, from).map((d) => d.to).sort((x, y) => x - y);

// 1. e2 pawn: e3 + e4.
{
  const b = initialBoard();
  assert.deepEqual(destTos(b, 12), [20, 28]);
  assert.ok(legalDests(b, 12).every((d) => d.promo === 0));
}

// 2. b1 knight: a3 + c3.
{
  const b = initialBoard();
  assert.deepEqual(destTos(b, 1), [16, 18]);
}

// 3. Blocked pieces have no moves: d1 queen, e1 king.
{
  const b = initialBoard();
  assert.deepEqual(destTos(b, 3), []);
  assert.deepEqual(destTos(b, 4), []);
}

// 4. Scholar's mate is mate in the mirror too.
{
  const b = initialBoard();
  const line: [number, number][] = [
    [12, 28], [52, 36], // e4 e5
    [5, 26], [57, 42],  // Bc4 Nc6
    [3, 39], [62, 45],  // Qh5 Nf6
  ];
  for (const [f, t] of line) {
    assert.ok(moveIsLegal(b, f, t, 0), `move ${f}->${t} should be legal`);
    applyMove(b, f, t, 0);
  }
  assert.ok(moveIsLegal(b, 39, 53, 0), "Qxf7 should be legal");
  applyMove(b, 39, 53, 0);
  assert.ok(inCheck(b, 1), "black should be in check");
  assert.ok(!hasLegalMove(b, 1), "black should have no legal moves");
}

// 5. Fool's mate: Qh4# — same verdict.
{
  const b = initialBoard();
  for (const [f, t] of [[13, 21], [52, 36], [14, 30]] as [number, number][]) {
    assert.ok(moveIsLegal(b, f, t, 0));
    applyMove(b, f, t, 0);
  }
  assert.ok(destTos(b, 59).includes(31), "Qd8-h4 should be a legal dest");
  applyMove(b, 59, 31, 0);
  assert.ok(inCheck(b, 0) && !hasLegalMove(b, 0), "white should be mated");
}

// 6. Promotion choices on the last rank.
{
  const b = new Array(64).fill(0);
  b[4] = WK; b[60] = BK; b[48] = WP; // white pawn on a7
  const promos = legalDests(b, 48).filter((d) => d.to === 56);
  assert.deepEqual(promos.map((d) => d.promo).sort(), [2, 3, 4, 5]);
  assert.ok(moveIsLegal(b, 48, 56, 5));
  assert.ok(!moveIsLegal(b, 48, 56, 6), "promo=6 invalid");
  assert.ok(!moveIsLegal(b, 48, 56, 1), "promo=1 invalid");
}

// 7. No en passant in the mirror (documents the simplification).
{
  const b = initialBoard();
  applyMove(b, 12, 28, 0); // e4
  applyMove(b, 51, 35, 0); // d5
  applyMove(b, 28, 36, 0); // e5
  applyMove(b, 53, 37, 0); // f5
  assert.ok(!destTos(b, 36).includes(45), "exf6 e.p. must not exist");
}

// 8. No castling in the mirror (documents the simplification).
{
  const b = initialBoard();
  for (const [f, t] of [[12, 28], [52, 36], [6, 21], [57, 42], [5, 26], [61, 34]] as [number, number][]) {
    applyMove(b, f, t, 0);
  }
  assert.ok(!destTos(b, 4).includes(6), "O-O must not exist");
  assert.ok(!destTos(b, 4).includes(2), "O-O-O must not exist");
}

// 9. Absolute pin: rook on e2 shielding Ke1 from Re8 can only slide on the file.
{
  const b = new Array(64).fill(0);
  b[4] = WK; b[12] = WR; b[60] = BR; b[59] = BQ;
  const tos = destTos(b, 12);
  assert.ok(tos.length > 0, "pinned rook should still move on the file");
  assert.ok(tos.every((t) => t % 8 === 4), "pinned rook must stay on the e-file");
  assert.ok(!moveIsLegal(b, 12, 13, 0), "leaving the file exposes check");
}

// 10. Check must be answered: Qxe5+ then d6 is illegal, Qe7 blocks.
{
  const b = initialBoard();
  for (const [f, t] of [[12, 28], [52, 36], [3, 39], [57, 42]] as [number, number][]) {
    applyMove(b, f, t, 0);
  }
  assert.ok(moveIsLegal(b, 39, 36, 0), "Qxe5+ legal");
  applyMove(b, 39, 36, 0);
  assert.ok(inCheck(b, 1));
  assert.ok(!moveIsLegal(b, 51, 43, 0), "d6 does not answer check");
  assert.ok(moveIsLegal(b, 59, 52, 0), "Qe7 blocks");
}

console.log("chess-rules mirror: all 10 position tests passed");
