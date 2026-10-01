# Viper Snakes & Ladders — build spec

Team board race. Four teams, one token per team, first to 100 takes the pot.

## Game loop
1. Lobby: players join one of 4 teams (RED, BLUE, GREEN, YELLOW) by staking the entry fee into that team's pool. Any number per team.
2. Race: teams take turns in fixed order. On a team's turn, any member of that team may submit the roll (first valid submission counts). Dice 1-6, token advances; classic snakes & ladders board (use a standard 10x10 layout with ~8 snakes and ~8 ladders — define the mapping as a constant).
3. Exact-100 not required (roll past 100 = win at 100+, keeps it simple).
4. First team to reach 100 wins. Winning team's players split 95% of the total pot (pro-rata by stake); 5% to treasury.

## Randomness (v1)
Dice = 1 + (blockhash of the previous block % 6) at roll time. Simple, note the trust assumption in a code comment. No commit-reveal for v1.

## Anti-grief
- One roll per team per turn; turn expires after 30 blocks → any team member can roll, and if no one does, the turn passes (token stays).
- A player can only be on one team per match.

## Conventions (match the repo)
- Read `contracts/src/ViperArena.sol`: VIPER entry via approve+transferFrom, 5% treasury fee, pull-payment claims, no owner/admin privileges.
- Session keys: reuse the arena's session-key pattern (`SESSION_UX_DESIGN.md`) — rolls with zero popups after one signature.

## Events
`TeamJoined`, `Rolled(team, dice, from, to)`, `Climbed`/`Slid`, `MatchWon(team)`.

## Frontend (app/snakes-ladders/)
- 10x10 board with snakes & ladders drawn, 4 team tokens, dice animation.
- Themed how-to overlay on entry (arcade-wide pattern: dismiss once, remember per game).
- Balance chip always visible.

## Tests (contracts/test/ViperSnakesLadders.t.sol)
Join teams, turn order, roll advances token, ladder climb, snake slide, win + pro-rata split, turn timeout pass, one-team-per-player.

## Verify
`forge test` green, `npx tsc --noEmit` clean, `npm run build` succeeds. Commit locally on this branch. Do NOT push.
