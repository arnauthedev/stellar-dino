#!/usr/bin/env bash
# Deploy the demo to Stellar TESTNET using the identities in .stellar-cli/
# (created by scripts/reset-testnet.sh):
#   1. demo "USDC" issued by `issuer`, wrapped as a Stellar Asset Contract
#   2. trustlines + starting balances
#   3. contracts: ed25519 verifier, spending-limit policy, shop_recycling,
#      airline, museum, user smart wallet (OpenZeppelin smart account)
#   4. demo data: products, flight timetable, museums, government subsidy pool
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

step "deploying museum (Lisbon museums, default 10:00-18:00 slots every day)"
MUSEUM_C=$(deploy issuer museum -- --museum "$MUSEUM" --token "$USDC")

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

step "Skyscannerd timetable (every route flies every day)"
# route <code> <from> <to> <from_city> <to_city> <depart HH:MM> <arrive HH:MM> <price USDC>
ROUTES=()
route() {
  local dep=$((10#${6%%:*} * 60 + 10#${6##*:})) arr=$((10#${7%%:*} * 60 + 10#${7##*:}))
  ROUTES+=("{\"code\":\"$1\",\"from\":\"$2\",\"to\":\"$3\",\"from_city\":\"$4\",\"to_city\":\"$5\",\"depart\":$dep,\"arrive\":$arr,\"price\":\"$(($8 * U))\"}")
}
route SK101 BCN LIS Barcelona Lisbon 08:00 09:05 89
route SK103 BCN LIS Barcelona Lisbon 12:30 13:35 79
route SK105 BCN LIS Barcelona Lisbon 18:00 19:05 99
route SK102 LIS BCN Lisbon Barcelona 10:00 13:05 89
route SK104 LIS BCN Lisbon Barcelona 16:00 19:05 85
route SK201 CDG LIS Paris Lisbon 07:30 09:05 120
route SK203 CDG LIS Paris Lisbon 14:00 15:35 95
route SK202 LIS CDG Lisbon Paris 10:00 13:35 120
route SK204 LIS CDG Lisbon Paris 17:00 20:35 105
route SK301 LHR LIS London Lisbon 09:00 11:40 110
route SK302 LIS LHR Lisbon London 13:00 15:40 110
route SK401 AMS LIS Amsterdam Lisbon 08:30 11:15 115
route SK402 LIS AMS Lisbon Amsterdam 12:30 16:50 115
invoke airline "$AIRLINE_C" -- set_timetable --routes "[$(IFS=,; echo "${ROUTES[*]}")]" >/dev/null

step "Lisbon museums"
MUSEUMS=()
museum() { MUSEUMS+=("{\"id\":\"$1\",\"name\":\"$2\",\"style\":\"$3\",\"price\":\"$(($4 * U))\"}"); }
museum gulbenkian "Museu Calouste Gulbenkian" "classic art" 14
museum mnaa "Museu Nacional de Arte Antiga" "ancient and classic art" 15
museum azulejo "Museu Nacional do Azulejo" "tiles and decorative art" 10
museum maat "MAAT" "contemporary art and architecture" 13
invoke museum "$MUSEUM_C" -- set_museums --museums "[$(IFS=,; echo "${MUSEUMS[*]}")]" >/dev/null

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
