# Viper Chess — design spec

Game #2 of the Viper on-chain arcade (builder lane: Chess → Squad Game).
Javin's direction: **"Chess = two sides stake, winning side splits"** — a team-chess
clone of Send Arcade's CheckMate, with his twist (one VIPER token, crowd-sourced
moves, session-key play).

**Team chess:** players stake VIPER to join **White** or **Black**. Each side pools
its stake. A full chess game plays out on-chain; the winning side splits the pot
(the loser's stake included, minus the 5% protocol fee).

Reuses the proven rails from ViperArena/ViperSnake: 5% protocol fee (FEE_BPS=500),
pull-payment settlement (`pendingWithdrawals`), session keys (zero-pop-up moves),
60s lobby → permissionless `startMatch`, `<2`-per-side → refund + new lobby.

## 1. Game loop

**Lobby (60s).** `join(side)` / `joinWithSession(side, sessionKey, expiry)` pays the
VIPER entry fee into the pot. `side`: 0 = White, 1 = Black. Max 8 players per side
(16 total). First joiner starts the 60s countdown.

**startMatch()** (permissionless after the window closes). Requires **≥1 player on
each side** — otherwise everyone is refunded via `pendingWithdrawals` and a new
lobby opens. On start: board set to the standard initial position, White to move,
per-move deadline = `block.timestamp + MOVE_TIMEOUT`.

**Live.** During a side's turn, **any member of that side may submit a move**;
the first *valid* submission in block order executes. Moves are fully validated
on-chain (see §2). Session keys are the default path: join once with a session
key, then every move is signed locally — zero wallet pop-ups for the whole game.

**Terminal positions.**
- **Checkmate** → the side delivering mate wins.
- **Resign** → any member may forfeit for their own side (`resign()`).
- **Timeout** → a side that fails to move within `MOVE_TIMEOUT` (300s) loses;
  anyone calls `claimTimeout()`.
- **Draw** → stalemate, 50-move rule (halfmove clock ≥ 100 plies), or the
  `MAX_PLYS` cap (300 plies, backstop against pathological games).

**Settlement.**
- Win: pot − 5% protocol fee → **split equally among winning-side members**.
- Draw: pot − 5% fee → **split equally among ALL players** (entry fees are
  uniform, so this equals a refund-minus-fee). Stalemate punishes neither side.
- Integer-division dust sweeps to the treasury, same as arena/snake.
- Everything via `pendingWithdrawals` + `claim()` (pull payments — a failing
  recipient can't brick settlement).

## 2. Chess rules in Solidity — what ships and what's skipped

Board: `uint8[64]` in storage, index = rank*8+file, rank 0 = White's home rank.
Piece codes: 0 = empty; White 1..6 = P,N,B,R,Q,K; Black 7..12 = p,n,b,r,q,k
(code = base + 6 for Black; base 1=P, 2=N, 3=B, 4=R, 5=Q, 6=K).

`move(uint8 fromSq, uint8 toSq, uint8 promo)` validates:
1. `phase == Live`, caller (or their session key) is on the side to move.
2. Squares in range; `from` holds the mover's piece; `to` doesn't hold own piece.
3. Movement pattern legal for the piece:
   - Pawn: single step forward, double from starting rank (path clear),
     diagonal capture, **promotion** when reaching the last rank.
   - Knight: 8 L-jumps. Bishop/Rook/Queen: sliding with path-clear checks.
   - King: one square any direction.
4. The move doesn't leave the mover's own king in check (simulate in memory,
   then run attack detection).
5. `promo`: 0 = none (auto-queen if a pawn reaches the last rank without an
   explicit choice), 2 = knight, 3 = bishop, 4 = rook, 5 = queen. Other values
   revert. Promoting a non-pawn, or a pawn not reaching the last rank, reverts.

After each executed move: halfmove clock updates (reset on pawn move/capture),
ply counter increments, move deadline resets. Then terminal detection for the
side now to move: in-check? → scan for any legal reply (early-exit on the first
one). None + in check = **checkmate**; none + not in check = **stalemate**.
Also check 50-move and ply-cap draws.

**Deliberate simplifications** (shippable > exhaustive; each documented here):
- **No castling.** Requires king-through-check validation plus rights tracking
  for both rooks and the king. In crowd-sourced team play (any member moves),
  the marginal value doesn't justify the audit surface. Documented as the one
  real-rules gap a chess purist will notice.
- **No en passant.** A timing-window capture that's easy to miss when moves are
  crowd-sourced; omitting it never breaks a position, it just removes one
  (rare) capture option.
- **No threefold repetition.** Needs position-hash history on-chain. The 50-move
  rule + the 300-ply cap already bound every game; repetition just becomes a
  draw by clock instead of by claim.
- **No draw offers / no adjournment.** Team game: `resign()` is the concession
  path; draws happen by rule, not by agreement.

**Anti-cheat notes**
- Moves are atomic transactions — there is no "lazy tick" equivalent needed
  (unlike snake's auto-advancing world, chess only changes when someone moves).
  Each `move()` fully validates and settles terminal states inline.
- Session keys resolve to players for `move()` only; `join`, `claim`,
  settlement never route through them (arena's rule, unchanged).
- There is no hidden state: the board is public, so "seeing" an opponent's
  pending move in the mempool is accepted as part of the game, not an exploit.
- One troll on your own side *can* submit a bad move for the team — that's
  inherent to team chess (and to CheckMate's model), not a bug.
- Timeout is per-move (300s), not per-player: a side that stops coordinating
  forfeits. `claimTimeout()` is permissionless, so a stalled game always
  resolves without a keeper.

## 3. Contract sketch (ViperChess.sol)

**Constants:** `FEE_BPS = 500`, `LOBBY_DURATION = 60`, `MAX_PER_SIDE = 8`,
`MOVE_TIMEOUT = 300` (immutable), `MAX_PLYS = 300` (immutable).

**Immutables:** `stakeToken`, `entryFee`, `treasury` (same roles as arena/snake).

**State:** `Phase { Lobby, Live }`, `matchId`, `whitePlayers`/`blackPlayers`
(address[]), `pot`, `sideToMove` (bool or uint8), `board` (uint8[64]),
`lastMoveFrom`/`lastMoveTo` (uint8, 255 = none), `halfmoveClock`, `plyCount`,
`moveDeadline`, `pendingWithdrawals`, `sessions` (identical SessionAuth),
`joined`, `sideOf` (address → 0/1).

**Core functions**
- `join(uint8 side)` / `joinWithSession(uint8 side, address sessionKey, uint64 expiry)`
- `startMatch()` — permissionless after lobby closes; <1 per side → refund all.
- `move(uint8 fromSq, uint8 toSq, uint8 promo)` — gameplay, session-key routable.
  Fully validates; executes; detects checkmate/stalemate/draws; settles.
- `resign()` — any member forfeits their own side.
- `claimTimeout()` — permissionless; side to move missed its deadline.
- `claim()` — pull-payment withdrawal (identical to arena/snake).
- `revokeSession(sessionKey)` — identical to arena/snake.
- `getBoard()` → uint8[64]; `getPlayers(uint8 side)` → address[];
  `getMatchState()` → one-call view: phase, matchId, sideToMove, board,
  whitePlayers, blackPlayers, lastFrom, lastTo, halfmoveClock, plyCount,
  moveDeadline, pot (no multicall3 on this chain — same constraint as arena).

**Events:** `LobbyOpened`, `PlayerJoined(matchId, player, side)`,
`MatchStarted(matchId, whiteCount, blackCount)`,
`MoveMade(matchId, ply, player, fromSq, toSq, promo)`,
`MatchEnded(matchId, winningSide, reason)` (reason: 0=checkmate, 1=resign,
2=timeout), `Draw(matchId, reason)` (0=stalemate, 1=fifty-move, 2=ply-cap),
`PotSplit(matchId, recipients, shareEach)`, `Refunded`, `WithdrawalCredited`,
`SessionAuthorized`, `SessionRevoked`.

## 4. Frontend needs

- **Board rendering:** 8×8 grid (div-based, unicode pieces ♟♞♝♜♛♚), last-move
  highlight, check indicator on the king in check, side-to-move banner.
  Light/dark square coloring in the game's theme.
- **Move input:** click own piece → legal destinations highlighted (computed
  client-side by a TS mirror of the on-chain rules, `chess-rules.ts`; the
  contract is the authority, the client is the preview) → click destination →
  promotion picker (Q/R/B/N) when a pawn reaches the last rank. Session key
  sends the move with zero pop-ups; optimistic "move sent" state.
- **Lobby:** side picker — JOIN WHITE / JOIN BLACK with live counts, fast-join
  (session key) and wallet join variants, entry/pot display, 60s countdown.
- **Live panel:** turn indicator ("WHITE TO MOVE — any White player may move"),
  move countdown (5:00 per move), move list from `MoveMade` events, captured
  piece display, resign button (own side), permissionless timeout-claim button
  when the deadline passes.
- **Themed how-to on entry (arcade-wide pattern):** chess-themed overlay,
  dismiss-once per game (`viper-howto-chess`).
- **BalanceChip always visible** with the -25%/-50% drawdown check-in card
  between matches (shared component, verbatim).
- **Result banner:** winning side + reason, or draw + reason; unclaimed
  winnings → claim button.

## 5. Open questions for Javin — DECIDED

Per the arcade build authorization (2026-10-01, "send them all, no need for
checking"): all design calls below are locked by the builder, flagged for
Javin's review rather than his pre-approval.

1. **Move timeout:** 5 minutes per side per move. Keeps games moving without
   punishing coordination; a stalled side forfeits.
2. **Castling/en passant:** skipped (see §2). If Javin wants them later,
   they're additive — rights flags + validation, no state migration.
3. **Draw = equal split among all players** (refund-minus-fee), not
   side-based. Simplest fair outcome with uniform entry fees.
4. **Max 8 per side** (16 total) — matches snake's lobby size; keeps the
   lobby readable and the pot meaningful.
5. **Entry fee (testnet):** 1 MockVIPER, same as snake. Mainnet fee TBD by
   Javin at launch (one-click launch inputs).
