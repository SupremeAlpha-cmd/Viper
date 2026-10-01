# Viper session-key UX — design doc (read-only investigation, nothing built)

Status: **design only**. No code changed, no commit. Contract is not yet deployed to mainnet, so this can still land before launch.

## 1. How signing works today

Stack: **wagmi v2 + viem**, injected connector only (`app/lib/wagmi.ts` — no WalletConnect cloud dependency). All reads go through `usePublicClient()` against the public RPC (`https://rpc.mainnet.chain.robinhood.com`).

Every write goes through `useViper`'s `write()` helper (`app/lib/useViper.ts`), which calls
`walletClient.writeContract({ account: address, ... })`. Each call = **one wallet popup**:

| Action | Popups today |
|---|---|
| `join` | 2 — `approve(stakeToken, entryFee)` + `join()`, both `writeContract` via the injected wallet |
| `move(dx,dy)` | 1 per move |
| `plantBomb()` | 1 per bomb |
| `poke()` | 1 per poke |
| `startMatch()` | 1 |

Contract side (`contracts/src/ViperArena.sol`): `join`, `move`, `plantBomb`, `poke` all key off `msg.sender` directly (`joined[msg.sender]`, `alive[msg.sender]`, `px[msg.sender]`…). The contract's ERC-20 surface is a minimal `IERC20` (transfer/transferFrom) — no permit awareness anywhere in the repo (grep for `permit`/`DOMAIN_SEPARATOR`/`nonces` returns nothing).

Controls (`app/components/GameScreen.tsx`): arrows/WASD → `v.move(...)`, Space → `v.plantBomb()`, on-screen buttons for mobile. The keyboard path already calls these fire-and-forget, so a pop-up-free signing path drops straight in.

## 2. EIP-2612 permit — verifiable?

**Short answer: no, the Pons v2 token template does not support permit. Verified against the actual source.**

- The Pons v2 launchpad contracts are open-source at `github.com/ponsdotdev/ponsfamily`. The v2 token, `PonsV2LauncherToken.sol` (`contractsV2/src/v2/`), is:
  ```solidity
  contract PonsV2LauncherToken is ERC20, ERC20Burnable { ... }
  ```
  It imports only `ERC20` and `ERC20Burnable` from OpenZeppelin — **no `ERC20Permit`, no `permit()`, no `DOMAIN_SEPARATOR`, no `nonces()`**. Confirmed by reading the source directly.
- VIPER is not yet launched, so the deployed instance can't be checked. But the factory deploys this template deterministically; unless Pons ships a new factory version before Bobby fills the launch form, the VIPER token will not have permit.
- **Even if it did**, permit would only collapse `approve + join` from 2 popups into 1 signature + 1 tx (the arena would need a new `joinWithPermit(owner, spender, value, deadline, v, r, s)` that calls `token.permit()` then `transferFrom`). It does **nothing** for mid-game moves — those aren't token transfers, they're identity-keyed game actions. Permit is an entry-flow optimization, not a gameplay fix. Out of scope for the real problem.
- Side note: Permit2 exists on Robinhood Chain (facilitators settle through it), but it still needs a one-time on-chain `approve(Permit2)` and only helps token transfers — same non-answer for game actions. Not recommended.

## 3. Recommended: self-funded session key (no relayer, no gas sponsorship)

Player authorizes a browser-held ephemeral key once; the session key pays its own gas from a small native top-up the player sends it. Zero wallet pop-ups mid-game.

### 3a. Entry flow (one-time per match/session)

1. Client generates an ephemeral keypair in the browser: `generatePrivateKey()` → `privateKeyToAccount()` (viem). Held in a React ref (memory).
2. Player's wallet calls **`joinWithSession(address sessionKey, uint64 expiry)`** — one tx, one popup. (Fold session authorization *into* join: join already costs a tx, so authorization is free at the margin.)
3. Player sends a small native top-up to the session key address — one transfer popup (e.g. enough native for ~200–500 moves; calibrate against real L2 gas after deployment).
4. From then on, the client builds, signs, and broadcasts every `move`/`plantBomb` itself via the public RPC (`eth_sendRawTransaction`) using the session key. **No injected-wallet involvement → no pop-ups.**

Pop-up count: entry stays at ~3 (approve, joinWithSession, top-up — same order as today plus one transfer), mid-game drops from N to **zero**.

