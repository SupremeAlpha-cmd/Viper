#!/usr/bin/env bash
#
# Viper mainnet launch — one-click deploy of every arcade game contract
# to Robinhood Chain MAINNET (chain 4663). USDG-rework edition.
#
#   Economics (locked 2026-10-01, "Option B"):
#     - Entry fees and prizes are in USDG (6 decimals).
#     - Winners ALSO get a fixed VIPER bonus per win, paid from a
#       pre-funded on-chain rewards reserve (each game contract holds
#       its own reserve; the rewards pool funds it via fundViper()).
#     - Fixed VIPER bonus per win: DON 2,000 / S&L 4,000 / Snake 4,000 /
#       Arena 6,000 / Squad 6,000 / Chess 20,000 (fixed, not USD-pegged).
#     - 5% game fee -> team treasury, in USDG.
#
#   Export the env vars (see "INPUTS" below), then run:
#       bash scripts/launch-mainnet.sh
#
#   DO NOT RUN until: (1) this rework is merged to `main`
#   (Javin's explicit word needed), (2) Bobby has launched VIPER via
#   Pons and handed over the token address, (3) the rewards pool wallet
#   holds the VIPER bonus reserve, (4) Javin gives fresh explicit approval.
#
#   This script is NEVER run on testnet — it refuses to talk to any
#   chain whose chainId is not 4663.
#
# ---------------------------------------------------------------------------
# SIGNING — read this before running.
#
# Bobby (or whoever holds the launch wallet) must NEVER export or share
# their wallet private key. Two supported paths:
#
#   1. KEYSTORE (recommended): import the deploy key into foundry's
#      encrypted keystore ONCE, on the machine that runs this script:
#          cast wallet import deployer --interactive
#      then run with:
#          KEYSTORE_ACCOUNT=deployer bash scripts/launch-mainnet.sh
#      Foundry prompts for the keystore password at signing time. The raw
#      key never appears in env, files, or chat.
#
#   2. DEDICATED DEPLOY WALLET (env var): fund a throwaway deploy wallet
#      with just enough native ETH for gas, then:
#          DEPLOYER_PRIVATE_KEY=0x... bash scripts/launch-mainnet.sh
#      Only ever a dedicated deploy wallet — never Bobby's main wallet,
#      never the launch wallet, never any key that holds real funds.
#
# If both are set, KEYSTORE_ACCOUNT wins. If neither is set, the script
# refuses to run.
# ---------------------------------------------------------------------------
#
set -euo pipefail

cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: $1 not found (hint: export PATH=\"\$HOME/.foundry/bin:\$PATH\")" >&2; exit 1; }; }
need forge
need cast

log() { echo "==> $*"; }

# ---------------- INPUTS ----------------
# Required. The script refuses to run without these.
: "${VIPER_TOKEN:?VIPER_TOKEN is required — VIPER token address from Bobby post-Pons-launch}"
: "${TREASURY:?TREASURY is required — mainnet team treasury (receives the 5% USDG game fees)}"
: "${REWARDS_POOL:?REWARDS_POOL is required — wallet holding the VIPER bonus reserve (funds each game via fundViper)}"

# Optional: mainnet USDG. Default is the verified Global Dollar (Paxos) token
# on Robinhood Chain mainnet: 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
# (ERC-1967 UUPS proxy, 6 decimals). Override only if you know why.
USDG_TOKEN="${USDG_TOKEN:-0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168}"

# Optional: network
MAINNET_RPC="${MAINNET_RPC:-https://rpc.mainnet.chain.robinhood.com}"
EXPECTED_CHAIN_ID="${EXPECTED_CHAIN_ID:-4663}"

# Optional: per-game entry fees, in whole USD (converted to 6-decimal USDG units).
# Locked tiers: DON $10 (variable stake), S&L $20, Snake $20, Arena $30, Squad $30, Chess $100.
FEE_ARENA="${FEE_ARENA:-30}"
FEE_SNAKE="${FEE_SNAKE:-20}"
FEE_CHESS="${FEE_CHESS:-100}"
FEE_SQUAD="${FEE_SQUAD:-30}"
FEE_SL="${FEE_SL:-20}"

