#!/usr/bin/env bash
# Deploy the demo to Stellar TESTNET using the identities in .stellar-cli/
# (created by scripts/reset-testnet.sh):
#   1. demo "USDC" issued by `issuer`, wrapped as a Stellar Asset Contract
#   2. trustlines + starting balances
#   3. contracts: ed25519 verifier, spending-limit policy, shop_recycling,
#      airline, museum, user smart wallet (OpenZeppelin smart account)
#   4. demo data: products, flights, museum slots, government subsidy pool
#   5. writes config/contracts.ts (public IDs, committed)
set -euo pipefail

cd "$(dirname "$0")/.."

NETWORK="testnet" # TESTNET ONLY
CFG=(--config-dir .stellar-cli)
NET=(--network "$NETWORK")
WASM_DIR="contracts/target/wasm32v1-none/release"
RPC_URL="https://soroban-testnet.stellar.org"

U=10000000 # 1 USDC = 10^7 stroops

addr() { stellar "${CFG[@]}" keys address "$1"; }
# ed25519 public key (hex) of an identity, for External smart-account signers
pubhex() { node -e 'const {StrKey}=require("@stellar/stellar-sdk");console.log(Buffer.from(StrKey.decodeEd25519PublicKey(process.argv[1])).toString("hex"))' "$1"; }
invoke() { # invoke <source> <contract-id> -- fn args...
  local source="$1" id="$2"
  shift 2
  stellar "${CFG[@]}" contract invoke "${NET[@]}" -q --source "$source" --id "$id" "$@"
}
deploy() { # deploy <source> <wasm-name> [-- constructor args]
  local source="$1" wasm="$2"
  shift 2
  stellar "${CFG[@]}" contract deploy "${NET[@]}" -q --source "$source" --wasm "$WASM_DIR/$wasm.wasm" "$@"
}
step() { echo "-> $*"; }

ISSUER=$(addr issuer)
GOV=$(addr government)
SHOP=$(addr shop)
AIRLINE=$(addr airline)
MUSEUM=$(addr museum)
RECYCLER=$(addr recycler)
ORACLE=$(addr oracle)
USER_G=$(addr user)
AGENT=$(addr agent)
ASSET="USDC:$ISSUER"

START_LEDGER=$(curl -s "$RPC_URL" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.sequence))')
echo "Start ledger: $START_LEDGER"

step "building contracts"
(cd contracts && stellar contract build -q)

step "demo USDC: deploying Stellar Asset Contract for $ASSET"
USDC=$(stellar "${CFG[@]}" contract asset deploy "${NET[@]}" -q --source issuer --asset "$ASSET" 2>/dev/null ||
  stellar "${CFG[@]}" contract id asset "${NET[@]}" --asset "$ASSET")
echo "   $USDC"

step "trustlines for government, shop, airline, museum"
for who in government shop airline museum; do
  stellar "${CFG[@]}" tx new change-trust "${NET[@]}" -q --source "$who" --line "$ASSET" >/dev/null
done

step "government receives 1000 USDC"
stellar "${CFG[@]}" tx new payment "${NET[@]}" -q --source issuer --destination "$GOV" --asset "$ASSET" --amount $((1000 * U)) >/dev/null

step "deploying ed25519 verifier + spending-limit policy"
VERIFIER=$(deploy issuer ed25519_verifier)
POLICY=$(deploy issuer spending_limit_policy)

step "deploying shop_recycling (credit 0.50 USDC per bottle)"
SHOP_C=$(deploy issuer shop_recycling -- --shop "$SHOP" --government "$GOV" --recycler "$RECYCLER" --token "$USDC" --credit_per_bottle $((U / 2)))

step "deploying airline (20% held until landing)"
AIRLINE_C=$(deploy issuer airline -- --airline "$AIRLINE" --oracle "$ORACLE" --token "$USDC" --hold_bps 2000)

step "deploying museum (18 USDC per entry)"
MUSEUM_C=$(deploy issuer museum -- --museum "$MUSEUM" --token "$USDC" --price $((18 * U)))

step "deploying user smart wallet (limit 300 USDC per day, set by the user)"
WALLET=$(deploy issuer smart_wallet -- \
  --owner "{\"External\":[\"$VERIFIER\",\"$(pubhex "$USER_G")\"]}" \
  --agent "{\"External\":[\"$VERIFIER\",\"$(pubhex "$AGENT")\"]}" \
  --usdc "$USDC" \
  --spending_policy "$POLICY" \
  --spending_limit $((300 * U)) \
  --period_ledgers 17280 \
  --apps "[\"$SHOP_C\",\"$AIRLINE_C\",\"$MUSEUM_C\"]")

step "minting 500 USDC to the user wallet"
invoke issuer "$USDC" -- mint --to "$WALLET" --amount $((500 * U)) >/dev/null

step "government funds the recycling pool with 100 USDC"
invoke government "$SHOP_C" -- fund_pool --amount $((100 * U)) >/dev/null

step "shop products"
add_product() { invoke shop "$SHOP_C" -- add_product --id "$1" --name "$2" --price "$3" --sustainable "$4" --bottle "$5" >/dev/null; }
add_product water "Water bottle" $((2 * U)) false true
add_product bamboo "Bamboo bottle" $((12 * U)) true false
add_product tote "Recycled tote bag" $((8 * U)) true false
add_product sandwich "Sandwich" $((45 * U / 10)) false false
add_product chocolate "Chocolate" $((3 * U)) false false

step "airline flights"
add_flight() { invoke airline "$AIRLINE_C" -- add_flight --id "$1" --code "$1" --from "$2" --to "$3" --depart "$4" --arrive "$5" --price "$6" >/dev/null; }
add_flight TP432 LIS CDG 600 815 $((120 * U))
add_flight TP438 LIS CDG 900 1115 $((95 * U))
add_flight TP650 LIS AMS 660 880 $((110 * U))

step "museum slots (10:00-18:00 every 30 min) for today and tomorrow"
TIMES="[$(seq 600 30 1080 | paste -sd, -)]"
for offset in 0 1; do
  DATE=$(TZ=Europe/Lisbon date -v+${offset}d +%Y%m%d)
  invoke museum "$MUSEUM_C" -- set_slots --date "$DATE" --times "$TIMES" --capacity 20 >/dev/null
done

step "writing config/contracts.ts"
cat > config/contracts.ts <<EOF
// PUBLIC testnet contract IDs. Generated by scripts/deploy-contracts.sh; do not edit by hand.
export const RPC_URL = "$RPC_URL";
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

/** Ledger at deploy time: contract events are read from here on. */
export const START_LEDGER = $START_LEDGER;

export const USDC = {
  code: "USDC",
  issuer: "$ISSUER",
  contract: "$USDC",
  decimals: 7,
} as const;

export const CONTRACTS = {
  shop: "$SHOP_C",
  airline: "$AIRLINE_C",
  museum: "$MUSEUM_C",
  wallet: "$WALLET",
  spendingPolicy: "$POLICY",
  verifier: "$VERIFIER",
} as const;

/** Smart wallet context rule IDs (see contracts/smart-wallet). */
export const WALLET_RULES = {
  owner: 0,
  usdc: 1,
  shop: 2,
  airline: 3,
  museum: 4,
} as const;
EOF

echo "Deployed. Wallet: $WALLET"
