# Viper Audit Fix Pass — Report (1 Oct 2026)

All changes are **uncommitted** in the worktree. Nothing pushed. Verified: `forge test` 15/15 green, `tsc --noEmit` clean, `next build` 6/6 pages pass.

## Pre-work: SEC-01 / SEC-02 status
Both fixes are **already committed and pushed** — they were swept into `6f38ade` ("Visual: unify site accent…") via `git add -A` during the visual overhaul. Functionally present and covered by regression tests (`test_DeadCallerMoveSettlesInsteadOfReverting`, `test_FirstJoinRestartsStaleLobby`, `test_CannotJoinExpiredLobby`), all green. Lesson: audit fixes should get their own commits, not ride along with `git add -A` visual pushes.

## SEC-03 (high) — REAL, fixed
**Evidence:** `_settle()` / `_splitPot()` / `startMatch()` solo-refund all did `require(stakeToken.transfer(...))` *after* `_openLobby()`. One failing recipient (reverting / blocklisting / false-returning token) reverts the whole tx including the state reset → every later `poke()`/`move()`/`plantBomb()` reaching `_settle()` reverts → match bricks permanently. Stake token is VIPER (constructor `stakeToken`), not USDG.
**Fix** (`contracts/src/ViperArena.sol`): pull payments — `mapping(address=>uint256) public pendingWithdrawals`, `event WithdrawalCredited(matchId, to, amount)`, `function claim() external nonReentrant` (zeroes balance before transfer), internal `_credit()` used by `_settle()` (treasury fee + winner prize), `_splitPot()` (fee + shares), `startMatch()` solo path (credits, `Refunded` event kept). Credits written before `_openLobby()` so events carry the settled match id. Test mock renamed `MockUSDG` → `MockVIPER`.
**Test:** `test_BlockedRecipientCannotFreezeSettlement` — blocklisting token; poke succeeds, lobby reopens, B + treasury claim fine, only A's claim reverts. PASS.
**Client:** `app/lib/abi.json` extended (verified byte-identical to the compiled artifact for all 3 entries), `claimWinnings()` + 2s `pendingWithdrawals` poll in `useViper.ts`, claim strip in `GameScreen.tsx`.

## SEC-04 (medium) — REAL, fixed
**Evidence:** `_processExplosions()` processed due bombs in array-index order; `_recordDeath()` batched by `block.number`. Bombs due at different `detonateAt` times but processed in one late poke merged into a single death batch, corrupting the `aliveCount == 0` "last batch eliminated splits it" rule. **Proven on a temp copy of the original contract:** bomb due T1 kills B, bomb due T2>T1 kills A+C, one poke → old code paid B 95 instead of 0.
**Fix:** `_processExplosions()` detonates in ascending `detonateAt` order (min-scan loop); death batching keyed by `detonateAt`, threaded `_detonate(idx, batchId)` → `_blastTile(x, y, batchId)` → `_recordDeath(p, batchId)`. `lastDeathBlock` renamed → `lastDeathBatch`. Chain-detonated bombs keep `detonateAt = block.number` ("explodes now") → own latest batch.
**Test:** `test_LazyDeathsBatchByDetonateAt` — asserts A=142, C=142, B=0, treasury=15 (old code: 95/95/95). PASS.

## SEC-05 (low) — HALF-REAL, fixed
**Evidence:** "Grows forever" cross-match is **wrong** — `_openLobby()` does `delete bombs`. Real issue is within-match: `_detonate()` tombstones (`live=false`), dead entries never removed; over a 3000-block match the array grows unboundedly and every scan (`_processExplosions`, `_liveBombAt`, `_hasLiveBomb`, `_blastTile`) is O(n) over tombstones.
**Fix:** `_compactBombs()` (swap-and-pop dead entries) at the end of `_processExplosions()` when something detonated — never mid-detonation (chain reactions use stable indices).
**Test:** `test_BombsArrayCompactsAfterDetonation` — after A's bomb detonates, `getBombs().length == 1` (only B's live bomb); after B's, length 0. PASS.

## UI-01 (medium) — REAL, fixed
`formatTokens` in `app/lib/useViper.ts`: `decimals=0` → `slice(0,-0)` is empty, `slice(-0)` is the whole string → `123n` rendered as **"0.123"**. Moved to new pure module `app/lib/format.ts` with `decimals === 0 → v.toString()` guard; re-exported so existing imports unchanged. New test `app/scripts/formatTokens.test.mjs` (node built-in runner): 3/3 pass. Pre-existing quirk left alone: sub-0.0001 amounts render "0.0000".

## UI-02 (medium) — REAL, fixed
No chain detection existed (`lib/wagmi.ts` set `chains: [activeChain]` but never compared the wallet's chain). New `app/components/NetworkBanner.tsx`: amber banner when `chainId !== activeChain.id` (Robinhood 4663 / Anvil 31337, from the app's own `lib/chain.ts`), one-click switch via `useSwitchChain` with `wallet_addEthereumChain` fallback (error 4902). Wired into `GameScreen.tsx`.

## UI-03 (low) — real in the edge, fixed minimally
`LobbyPanel.tsx` showed "Start match" after expiry but **disabled when `players.length < 1`** → expired empty lobby dead-ended. Now always enabled; with 0 players reads "Refresh lobby" and calls `startMatch()` (→ `MatchCancelled` + `_openLobby()`).

## TEST-01 (low) — NOT APPLICABLE
Zero hits for `PlayerDied` anywhere in `contracts/`; contract declares/emits `PlayerEliminated`. Already aligned, no change.

## Signature UX — investigated, designed, NOT built
Doc: `SESSION_UX_DESIGN.md`. Today: wagmi v2 + viem, `walletClient.writeContract` per action = one popup per move/bomb; join = 2 popups. **Permit: dead end** — Pons v2 token template is `ERC20 + ERC20Burnable`, no `ERC20Permit`; VIPER unlaunched so unverifiable on-chain anyway. **Recommended: self-funded session key** — `joinWithSession(sessionKey, expiry)` folds auth into the join tx, player tops up the key with a little native gas, client signs/broadcasts moves via public RPC with viem → zero mid-game pop-ups, no relayer. Session keys hard-scoped to gameplay (can't touch funds/join/withdraw).

## Flagged for Javin's decision
1. Session key vs relayer (recommend self-funded; relayer needs infra + sponsor wallet).
2. Top-up UX: entry goes 2 pop-ups → ~3, unless arena subsidizes session gas from the 5% fee (tokenomics call).
3. Key storage: memory-only (safest) vs sessionStorage (survives reload).
4. Expiry default must exceed match length (pending block-cadence calibration).
5. Split dust `(pot - fee) % n` is now permanently locked (was "house seed") — negligible (<16 units); flag if a dust-sweep is wanted.
6. `lastDeathBlock` → `lastDeathBatch` rename: break any off-chain indexer reading the old getter before mainnet.
7. `test_ChainDetonationKillsBothAndSplits` comment is misleading under forge (no auto-mining); test green, comment describes mainnet timing.

## Files changed (uncommitted)
- `contracts/src/ViperArena.sol` (+120/-~40), `contracts/test/ViperArena.t.sol` (+191)
- `app/lib/useViper.ts`, `app/components/GameScreen.tsx`, `app/components/LobbyPanel.tsx`, `app/lib/abi.json`
- New: `app/components/NetworkBanner.tsx`, `app/lib/format.ts`, `app/scripts/formatTokens.test.mjs`, `SESSION_UX_DESIGN.md`