### 3b. Contract changes (`ViperArena.sol`)

```solidity
struct SessionAuth { address player; uint64 expiry; bool revoked; }
mapping(address sessionKey => SessionAuth) public sessions;

event SessionAuthorized(uint256 indexed matchId, address indexed player, address indexed sessionKey, uint64 expiry);
event SessionRevoked(uint256 indexed matchId, address indexed player, address indexed sessionKey);
```

- `join()` → `joinWithSession(address sessionKey, uint64 expiry)`: existing stake pull from `msg.sender`, plus registry write `sessions[sessionKey] = SessionAuth(msg.sender, expiry, false)`. Keep plain `join()` as a fallback for direct-wallet players.
- Internal `_resolvePlayer(address sender) returns (address)`:
  - if `alive[sender]`/joined directly → sender (legacy path, unchanged behavior);
  - else look up `sessions[sender]`: require `!revoked && block.timestamp <= expiry`, return `.player`; revert otherwise.
- `move`, `plantBomb` use `_resolvePlayer(msg.sender)` instead of raw `msg.sender`. (They mutate `px/py`, bombs, and emit events keyed to the *player* address, so UI and logs stay player-addressed — no client display changes needed.)
- `poke()` stays permissionless and unscoped (it's a keep-alive anyone can call).
- `join`/`startMatch`/any future funds movement **must not** accept session keys — scope is gameplay-only. Enforce by not routing those through `_resolvePlayer`.
- `revokeSession(address sessionKey)`: callable by the registered player (`sessions[k].player == msg.sender`) **and** by the session key itself (`msg.sender == sessionKey`) — self-revoke is a good escape hatch.
- Expiry default: suggest `liveEndsAt`-scoped or a flat window (e.g. 2h from join); on-chain check is `block.timestamp <= expiry`. Expired keys revert with a clear error the client can surface ("session expired — re-authorize").

### 3c. Client changes (`app/`)

- New module (e.g. `lib/session.ts`):
  - `createSession()`: `generatePrivateKey` → account; returns `{ address, signAndSend }`.
  - `createWalletClient({ account: sessionAccount, chain: activeChain, transport: http(rpcUrl) })` for signing + broadcast. Uses the same public RPC as reads (already in `chain.ts`; `NEXT_PUBLIC_LOCAL_RPC` override keeps working for Bobby's remote playtest).
  - Nonce manager: fetch pending nonce once, increment locally per move; on "nonce too low / replacement" errors, resync from chain. (Fast L2 blocks keep the stuck-tx risk low, but don't skip this.)
  - Gas: pre-estimate `move`/`plantBomb` gas once per session, top-up sizing and low-balance warnings ("session gas low") from it.
- `useViper`: add `session` state; `move`/`plantBomb` route through the session signer when a live session exists, else fall back to today's `walletClient.writeContract` path. Keyboard/game controls unchanged — they already call `v.move`/`v.plantBomb`.
- Key storage: **memory-only by default** (React ref; dies with tab close). `sessionStorage` as an opt-in tradeoff if reload-resilience is wanted — flag for decision (see §5).
- UX copy around the top-up: frame it as "dust for gas," show the amount in native terms and estimated move count, one transfer prompt. After top-up confirms, show "fast play enabled — no more pop-ups."
- Auto-cleanup: revoke session on match end (or let it expire); clear key from memory.

### 3d. Security surface

- **Browser key custody.** The session key is a hot key in page JS. XSS or a malicious browser extension = key theft. Mitigations are architectural, not hopeful: (1) the key's on-chain power is scoped to *gameplay actions only* — it cannot move tokens, cannot join, cannot withdraw; (2) the only value at risk is the native gas dust; (3) expiry bounds the window; (4) player or key can revoke on-chain at any time.
- **Scope limits (contract-enforced).** Session keys resolve to a player *only* in `move`/`plantBomb`. Everything funds-related stays wallet-only. A compromised key can play badly on your behalf in one match — that's the entire blast radius.
- **Replay.** Moves are ordinary signed txs with a chain nonce — no signature-replay class beyond normal tx handling. (This is why the one-tx `authorizeSession`-in-`join` is preferred over an EIP-712 delegation scheme, which would need chainId + arena + nonce in the typed data to be safe. Simpler = fewer ways to get it wrong.)
- **Front-running the registration.** `joinWithSession` is atomic (stake + auth in one tx) — no window where a key is authorized but unfunded or vice versa.
- **Griefing via top-up visibility.** Session key addresses become public at join. Anyone can see them; nobody can do anything with that except send them funds. A hostile actor *could* spam moves only with the private key — not obtainable from the address.
- **Expiry vs match length.** If expiry < match end, mid-game reverts brick the player's controls until they re-authorize (a wallet popup mid-match — the thing we're eliminating). Default expiry must comfortably exceed `MAX_MATCH_BLOCKS`; make the client warn before expiry, and prefer generous defaults over tight ones.

## 4. Honest comparison

| | (a) Status quo | (b) Permit one-sig entry | (c) Self-funded session key ✅ | (d) Relayer / gas-sponsored |
|---|---|---|---|---|
| Mid-game pop-ups | 1 per action — unplayable real-time | 1 per action — unchanged | **zero** | zero |
| Entry pop-ups | 2 (approve+join) | 1 sig + 1 tx (if token supported it — it doesn't) | ~3 (approve, join+auth, top-up) | 1–2 |
| Player pays gas | yes, per action | yes | yes (pre-funded dust) | no (sponsor pays) |
| New infra | none | none (needs contract fn) | none | always-on relayer + sponsor wallet + abuse controls |
| Trust model | wallet only | wallet only | browser hot key, tightly scoped | trust the relayer operator |
| Recurring cost | none | none | none (player-funded) | sponsor wallet drain + ops |
| Verdict | fine for lobby/poke, dead for gameplay | **not available** (token lacks permit); wouldn't fix gameplay anyway | **recommended** | powerful, but infra + ongoing funding Javin hasn't asked to run |

**Recommendation: (c).** It's the only option that kills mid-game pop-ups with zero new infrastructure, zero trust in a third party, and zero recurring cost. The price is one extra entry step (the top-up transfer) and a small amount of browser key-custody risk, both bounded by design (scope-limited key, expiry, tiny dust amounts).

## 5. FLAGGED — needs Javin's decision

1. **Session key vs relayer.** Recommend self-funded session key (§3). A relayer would give the slickest UX (no top-up step, sponsor pays gas) but needs an always-on server, a funded sponsor wallet, and anti-abuse controls — real infra and real ongoing cost. Only worth it if the top-up step tests badly with players.
2. **The top-up UX tradeoff.** Entry goes from 2 pop-ups to ~3 (approve, join+auth, top-up). Acceptable? Alternative: arena subsidizes session gas from the 5% protocol fee (a tiny per-session dust grant) — but that's a tokenomics call and reintroduces a funding pool to manage. Default: player-funded; revisit if onboarding friction shows up.
3. **Ephemeral key storage: memory-only vs sessionStorage.** Memory-only (dies on tab close/reload) is safest; sessionStorage survives reloads (nicer if the tab crashes mid-match) but widens the theft window. Pick one.
4. **Session expiry default.** Suggest match-scoped + buffer or flat ~2h. Too short = mid-match re-auth pop-ups (defeats the purpose); too long = wider compromise window. Needs the block-cadence calibration that's already pending before mainnet.
5. **Keep legacy direct-wallet play?** Recommend yes — fallback for cautious players and for `poke`/`startMatch`. Zero cost to keep.
6. **Gas calibration.** Top-up sizing ("≈N moves") needs real numbers from Robinhood Chain mainnet gas for `move`/`plantBomb` after the contract deploys. Can't be set from armchair estimates.

## 6. Suggested build order (when approved)

1. Contract: session registry + `joinWithSession` + `_resolvePlayer` in `move`/`plantBomb` + `revokeSession` + events; Foundry tests (auth, expiry, revocation, scope — session key must not join/move as someone else, expired key reverts).
2. Client: `lib/session.ts` (keygen, session wallet client, nonce manager, gas estimate), `useViper` routing, entry UI (authorize + top-up prompts, "fast play enabled" state).
3. Local anvil E2E: full loop — join with session, fund, play a match with zero pop-ups (scripted), expiry/revoke paths.
4. Mainnet: deploy, calibrate gas/top-up numbers, update `NEXT_PUBLIC_VIPER_ARENA`, playtest.
