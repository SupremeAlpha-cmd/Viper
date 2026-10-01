# Viper mainnet launch — 10-minute runbook

## Before the window (do now)
- [ ] `git pull origin main` on the deploy machine — must be at `1c0f153` or newer
- [ ] Foundry installed (`forge`, `cast` on PATH)
- [ ] This package's `.env.mainnet` copied to the deploy machine

## When Bobby replies (the trigger)
1. He sends the **VIPER token address** → paste it to Kirasa for on-chain verification (name, symbol, 1B supply, 18 decimals, creator tax) BEFORE anything else moves.
2. He sends **his wallet address** → fill `REWARDS_POOL` in `.env.mainnet`.
3. He sends **the wallet private key** (fresh single-purpose wallet only) → import once:
   `cast wallet import deployer --interactive`
   Verify it matches: `cast wallet address --account deployer` must equal the address from step 2.
4. Confirm on-chain that his wallet holds **10,000,000 VIPER + 0.005 ETH** before running.

## The window (one command)
```bash
set -a && source launch-package/.env.mainnet && set +a
LAUNCH_YES=1 bash scripts/launch-mainnet.sh
```
The script deploys all five games, funds each VIPER reserve (2M), and writes
`scripts/mainnet-deployment.json` with every contract address + tx hashes.

## Right after (still inside the window)
1. Copy the five addresses from `scripts/mainnet-deployment.json` into the
   Vercel production env vars (`NEXT_PUBLIC_VIPER_*`), redeploy the site.
2. Sanity check on mainnet: one tiny read per game (entry fee, treasury,
   VIPER bonus) — do NOT announce publicly until this passes.

## After launch
- Retire Bobby's deployer wallet: sweep leftovers, never reuse.
