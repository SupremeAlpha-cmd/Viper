# Viper Snake — design spec

Flagship game of the Viper on-chain arcade. Slither.io-style multiplayer snake
arena: N snakes, coins spawn, eating grows you, wall/self/other-snake collision
eliminates you. Staked in VIPER, winner takes the pot. Solo snake has no reason
to be on-chain — opponents are the point.

Status: **spec only**. No code written. Reuses ViperArena's proven conventions
(5% protocol fee, pull-payment settlement, session keys, lazy on-chain
resolution) rather than reinventing them.

## 1. Game loop

**Lobby (60s timed window, same as arena).** `join()` / `joinWithSession()`
pays the VIPER entry fee into the pot. First joiner starts the 60s countdown.
Lobby closes → `startMatch()` (permissionless). Fewer than 2 players → everyone
refunded via `pendingWithdrawals`, new lobby opens. 2+ → snakes spawn at spread
spawn points, length 3, score 0.

**Live.** The world advances in **ticks**. A snake auto-advances one cell per
tick in its current direction — the player only transacts when *changing*
direction (`setDirection`). This is the core fix for "every step you stop and
transact": straight-line movement costs zero transactions; you pay (gas-only,
via session key, no popup) only when you turn. Coins spawn on a deterministic
schedule; eating one grows you by 1 and +1 score. Collisions eliminate:
wall, own body, another snake's body. Head-to-head: longer snake survives,
shorter dies; equal length → both die.

**Elimination → settlement.**
- Last snake alive → **winner-takes-all**: pot minus 5% protocol fee to
  treasury, credited to `pendingWithdrawals[winner]`. Recommended.
- Match hits its tick budget with 2+ alive → **score-weighted split**:
  each survivor's share ∝ their score (coins eaten). Rewards the dominant
  player instead of an equal split — score exists, so use it.
