#!/usr/bin/env bash
#
# Viper mainnet launch — one-click deploy of every arcade game contract
# to Robinhood Chain MAINNET (chain 4663).
#
#   Export the env vars (see "INPUTS" below), then run:
#       bash scripts/launch-mainnet.sh
#
#   DO NOT RUN until: (1) every game branch is merged to `main`
#   (Javin's explicit word needed for each merge), (2) Bobby has launched
#   VIPER via Pons and handed over the token address, (3) the treasury
#   address and per-game entry fees are decided.
#
#   This script is NEVER run on testnet — it refuses to talk to any
#   chain whose chainId is not 4663.
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
: "${TREASURY:?TREASURY is required — mainnet treasury address}"
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is required — deployer key with mainnet ETH (env var only, never a file)}"

# Optional: network
MAINNET_RPC="${MAINNET_RPC:-https://rpc.mainnet.chain.robinhood.com}"
EXPECTED_CHAIN_ID="${EXPECTED_CHAIN_ID:-4663}"

# Optional: per-game entry fees, in decimal VIPER (converted to wei internally).
FEE_ARENA="${FEE_ARENA:-1}"
FEE_SNAKE="${FEE_SNAKE:-1}"
FEE_CHESS="${FEE_CHESS:-1}"
FEE_SQUAD="${FEE_SQUAD:-1}"
FEE_SL="${FEE_SL:-1}"

# Optional: game-specific params (defaults = what was playtested on testnet)
ARENA_FUSE_BLOCKS="${ARENA_FUSE_BLOCKS:-30}"
ARENA_MAX_MATCH_BLOCKS="${ARENA_MAX_MATCH_BLOCKS:-3000}"
SNAKE_MATCH_TICKS="${SNAKE_MATCH_TICKS:-3000}"
CHESS_MOVE_TIMEOUT="${CHESS_MOVE_TIMEOUT:-300}"
CHESS_MAX_PLYS="${CHESS_MAX_PLYS:-300}"
SQUAD_MAX_PLAYERS="${SQUAD_MAX_PLAYERS:-32}"
SQUAD_MIN_PLAYERS="${SQUAD_MIN_PLAYERS:-4}"
SQUAD_ROUND_DURATION="${SQUAD_ROUND_DURATION:-45}"
SQUAD_PASS_NFT="${SQUAD_PASS_NFT:-0x0000000000000000000000000000000000000000}"
SQUAD_PASS_FEE_VIPER="${SQUAD_PASS_FEE_VIPER:-0}"

# Optional: Double or Nothing bankroll (decimal VIPER). 0 = deploy but skip
# funding — the bankroll can be topped up later via fund().
DON_BANKROLL="${DON_BANKROLL:-0}"

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