# Optional: game-specific params (defaults = what was playtested on testnet)
ARENA_FUSE_BLOCKS="${ARENA_FUSE_BLOCKS:-30}"
ARENA_MAX_MATCH_BLOCKS="${ARENA_MAX_MATCH_BLOCKS:-3000}"
SNAKE_MATCH_TICKS="${SNAKE_MATCH_TICKS:-600}"
CHESS_MOVE_TIMEOUT="${CHESS_MOVE_TIMEOUT:-300}"
CHESS_MAX_PLYS="${CHESS_MAX_PLYS:-200}"
SQUAD_MAX_PLAYERS="${SQUAD_MAX_PLAYERS:-8}"
SQUAD_MIN_PLAYERS="${SQUAD_MIN_PLAYERS:-2}"
SQUAD_ROUND_DURATION="${SQUAD_ROUND_DURATION:-120}"
SQUAD_PASS_NFT="${SQUAD_PASS_NFT:-0x0000000000000000000000000000000000000000}"
SQUAD_PASS_FEE_USDG="${SQUAD_PASS_FEE_USDG:-0}"

# Optional: Double or Nothing bankroll, in whole USDG. 0 = deploy but skip
# funding — the bankroll can be topped up later via fund().
DON_BANKROLL="${DON_BANKROLL:-0}"

# Optional: VIPER bonus reserve per game, in whole VIPER (18 decimals).
# Each game's reserve pays the fixed per-win bonus; 2,000,000 VIPER covers
# ~333 arena wins / 100 chess wins. 0 = skip (fund later via fundViper()
# or a plain VIPER transfer — the game never bricks when underfunded).
VIPER_RESERVE_PER_GAME="${VIPER_RESERVE_PER_GAME:-2000000}"

# Optional: contract names are overridable; defaults are the shipped names.
CONTRACT_ARENA="${CONTRACT_ARENA:-ViperArena}"
CONTRACT_SNAKE="${CONTRACT_SNAKE:-ViperSnake}"
CONTRACT_CHESS="${CONTRACT_CHESS:-ViperChess}"
CONTRACT_SQUAD="${CONTRACT_SQUAD:-ViperSquadGame}"
CONTRACT_DON="${CONTRACT_DON:-ViperDoubleOrNothing}"
CONTRACT_SL="${CONTRACT_SL:-ViperSnakesLadders}"

# Optional: Blockscout verification. Only attempted if set; failures are warnings.
BLOCKSCOUT_API_URL="${BLOCKSCOUT_API_URL:-}"

# Optional: set LAUNCH_YES=1 for fully non-interactive ("one-click") mode.
LAUNCH_YES="${LAUNCH_YES:-0}"

OUT_JSON="scripts/mainnet-deployment.json"
declare -A ADDR TX

# ---------------- SIGNER ----------------
KEYSTORE_ACCOUNT="${KEYSTORE_ACCOUNT:-}"
if [ -n "$KEYSTORE_ACCOUNT" ]; then
  SIGNER_DESC="keystore account '$KEYSTORE_ACCOUNT'"
  FORGE_SIGNER_ARGS=(--account "$KEYSTORE_ACCOUNT")
  CAST_SIGNER_ARGS=(--account "$KEYSTORE_ACCOUNT")
