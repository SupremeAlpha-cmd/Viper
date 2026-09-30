# Port notes — Send Arcade → Viper

Studied 2026-09-30 from [github.com/SendArcade](https://github.com/SendArcade).
Honest accounting of what was copied, borrowed, and built fresh.

## What SendRC actually is

`SendRC` ("Send Rollup Contract for lanaroads") is **not the bomber game**.
It's an Anchor/Rust demo program (`sol_cross`): player registration, step
counting, coin collection — with ephemeral-rollup delegate/undelegate wired in.
A template for "player stats on a rollup", not arena logic.

Borrowed from it (patterns, not code — it's Solana/Rust, we're Solidity):
- **Player registry per wallet** — one account per player, keyed by wallet.
- **Every action emits an event** — the client rebuilds game state from logs
  instead of the contract storing view-friendly state. Viper does the same:
  `PlayerMoved`, `BombPlanted`, `BombExploded`, etc.
- **Only the player mutates their own state** — `require(user == player.owner)`
  on every instruction → `require(alive[msg.sender])` on every move.

Dropped entirely:
- **The ephemeral-rollup layer** (delegate/commit/undelegate). This is the
  whole port insight: on Robinhood Chain there is nothing to delegate *to*.
  The L2 is the speed layer. ~200 lines of rollup machinery become zero.

## What Checkmate contributed

`Checkmate` (their on-chain chess SDK, TypeScript) has an **escrow system**:
entry fees locked in-contract, prize auto-distributed on game end. That's the
direct ancestor of Viper's pot: `join()` escrows, `_settle()` pays the winner
or splits. Same trust model — no one holds the money mid-match.

## What we built fresh

The bomber arena itself. **FuseMeDaddy's game code is not open source** —
nothing in the org contains the arena rules, grid logic, or game client.
So `ViperArena.sol` is original work: grid movement validation, bomb
fuse/blast/chain-detonation resolution, lazy explosion processing (no keepers),
winner-takes-all with sudden-death and tie splits, rolling lobby lifecycle.

Genre rules (Bomberman-likes) supplied the game design; our locked decisions
(60s timed lobbies, chaos tuning, 5% fee) shaped the rest.

## Still to borrow: VibeGame

`VibeGame-www` is their game launchpad — anyone ships a game, each game gets a
gamecoin (50+ coins, $4M+ volume). That's slice 3 for Viper: the VIPER coin
launches on **Pons**, our chain's native launchpad. Same flywheel, no porting
needed — the primitive already exists here.
