# Viper Mainnet Launch — Runbook

One command takes everything live. Read this whole page before running anything.

## The one command

```bash
export VIPER_TOKEN=0x...            # (1) VIPER token address from Bobby, post-Pons-launch
export TREASURY=0x...               # (2) mainnet treasury address — still undecided
export DEPLOYER_PRIVATE_KEY=0x...   # (4) deployer key with mainnet ETH — env var only, never a file

# Optional knobs (defaults shown):
#   FEE_ARENA / FEE_SNAKE / FEE_CHESS / FEE_SQUAD / FEE_SL   — per-game entry fees in VIPER (default 1 each)
#   DON_BANKROLL=0            — VIPER bankroll for Double or Nothing (0 = skip, fund later)
#   SQUAD_PASS_NFT=0x0 / SQUAD_PASS_FEE_VIPER=0
#   ARENA_FUSE_BLOCKS=30 / ARENA_MAX_MATCH_BLOCKS=3000
#   SNAKE_MATCH_TICKS=3000 / CHESS_MOVE_TIMEOUT=300 / CHESS_MAX_PLYS=300
#   SQUAD_MAX_PLAYERS=32 / SQUAD_MIN_PLAYERS=4 / SQUAD_ROUND_DURATION=45
#   MAINNET_RPC / CONTRACT_* (contract names, overridable) / BLOCKSCOUT_API_URL

LAUNCH_YES=1 bash scripts/launch-mainnet.sh
```

Javin's four launch inputs: **(1)** VIPER address ← Bobby after the Pons launch, **(2)** per-game mainnet entry fees (decided here, in VIPER), **(3)** mainnet treasury (decided here), **(4)** deployer wallet with mainnet ETH for gas.

## Preconditions (all must be true)

1. **All six game branches merged to `main`.** Each merge needs Javin's explicit word — never merge without it. The script checks that all six contract sources exist and aborts otherwise. Game branches: `arena` (bomber, original slice), `snake`, `chess`, `squad-game`, plus agy's `double-or-nothing` and `snakes-ladders`.
2. **VIPER launched by Bobby via Pons.** His locked parameters: name `Viper`, ticker `VIPER`, creator tax 2% (`creatorTaxBps=200`), pool/fee wallet `0x8d6dd76ad4ad8370474739916a7a78d1d6384c8e` (separate from the launch wallet), buyback OFF. First-buy amount is Bobby's call. Take the VIPER token address from him.
3. **Treasury decided.** The 5% protocol fee from every game flows to this address. (It was his wallet `0x3A25eA32280f2D9516420bdeDd5b99f71E5799A5` in tests — confirm what he wants for mainnet.)
4. **Deployer funded.** The deployer wallet needs mainnet ETH for gas. If funding the Double or Nothing bankroll at launch, it also needs VIPER ≥ `DON_BANKROLL`.
5. **No launch without fresh explicit approval.** Javin's standing rule — even with everything wired, the actual run needs his word.

## What the script does

1. **Safety gates:** refuses unless `VIPER_TOKEN`, `TREASURY`, `DEPLOYER_PRIVATE_KEY` are set; checks the RPC's chainId is **4663** (aborts on testnet/anvil); aborts if any of the six contract sources is missing.
2. **Confirmation:** without `LAUNCH_YES=1` it prints the plan and requires typing `DEPLOY`.
3. **Compiles** (`forge build`), then deploys all six via `forge create --broadcast`:
   | Game | Contract | Ctor args |
   |---|---|---|
   | Bomber arena | `ViperArena` | stakeToken, entryFee, treasury, fuseBlocks=30, maxMatchBlocks=3000 |
   | Snake | `ViperSnake` | stakeToken, entryFee, treasury, matchTicks |
   | Chess | `ViperChess` | stakeToken, entryFee, treasury, moveTimeout, maxPlys |
   | Squad Game | `ViperSquadGame` | stakeToken, entryFee, treasury, maxPlayers, minPlayers, roundDuration, passNFT, passFee |
   | Double or Nothing | `ViperDoubleOrNothing` | stakeToken, treasury (no entry fee — bankroll game) |
   | Snakes & Ladders | `ViperSnakesLadders` | stakeToken, entryFee, treasury |
4. **Double or Nothing bankroll:** if `DON_BANKROLL > 0`, approves + calls `fund()` so the house has liquidity. Skips with a warning if the deployer lacks the VIPER.
5. **Blockscout verification (best-effort):** only attempted when `BLOCKSCOUT_API_URL` is set; failures are warnings, verify manually afterwards.
6. **Writes `scripts/mainnet-deployment.json`** — chainId, RPC, token, treasury, deployer, timestamp, and every contract address + deploy tx.
7. **Prints the exact `NEXT_PUBLIC_*` env vars** for Vercel.

## After the run

1. Set the printed `NEXT_PUBLIC_*` vars on the viper-blast.xyz Vercel project and redeploy. (Confirm the env-var names against the merged frontend — agy's games use the same `NEXT_PUBLIC_VIPER_*` pattern.)
2. Verify each game's contract params on-chain (`cast call <addr> "entryFee()"`, etc.) against the deployment JSON.
3. If the DON bankroll was skipped, fund it later via `fund()` once the house wallet is ready.
4. Announce. 🎰

## Notes

- **agy's games are parameterized by real ctors**, read from their shipped code (not guesses): `ViperDoubleOrNothing(stakeToken, treasury)` and `ViperSnakesLadders(stakeToken, entryFee, treasury)`. Contract names are env-overridable (`CONTRACT_DON`, `CONTRACT_SL`, …) in case the merged versions differ — re-check ctors if agy's merged code changed after Oct 1.
- Chess simplifications carried into mainnet (no castling/en passant/threefold repetition/draw offers — documented in `CHESS_SPEC.md`).
- The script never runs on testnet by design; testnet deploys stay manual (see `hidden_files/testnet-deploys.json`).