# ---------------- SAFETY GATES ----------------
log "Checking chain at $MAINNET_RPC ..."
CHAIN_ID="$(cast chain-id --rpc-url "$MAINNET_RPC")"
if [ "$CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]; then
  echo "error: chainId $CHAIN_ID != expected $EXPECTED_CHAIN_ID — refusing (this script is mainnet-only)" >&2
  exit 1
fi
log "Chain OK: $CHAIN_ID"

DEPLOYER="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
log "Deployer: $DEPLOYER"
log "VIPER:    $VIPER_TOKEN"
log "Treasury: $TREASURY"

# Every game contract must exist in this tree (i.e. all branches merged to main).
for f in \
  "contracts/src/${CONTRACT_ARENA}.sol" \
  "contracts/src/${CONTRACT_SNAKE}.sol" \
  "contracts/src/${CONTRACT_CHESS}.sol" \
  "contracts/src/${CONTRACT_SQUAD}.sol" \
  "contracts/src/${CONTRACT_DON}.sol" \
  "contracts/src/${CONTRACT_SL}.sol" ; do
  if [ ! -f "$f" ]; then
    echo "error: missing $f — the corresponding game branch has not been merged to main yet" >&2
    exit 1
  fi
done
log "All six contract sources present"

if [ "$LAUNCH_YES" != "1" ]; then
  echo ""
  echo "This will deploy ALL SIX Viper game contracts to Robinhood Chain MAINNET."
  echo "Entry fees (VIPER): arena=$FEE_ARENA snake=$FEE_SNAKE chess=$FEE_CHESS squad=$FEE_SQUAD sl=$FEE_SL"
  echo "DON bankroll: $DON_BANKROLL VIPER | Squad pass NFT: $SQUAD_PASS_NFT"
  read -rp "Type DEPLOY to continue: " CONFIRM
  [ "$CONFIRM" = "DEPLOY" ] || { echo "aborted"; exit 1; }
fi

# ---------------- BUILD ----------------
log "Compiling..."
forge build --root contracts

# ---------------- DEPLOY HELPERS ----------------
deploy() {
  # deploy <key> <contract-name> [ctor args...]
  local key="$1" name="$2"; shift 2
  log "Deploying $name ..."
  local out
  out="$(forge create "src/${name}.sol:${name}" \
    --rpc-url "$MAINNET_RPC" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
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
  ADDR[$key]="$addr"
  TX[$key]="$tx"
  log "$name -> $addr (tx $tx)"
  if [ -n "$BLOCKSCOUT_API_URL" ]; then
    log "Verifying $name on Blockscout (best-effort)..."
    forge verify-contract "$addr" "$name" \
      --chain-id "$CHAIN_ID" \
      --verifier blockscout \
      --verifier-url "$BLOCKSCOUT_API_URL" \
      --constructor-args "$(cast abi-encode "constructor(...)" 2>/dev/null || echo "")" \
      >/dev/null 2>&1 \
      && log "verified $name" \
      || log "WARNING: Blockscout verification for $name failed — verify manually later"
  fi
}

# ---------------- DEPLOYS ----------------
deploy arena "$CONTRACT_ARENA" \
  "$VIPER_TOKEN" "$(cast to-wei "$FEE_ARENA")" "$TREASURY" "$ARENA_FUSE_BLOCKS" "$ARENA_MAX_MATCH_BLOCKS"

deploy snake "$CONTRACT_SNAKE" \
  "$VIPER_TOKEN" "$(cast to-wei "$FEE_SNAKE")" "$TREASURY" "$SNAKE_MATCH_TICKS"

deploy chess "$CONTRACT_CHESS" \
  "$VIPER_TOKEN" "$(cast to-wei "$FEE_CHESS")" "$TREASURY" "$CHESS_MOVE_TIMEOUT" "$CHESS_MAX_PLYS"

deploy squad "$CONTRACT_SQUAD" \
  "$VIPER_TOKEN" "$(cast to-wei "$FEE_SQUAD")" "$TREASURY" \
  "$SQUAD_MAX_PLAYERS" "$SQUAD_MIN_PLAYERS" "$SQUAD_ROUND_DURATION" \
  "$SQUAD_PASS_NFT" "$(cast to-wei "$SQUAD_PASS_FEE_VIPER")"

deploy don "$CONTRACT_DON" \
  "$VIPER_TOKEN" "$TREASURY"

deploy sl "$CONTRACT_SL" \
  "$VIPER_TOKEN" "$(cast to-wei "$FEE_SL")" "$TREASURY"

# ---------------- DON BANKROLL ----------------
if [ "$(echo "$DON_BANKROLL" | tr -d '0. ')" != "" ]; then
  BANKROLL_WEI="$(cast to-wei "$DON_BANKROLL")"
  BAL="$(cast call "$VIPER_TOKEN" "balanceOf(address)" "$DEPLOYER" --rpc-url "$MAINNET_RPC")"
  if [ "$(cast to-dec "$BAL")" -ge "$BANKROLL_WEI" ] 2>/dev/null; then
    log "Approving + funding Double or Nothing bankroll ($DON_BANKROLL VIPER)..."
    cast send "$VIPER_TOKEN" "approve(address,uint256)" "${ADDR[don]}" "$BANKROLL_WEI" \
      --rpc-url "$MAINNET_RPC" --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null
    cast send "${ADDR[don]}" "fund(uint256)" "$BANKROLL_WEI" \
      --rpc-url "$MAINNET_RPC" --private-key "$DEPLOYER_PRIVATE_KEY" >/dev/null
    log "Bankroll funded"
  else
    log "WARNING: deployer VIPER balance too low for bankroll ($DON_BANKROLL) — skipping; fund later via fund()"
  fi
else
  log "DON_BANKROLL=0 — skipping bankroll funding (top up later via fund())"
fi

# ---------------- RECORD ----------------
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$OUT_JSON" <<EOF
{
  "chainId": $CHAIN_ID,
  "rpc": "$MAINNET_RPC",
  "viperToken": "$VIPER_TOKEN",
  "treasury": "$TREASURY",
  "deployer": "$DEPLOYER",
  "deployedAt": "$TS",
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
echo "NEXT_PUBLIC_VIPER_TOKEN=${VIPER_TOKEN}"
echo "NEXT_PUBLIC_VIPER_ARENA=${ADDR[arena]}"
echo "NEXT_PUBLIC_VIPER_SNAKE=${ADDR[snake]}"
echo "NEXT_PUBLIC_VIPER_CHESS=${ADDR[chess]}"
echo "NEXT_PUBLIC_VIPER_SQUAD_GAME=${ADDR[squad]}"
echo "NEXT_PUBLIC_VIPER_DOUBLE_OR_NOTHING=${ADDR[don]}"
echo "NEXT_PUBLIC_VIPER_SNAKES_LADDERS=${ADDR[sl]}"
echo "==================================================================="
echo ""
log "Launch complete. Addresses saved in $OUT_JSON"