- Simultaneous final deaths in the same tick → the death batch splits equally
  (arena's `lastDeathBatch` pattern).
- Dust from integer division sweeps to treasury, same as arena.

## 2. Multiplayer model — the honest version

True 10ms real-time is impossible on-chain. There is no ephemeral rollup on
Robinhood Chain, so we don't pretend. The practical model:

- **Tick = 1 block.** The chain's cadence is the game clock. Calibrate feel
  against the real block time before mainnet (if blocks are ~1s, one cell per
  second is playable snake; if faster, consider tick-every-N-blocks).
- **Direction commits, not moves.** `setDirection` records your new heading;
  it takes effect at the *next* tick, never the current one. Between turns you
  transact nothing — the chain (and every client) advances your snake
  deterministically.
- **Lazy resolution (arena's explosion pattern).** Nobody processes every tick
  on-chain in real time. `poke()` (permissionless, anyone can call) advances
  all missed ticks: moves heads, resolves coin eating, checks collisions in
  tick order, emits `SnakeEliminated` events. Clients don't wait for this —
- **Optimistic UI.** The frontend simulates the deterministic world locally
  from the on-chain direction-commit log. Your turn renders instantly;
  the session-key tx confirms in the background. What you see is always
  ≥1 tick ahead of what's settled — same tradeoff as arena's 2s polling,
  but the simulation makes it feel instant.
- **Session keys are the default path.** `joinWithSession` authorizes a
  browser-held key scoped to the match (arena's `SessionAuth`: match-scoped,
  expiring, revocable, can never touch funds). All `setDirection` calls go
  through it: zero wallet popups for the whole match. The key pays its own
  gas from a small native top-up.
- **Match size: 8 players max, 24×24 grid** (proposed; see open questions).
  Gas per `poke` scales with players × missed ticks, so cap ticks processed
  per poke and rely on frequent permissionless pokes.

## 3. Contract sketch (ViperSnake.sol)

Mirrors ViperArena structure. New per-game state only:

**State**
- Constants: `GRID = 24`, `MAX_PLAYERS = 8`, `FEE_BPS = 500`,
  `MATCH_TICKS` (tick budget), `LOBBY_DURATION = 60`.
- Immutables: `stakeToken`, `entryFee`, `treasury` (same roles as arena).
- `Phase { Lobby, Live }`, `matchId`, `players`, `pot`, `aliveCount`.
- Per player: `alive`, `score`, `segments` (dynamic array of packed
  xy cells, head-first), `direction`, `lastProcessedTick`.
- Coins: `coinCells` (array of packed xy), `coinsEaten` counter (drives
  deterministic respawn).
- `pendingWithdrawals` (pull-payment, identical to arena), `sessions`
  (session-key auth, identical to arena).

**Core functions**
- `join()` / `joinWithSession(sessionKey, expiry)` — entry fee → pot.
- `startMatch()` — permissionless after lobby closes; <2 players → refund.
- `setDirection(uint8 dir)` — gameplay-only, callable via session key.
  Records heading for the *next* tick. Reverts on 180° reversal.
- `poke()` — permissionless; advances all missed ticks, processes
  movement/coins/collisions, emits eliminations, calls `_settle()`.
- `claim()` — pull-payment withdrawal (identical to arena).
- `revokeSession(sessionKey)` — identical to arena.
- `getMatchState()` — one-call view for the client: players, heads,
  directions, scores, alive flags, coin cells (arena has no multicall3
  on this chain — same constraint applies).

**Anti-cheat notes**
- One direction change per tick max; commit applies next tick, never
  retroactively — no same-tick double-turns, no rewriting history.
- 180° reversal rejected on-chain (can't turn into your own neck).
- Direction commits are public mempool-visible; an opponent seeing your
  turn one block early is accepted as part of the game (it's on screen
  anyway), not treated as an exploit.
- Coin spawns from `keccak256(matchId, coinsEaten, blockhash)` on empty
  cells only — deterministic, verifiable, ungameable.
- Session keys resolve to players for `setDirection` only; `join`,
  `claim`, and settlement never route through them (arena's rule).
- Score = coins eaten, incremented only inside tick processing —
  no self-reported scores anywhere.

**Events** (client rebuilds state from these):
`LobbyOpened`, `PlayerJoined`, `MatchStarted`, `DirectionCommitted`,
`CoinEaten`, `CoinSpawned`, `SnakeEliminated`, `MatchEnded`,
`PotSplit`, `WithdrawalCredited`, `SessionAuthorized`, `SessionRevoked`.

## 4. Frontend needs

- **Canvas rendering**, 24×24 grid (or tuned size). One color per snake
  (assigned by join order), coins as distinct markers, eliminated snakes
  fade out. Interpolate movement between ticks so motion looks smooth
  even though state updates per block.
- **Keyboard:** arrows/WASD to steer. Mobile: swipe to steer.
- **Themed how-to on entry (arcade-wide pattern, Javin 2026-10-01):**
  entering any game shows a quick how-to overlay styled in that game's
  theme — Snake's reads like Snake, the arena's like the arena. Dismiss
  once, don't nag every visit (remember dismissal per game).
- **Live leaderboard:** rank by score, alive/dead status, your snake
  highlighted. Built from events + `getMatchState()` polling (~1s or
  per-block, not the arena's 2s).
- **Optimistic direction:** render the turn immediately on keypress;
  fire the session-key `setDirection` in the background; reconcile on
  confirmation. Never block input on a pending tx.
- **Session-key onboarding:** one signature at join ("authorize fast play
  for this match"), then silence. Show a small "fast play on" indicator.
- Reuse the arena's drawdown check-in pattern: balance chip always
  visible; -25%/-50% session-drawdown card between matches
  (specced in `SESSION_UX_DESIGN.md`).

## 5. Open questions for Javin — DECIDED (2026-10-01)

1. **Feel tuning** — balanced defaults (Javin: "i trust your judgement").
   Locked: 24×24 grid, 8 players, 1 tick per block.
2. **Dead snake's body** — **scatters as coins**, slither.io-style.
   Rewards aggressive play, gives small snakes a comeback mechanic.
3. **Boost** — **stripped** (Javin 2026-10-01: "strip snake boost").
   Removed from the contract, tests, spec, and frontend. No speed
   mechanic; every snake moves 1 cell per tick.

1. **Feel tuning — grid size, player count, tick speed?** Proposed 24×24,
   8 players, 1 tick per block. Bigger grid = more room but emptier early
   game; more players = more gas per poke. This is the one that decides
   whether it feels like Snake or a screensaver.
2. **What happens to a dead snake's body?** Vanish (simple), or scatter as
   coins slither.io-style (rewards aggressive play, comeback mechanic for
   small snakes)? Changes the strategy layer significantly.
3. **Boost?** — decided: stripped (2026-10-01). No boost in v1.
