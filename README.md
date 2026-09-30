# Viper

Real-time, fully on-chain multiplayer bomber arena for Robinhood Chain.
Every move, bomb and explosion is a blockchain transaction — no game servers.

Viper is a port of the Send Arcade model (Solana's largest on-chain gaming
platform) to Robinhood Chain. The key insight: Send Arcade needed MagicBlock's
ephemeral rollups because Solana's base layer couldn't do real-time. On
Robinhood Chain the L2's fast blocks *are* the speed layer, so the arena runs
directly on-chain with no rollup in between.

## How a match works

1. **Lobby (60s)** — pay the entry fee (USDG) to join. Timed window: everyone
   who joins in time plays. Fewer than 2 players → full refunds, new lobby.
2. **Live** — spawn on the 11×11 grid. Move tile-by-tile, plant bombs
   (~2.5s fuse, 3-tile cross blast, chain detonations). Caught in a blast —
   even your own — you're out.
3. **Payout** — last one standing takes the pot minus a 5% protocol fee.
   Simultaneous final deaths split it; if the match outlives its block budget,
   survivors split it (sudden death). All automatic, no one to trust.

No keepers needed: every gameplay transaction first lazily resolves due
explosions, and anyone can call `poke()` to advance a stalled match.

## Repo layout

```
contracts/   Foundry project — ViperArena.sol + 9 tests
docs/        port-notes.md — what we studied, borrowed, and built fresh
app/         (slice 2) Next.js client: lobby + live arena UI
```

## App (slice 2)

```bash
cd app
npm install
# point at a deployed ViperArena:
cp .env.example .env.local   # set NEXT_PUBLIC_VIPER_ARENA
npm run dev
```

The client polls chain state every 2s and rebuilds the whole arena from
contract reads plus event logs — no backend. Keyboard: arrows/WASD to move,
Space to plant. Every action is a wallet transaction; the UI queues them
honestly (no fake instant moves).

One chain note: Multicall3 is not deployed on Robinhood Chain, so the client
does not use `multicall`. The contract exposes `getMatchState()` — the whole
roster in a single `eth_call` — instead.

`app/scripts/e2e-anvil.mjs` drives a full match (join → start → move →
bomb → kill → payout) against a local anvil deployment, exercising the same
read/event patterns the UI hook uses. 15/15 checks pass.

`ViperArena` constructor: `(stakeToken, entryFee, treasury, fuseBlocks, maxMatchBlocks)`.
Fuse and match length are in blocks — calibrate against Robinhood Chain's real
block cadence before mainnet (defaults target ~2.5s fuse).

Local end-to-end (no mainnet):

```bash
anvil --port 8545   # separate terminal
forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url http://127.0.0.1:8545 --broadcast --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
# then: node ../app/scripts/e2e-anvil.mjs <arena> <token>
```

## Design decisions (locked 2026-09-30)

- Timed 60s lobbies, winner-takes-all, chaos tuning (short fuse, big blast)
- One rolling match at a time: lobby → live → payout → next lobby opens
- Client rebuilds all state from events; contracts stay lean

## Roadmap

- [x] Slice 1 — arena contracts + tests (this repo state)
- [x] Slice 2 — web client: lobby, live grid, wallet connect
- [ ] Slice 3 — VIPER gamecoin on Pons (the VibeGame flywheel)
- [ ] Audit + testnet deployment, block-time calibration
