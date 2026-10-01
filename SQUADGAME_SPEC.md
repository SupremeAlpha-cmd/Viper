# Squad Game — Design Spec (Viper Arcade, game #3)

**Contract:** `ViperSquadGame` (`contracts/src/ViperSquadGame.sol`)
**Theme:** Squid-Game survival — big-lobby, last-player-standing. Dark arena, blood-red accent (`#ef4444`).
**Rails (shared with Snake/Arena):** 5% protocol fee (`FEE_BPS = 500`), pull payments (`pendingWithdrawals` + `claim()`), session keys for gasless-feeling gameplay, 60s lobby → permissionless `startMatch`, lazy on-chain resolution, `< minPlayers` → full refunds.

---

## 1. Game shape

Up to **32 players** stake VIPER to enter a lobby. The match runs in **elimination rounds**
("Red Light, Green Light"):

- **GREEN LIGHT** — a round window opens (`roundDuration`, e.g. 45s). Every alive player
  must call `survive()` once before the window closes. The **first** check-in timestamp
  counts; re-check-ins don't improve your time.
- **RED LIGHT** — anyone may call `resolveRound()` once the window closes (it also
  auto-runs at the top of `survive()`, so the game never needs a keeper).

At resolution, for the round's alive set (size A):

1. **Missed the window → eliminated.** No grace. Red light means red light.
2. Of the C players who checked in (C ≥ 2): the **slowest quartile is eliminated** —
   `k = ceil(C/4)` players with the latest check-in timestamps. Ties broken by join
   order (earlier joiner ranks "faster"). Deterministic, verifiable on-chain.
3. If C == 1, the lone checker survives the round (only the missed players die).
4. If C == 0 (everybody AFK), the whole alive set is eliminated as one final batch.

Then:

