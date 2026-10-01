# Viper Double or Nothing — build spec

Solo vs the house coin flip. Simplest game in the arcade.

## Game loop
1. Player stakes X VIPER and commits to a hidden pick: `flipCommit(bytes32 commitment)` where `commitment = keccak256(choice, secret)`.
2. Player reveals within 50 blocks: `flipReveal(choice, secret)`. Contract flips a fair coin.
3. Win → payout 1.9x stake (2x minus 5% arcade fee), paid from bankroll. Lose → stake goes to bankroll.
4. No reveal in 50 blocks → stake reclaimable via `refund()`.

## Bankroll
- Contract holds lost stakes as bankroll; wins are paid from it.
- `fund()` — anyone (in practice the treasury) can top up the bankroll.
- Max stake per flip = 10% of bankroll (keeps the house solvent; reverts otherwise).

## Conventions (match the repo)
- Read `contracts/src/ViperArena.sol`: VIPER entry via approve+transferFrom, 5% treasury fee, pull-payment claims, no owner/admin privileges.
- Session keys: reuse the arena's session-key pattern (`SESSION_UX_DESIGN.md`) — commit + reveal with zero popups after one signature.

## Events
`FlipCommitted`, `FlipRevealed(player, won, payout)`, `BankrollFunded`.

## Frontend (app/double-or-nothing/)
- Coin visual (heads/tails), stake input, pick side, flip animation.
- Themed how-to overlay on entry (arcade-wide pattern: dismiss once, remember per game).
- Balance chip always visible.

## Tests (contracts/test/ViperDoubleOrNothing.t.sol)
Win path, lose path, bankroll accounting, max-stake cap revert, reveal-timeout refund, no double-reveal, no double-commit.

## Verify
`forge test` green, `npx tsc --noEmit` clean, `npm run build` succeeds. Commit locally on this branch. Do NOT push.