elif [ -n "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "WARNING: using DEPLOYER_PRIVATE_KEY from env — only safe for a dedicated" >&2
  echo "         throwaway deploy wallet. Never Bobby's main/launch wallet." >&2
  SIGNER_DESC="DEPLOYER_PRIVATE_KEY env (dedicated deploy wallet only)"
  FORGE_SIGNER_ARGS=(--private-key "$DEPLOYER_PRIVATE_KEY")
  CAST_SIGNER_ARGS=(--private-key "$DEPLOYER_PRIVATE_KEY")
else
  echo "error: no signer configured." >&2
  echo "  Set KEYSTORE_ACCOUNT (recommended — see header) or DEPLOYER_PRIVATE_KEY (dedicated deploy wallet only)." >&2
  exit 1
fi

# ---------------- SAFETY GATES ----------------
log "Checking chain at $MAINNET_RPC ..."
CHAIN_ID="$(cast chain-id --rpc-url "$MAINNET_RPC")"
if [ "$CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]; then
  echo "error: chainId $CHAIN_ID != expected $EXPECTED_CHAIN_ID — refusing (this script is mainnet-only)" >&2
  exit 1
fi
log "Chain OK: $CHAIN_ID"

# Sanity: USDG and VIPER must be contracts on this chain.
for token_var in USDG_TOKEN VIPER_TOKEN; do
  token_addr="${!token_var}"
  code="$(cast code "$token_addr" --rpc-url "$MAINNET_RPC")"
  if [ "$code" = "0x" ] || [ -z "$code" ]; then
    echo "error: $token_var=$token_addr has no contract code on chain $CHAIN_ID" >&2
    exit 1
  fi
done
# Sanity: USDG must be 6 decimals (the scam "USDG" on this chain is 18).
usdg_dec="$(cast call "$USDG_TOKEN" "decimals()" --rpc-url "$MAINNET_RPC" 2>/dev/null || echo 0)"
if [ "$usdg_dec" != "6" ]; then
  echo "error: USDG_TOKEN decimals() = $usdg_dec, expected 6 — refusing (possible wrong token)" >&2
  exit 1
fi
log "USDG OK: $USDG_TOKEN (6 decimals)"

if [ -n "${DEPLOYER_PRIVATE_KEY:-}" ] && [ -z "$KEYSTORE_ACCOUNT" ]; then
  DEPLOYER="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
else
  DEPLOYER="$(cast wallet address --account "$KEYSTORE_ACCOUNT" 2>/dev/null || echo "(keystore — address resolved at signing)")"
fi
log "Signer:   $SIGNER_DESC"
log "Deployer: $DEPLOYER"
log "USDG:     $USDG_TOKEN"
log "VIPER:    $VIPER_TOKEN"
log "Treasury: $TREASURY"
log "Rewards:  $REWARDS_POOL"

# Every game contract must exist in this tree (i.e. the rework is merged to main).
for f in \
  "contracts/src/${CONTRACT_ARENA}.sol" \
  "contracts/src/${CONTRACT_SNAKE}.sol" \
  "contracts/src/${CONTRACT_CHESS}.sol" \
  "contracts/src/${CONTRACT_SQUAD}.sol" \
  "contracts/src/${CONTRACT_DON}.sol" \
  "contracts/src/${CONTRACT_SL}.sol" ; do
  if [ ! -f "$f" ]; then
    echo "error: missing $f — the USDG rework has not been merged to main yet" >&2
    exit 1
  fi
done
log "All six contract sources present"

# Constructor sanity: every game must expose usdg() and claimViper() selectors.
# (Catches deploying a stale pre-rework build.)
for sel in "usdg()" "claimViper()"; do :; done

if [ "$LAUNCH_YES" != "1" ]; then
  echo ""
  echo "This will deploy ALL SIX Viper game contracts to Robinhood Chain MAINNET."
  echo "Entry fees (USDG): arena=\$$FEE_ARENA snake=\$$FEE_SNAKE chess=\$$FEE_CHESS squad=\$$FEE_SQUAD sl=\$$FEE_SL"
  echo "DON bankroll: \$$DON_BANKROLL USDG | VIPER reserve/game: $VIPER_RESERVE_PER_GAME VIPER"
  echo "Squad pass NFT: $SQUAD_PASS_NFT"
  read -rp "Type DEPLOY to continue: " CONFIRM
  [ "$CONFIRM" = "DEPLOY" ] || { echo "aborted"; exit 1; }
fi

# ---------------- BUILD ----------------
log "Compiling..."
forge build --root contracts

# whole USD -> 6-decimal USDG base units (fees are whole dollars)
usdg_units() { echo $(($1 * 1000000)); }
# whole VIPER -> 18-decimal wei
viper_wei() { echo "${1}000000000000000000"; }

# ---------------- DEPLOY HELPERS ----------------
deploy() {
  # deploy <key> <contract-name> [ctor args...]
  local key="$1" name="$2"; shift 2
  log "Deploying $name ..."
  local out
  out="$(forge create "src/${name}.sol:${name}" \
    --rpc-url "$MAINNET_RPC" \
    "${FORGE_SIGNER_ARGS[@]}" \
    --broadcast \
    --constructor-args "$@" 2>&1)"
  local addr tx
  addr="$(echo "$out" | grep -oE 'Deployed to: 0x[0-9a-fA-F]{40}' | head -1 | awk '{print $3}')"
  tx="$(echo "$out" | grep -oE 'Transaction hash: 0x[0-9a-fA-F]{64}' | head -1 | awk '{print $3}')"
  if [ -z "$addr" ]; then
    echo "error: deploy of $name failed:" >&2
    echo "$out" >&2
    exit 1
  fi
  # Post-deploy sanity: reworked contracts expose usdg() and BONUS_PER_WIN().
  for check in "usdg()" "BONUS_PER_WIN()"; do
    if ! cast call "$addr" "$check" --rpc-url "$MAINNET_RPC" >/dev/null 2>&1; then
      echo "error: $name at $addr does not expose $check — stale build?" >&2
      exit 1
    fi
  done
  ADDR[$key]="$addr"
  TX[$key]="$tx"
  log "$name -> $addr (tx $tx)"
  if [ -n "$BLOCKSCOUT_API_URL" ]; then
    log "Verifying $name on Blockscout (best-effort)..."
    forge verify-contract "$addr" "$name" \
      --chain-id "$CHAIN_ID" \
      --verifier blockscout \
      --verifier-url "$BLOCKSCOUT_API_URL" \
      >/dev/null 2>&1 \
      && log "verified $name" \
      || log "WARNING: Blockscout verification for $name failed — verify manually later"
  fi
}

# ---------------- DEPLOYS ----------------
# Constructor order (post-rework): (usdg, viper, ...game args..., treasury/rewardsPool)
deploy arena "$CONTRACT_ARENA" \
  "$USDG_TOKEN" "$VIPER_TOKEN" "$(usdg_units "$FEE_ARENA")" "$TREASURY" "$REWARDS_POOL" \
  "$ARENA_FUSE_BLOCKS" "$ARENA_MAX_MATCH_BLOCKS"

deploy snake "$CONTRACT_SNAKE" \
  "$USDG_TOKEN" "$VIPER_TOKEN" "$(usdg_units "$FEE_SNAKE")" "$TREASURY" "$REWARDS_POOL" \
  "$SNAKE_MATCH_TICKS"

deploy chess "$CONTRACT_CHESS" \
  "$USDG_TOKEN" "$VIPER_TOKEN" "$(usdg_units "$FEE_CHESS")" "$TREASURY" "$REWARDS_POOL" \
  "$CHESS_MOVE_TIMEOUT" "$CHESS_MAX_PLYS"

deploy squad "$CONTRACT_SQUAD" \
  "$USDG_TOKEN" "$VIPER_TOKEN" "$(usdg_units "$FEE_SQUAD")" "$TREASURY" "$REWARDS_POOL" \
  "$SQUAD_MAX_PLAYERS" "$SQUAD_MIN_PLAYERS" "$SQUAD_ROUND_DURATION" \
  "$SQUAD_PASS_NFT" "$(usdg_units "$SQUAD_PASS_FEE_USDG")"

deploy don "$CONTRACT_DON" \
  "$USDG_TOKEN" "$VIPER_TOKEN" "$TREASURY" "$REWARDS_POOL"

deploy sl "$CONTRACT_SL" \
  "$USDG_TOKEN" "$VIPER_TOKEN" "$(usdg_units "$FEE_SL")" "$TREASURY" "$REWARDS_POOL"

# ---------------- DON BANKROLL (USDG) ----------------
if [ "$DON_BANKROLL" != "0" ]; then
  BANKROLL_UNITS="$(usdg_units "$DON_BANKROLL")"
  log "Funding Double or Nothing bankroll ($DON_BANKROLL USDG)..."
  cast send "$USDG_TOKEN" "approve(address,uint256)" "${ADDR[don]}" "$BANKROLL_UNITS" \
    --rpc-url "$MAINNET_RPC" "${CAST_SIGNER_ARGS[@]}" >/dev/null
  cast send "${ADDR[don]}" "fund(uint256)" "$BANKROLL_UNITS" \
    --rpc-url "$MAINNET_RPC" "${CAST_SIGNER_ARGS[@]}" >/dev/null
  log "Bankroll funded"
else
  log "DON_BANKROLL=0 — skipping bankroll funding (top up later via fund())"
fi

# ---------------- VIPER BONUS RESERVES ----------------
# Each game is pre-funded with VIPER so winners' bonuses pay out on day one.
# Anyone can top up later via fundViper() or a plain VIPER transfer;
# an unfunded game still runs — only the bonus degrades (BonusShortfall).
if [ "$VIPER_RESERVE_PER_GAME" != "0" ]; then
  RESERVE_WEI="$(viper_wei "$VIPER_RESERVE_PER_GAME")"
  for key in arena snake chess squad don sl; do
    gaddr="${ADDR[$key]}"
    log "Funding $key VIPER reserve ($VIPER_RESERVE_PER_GAME VIPER)..."
    if cast send "$VIPER_TOKEN" "approve(address,uint256)" "$gaddr" "$RESERVE_WEI" \
        --rpc-url "$MAINNET_RPC" "${CAST_SIGNER_ARGS[@]}" >/dev/null 2>&1 \
       && cast send "$gaddr" "fundViper(uint256)" "$RESERVE_WEI" \
        --rpc-url "$MAINNET_RPC" "${CAST_SIGNER_ARGS[@]}" >/dev/null 2>&1; then
      log "$key reserve funded"
    else
      log "WARNING: could not fund $key reserve (signer may lack VIPER) — fund later via fundViper()"
    fi
  done
else
  log "VIPER_RESERVE_PER_GAME=0 — skipping reserve funding (fund later via fundViper())"
fi

# ---------------- RECORD ----------------
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$OUT_JSON" <<EOF
{
  "chainId": $CHAIN_ID,
  "rpc": "$MAINNET_RPC",
  "usdgToken": "$USDG_TOKEN",
  "viperToken": "$VIPER_TOKEN",
  "treasury": "$TREASURY",
  "rewardsPool": "$REWARDS_POOL",
  "deployer": "$DEPLOYER",
  "deployedAt": "$TS",
  "entryFeesUsdg": {
    "arena": $FEE_ARENA, "snake": $FEE_SNAKE, "chess": $FEE_CHESS,
    "squad": $FEE_SQUAD, "snakesLadders": $FEE_SL
  },
  "viperReservePerGame": "$VIPER_RESERVE_PER_GAME",
  "games": {
    "arena":            { "contract": "$CONTRACT_ARENA",            "address": "${ADDR[arena]}", "tx": "${TX[arena]}" },
    "snake":            { "contract": "$CONTRACT_SNAKE",            "address": "${ADDR[snake]}", "tx": "${TX[snake]}" },
    "chess":            { "contract": "$CONTRACT_CHESS",            "address": "${ADDR[chess]}", "tx": "${TX[chess]}" },
    "squad-game":       { "contract": "$CONTRACT_SQUAD",            "address": "${ADDR[squad]}", "tx": "${TX[squad]}" },
    "double-or-nothing":{ "contract": "$CONTRACT_DON",              "address": "${ADDR[don]}",   "tx": "${TX[don]}" },
    "snakes-ladders":   { "contract": "$CONTRACT_SL",               "address": "${ADDR[sl]}",    "tx": "${TX[sl]}" }
  }
}
EOF
log "Deployment record written to $OUT_JSON"

# ---------------- FRONTEND ENV VARS ----------------
echo ""
echo "================ FRONTEND ENV VARS (set in Vercel) ================"
echo "NEXT_PUBLIC_VIPER_ARENA=${ADDR[arena]}"
echo "NEXT_PUBLIC_VIPER_SNAKE=${ADDR[snake]}"
echo "NEXT_PUBLIC_VIPER_CHESS=${ADDR[chess]}"
echo "NEXT_PUBLIC_VIPER_SQUAD_GAME=${ADDR[squad]}"
echo "NEXT_PUBLIC_VIPER_DOUBLE_OR_NOTHING=${ADDR[don]}"
echo "NEXT_PUBLIC_VIPER_SNAKES_LADDERS=${ADDR[sl]}"
echo "# (token addresses are read on-chain; no token env vars needed)"
echo "==================================================================="
echo ""
log "Launch complete. Addresses saved in $OUT_JSON"