- **1 alive → winner.** Takes `pot − 5% fee`. Treasury takes the fee.
- **0 alive → final batch splits the pot equally** (same as Snake's simultaneous-deaths rule).
- **Otherwise → next round begins** automatically (`round++`, fresh window, check-ins reset).

An eliminated player's stake **forfeits into the pot**: the pot is fixed at the sum of
all entry fees, so every elimination concentrates the same pot over fewer survivors —
the UI shows **"YOUR CUT IF YOU WIN: pot ÷ alive"**, which is the number that grows
with eliminations. (Documented honestly: the pot doesn't mint new tokens; shares grow.)

Convergence: worst case with full check-ins each round, 32 → 24 → 18 → 13 → 9 → 6 →
4 → 3 → 2 → 1 in **9 rounds** (~7 min at 45s/round). Missed windows only speed it up.

## 2. Why this mechanic (fairness trade-offs)

Candidate mechanics considered:

| Mechanic | Verdict |
|---|---|
| Blockhash-picked random victims | **Rejected.** The resolver chooses the exact resolve block, so they can simulate and pick a block whose hash kills a rival — a real MEV/griefing vector. Fixing it needs 2-step commit/reveal, too heavy for an arcade round. |
| Commit-reveal per round | **Rejected.** 2 txs per player per round; terrible arcade feel. |
| Pure "miss the window" elimination | **Rejected.** If everyone checks in, nobody dies and the game can stall forever. |
| **Slowest-quartile + missed-window (chosen)** | Deterministic from on-chain `block.timestamp`s. No randomness → no resolver MEV. Public rule, trivially verifiable. Guarantees ≥1 elimination per round → always converges. |

Honest limitations:

- **"Slowest" is partly network luck.** Two check-ins seconds apart are cleanly ordered
  on a ~1s-block chain, but same-block ties are broken by join order, which is
  arbitrary — not skill. The rule is *fair* (public, deterministic, ungameable) rather
  than *purely skill-based*.
- **It's an attention game, not a twitch game.** The skill is showing up every round
  and checking in promptly. Windows are deliberately generous early; tuning
  (shrinking windows per round) is a post-launch lever, not in v1.
- **Session-key check-ins are fire-and-forget.** A player whose session tx lands after
  the window closed counts as missed — the client must surface the countdown clearly.

## 3. NFT passes (Javin's twist)

Constructor params: `passNFT` (address, **zero = open entry**) and `passFee`
(the entry fee for pass holders; **0 = free**). Eligibility = `balanceOf(player) > 0`
on a minimal ERC-721 interface. Pass holders still join the same pot and play the
same game — the pass is a discount/free-entry perk, not a separate bracket.

Mainnet NFT contract address is a **deploy-time input** (not hardcoded).

Testnet deploy: `passNFT = 0x0` (open entry), `passFee = 0`.

## 4. Contract surface

```solidity
constructor(
    address _stakeToken,
    uint256 _entryFee,
    address _treasury,
    uint8 _maxPlayers,      // 32
    uint8 _minPlayers,      // 4
    uint256 _roundDuration,  // 45 (seconds)
    address _passNFT,       // 0x0 = open entry
    uint256 _passFee         // fee for pass holders (0 = free); must be <= entryFee
)
```

- `join()` / `joinWithSession(address sessionKey, uint64 expiry)` — lobby only.
  First joiner (re)starts the 60s countdown (Snake convention).
- `startMatch()` — permissionless after lobby closes. `< minPlayers` → refund all,
  new lobby opens.
- `survive()` — check in for the current round. Direct or via session key.
  Auto-resolves a due round first (lazy, keeperless).
- `resolveRound()` — permissionless; resolves the round if the window closed.
- `claim()` — pull winnings / refunds / fees.
- `revokeSession(address)` — player or key itself.
- Views: `getMatchState()` (single-call client poll — no multicall3 on this chain),
  `getPlayers()`, `lobbyOpen()`, plus public mappings.

Events: `LobbyOpened`, `PlayerJoined`, `MatchStarted`, `MatchCancelled`,
`CheckedIn(matchId, round, player, at)`, `RoundResolved(matchId, round, eliminated)`,
`PlayerEliminated(matchId, round, player, reason)` (reason 0 = missed window,
1 = slowest quartile), `MatchEnded(matchId, winner, prize)`, `PotSplit`,
`Refunded`, `WithdrawalCredited`, `SessionAuthorized`, `SessionRevoked`.

## 5. Frontend

- `app/lib/squad-game.ts` — `NEXT_PUBLIC_VIPER_SQUAD_GAME` env, ABI export, 32-color
  palette, round constants.
- `app/lib/useSquadGame.ts` — 2s polling of `getMatchState()`, join/joinFast
  (session key, `estimateTopUp` on `survive`), `startMatch`, `survive` (session-first),
  `resolveRound`, `claimWinnings`, `revokeSession`; elimination flashes + result
  banner from event logs.
- `app/components/SquadGameScreen.tsx` — lobby card (countdown, roster chips,
  entry/pot), live round view (round #, green-light countdown, big CHECK IN button,
  roster with ✓/✖/⏳ states, "your cut if you win"), resolve button when due,
  winnings claim row, session controls.
- `app/app/squad-game/page.tsx` — route + `HowToOverlay` (`viper-howto-squad-game`,
  dark survival theme, red accent).
- `BalanceChip` (`game="squad-game"`, `betweenMatches = phase === "lobby"`) always
  visible, with the −25%/−50% drawdown check-in card between matches.

## 6. Test plan (Foundry, ~20 tests)

Lobby: join + fee taken, pass-holder discount/free entry, non-holder pays full,
lobby full revert, double-join revert, first-join restarts timer, startMatch too
early reverts, < minPlayers refunds + new lobby.
Rounds: check-in recorded, double check-in reverts, missed window eliminated,
slowest quartile eliminated (exact k), tie broken by join order, lone checker
survives, all-AFK → final batch splits equally, winner takes pot − 5%,
fee math + dust to treasury, claim() pull payment, resolveRound before deadline
reverts, survive() auto-resolves a due round, session-key survive works,
revokeSession blocks the key, round counter increments, checked-in flags reset.

## 7. Testnet deploy params

- chain 46630, RPC `https://rpc.testnet.chain.robinhood.com`
- stakeToken = MockVIPER `0x3d2aC05Eb6e6Cd7cDCf5a89f38976dc43A98B6ad`
- entryFee = 1e18, treasury = deployer, maxPlayers = 32, minPlayers = 4,
  roundDuration = 45, passNFT = 0x0, passFee = 0
- Record under `games.squad-game` in `~/workspace/viper/hidden_files/testnet-deploys.json`
  (untracked local state — never committed), env var `NEXT_PUBLIC_VIPER_SQUAD_GAME`.
