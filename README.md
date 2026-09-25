# stellar-dino

Stellar **testnet** demo app with a motion-controlled Dino game and an AI agent ("Dino").
Next.js (App Router, TypeScript, Tailwind) · Supabase · OpenAI · Stellar testnet · Vercel.

- Repo: https://github.com/arnauthedev/stellar-dino (private)
- Production: https://stellar-dino.vercel.app
- Health check: `/health`

## Demo tabs

Open these in separate tabs (they are separate entities; there is no top bar):

| Tab | What it is |
|---|---|
| `/agent` | Dino: calendar, companion (click it for history, incident report, food, profile) and chat. Proposals appear as cards with Accept / Reject. |
| `/recycle-machine` | Recycling machine: one-time QR, phone shows "Bottle recycled". |
| `/shop` | Airport shop counter: pick a product, the phone scans the QR and pays (`/pay`). |
| `/actors` | Live balances and latest transactions of every actor. |
| `/control` | Hidden demo panel: delay flight, on time, reset demo, reset game. |

`/play` (the Motion Dino game) opens when you ask Dino for a game, sport or indoor activity.

## Setup (new machine)

Requirements: Node LTS, git, GitHub CLI (`gh`), Stellar CLI, Rust + `wasm32v1-none` target.
The Supabase and Vercel CLIs are project dev dependencies (`npx supabase`, `npx vercel`).

```bash
git clone https://github.com/arnauthedev/stellar-dino.git && cd stellar-dino
npm install
npx vercel login && npx vercel link --project stellar-dino
npx vercel env pull .env.local   # pulls the development env vars
npm run dev                      # http://localhost:3000/health
```

## Daily workflow

```bash
npm run dev        # local dev server
git push           # push to main = production deploy on Vercel
                   # push another branch = preview deploy with its own URL
```

## Contracts (Soroban, Rust)

`contracts/` is a Cargo workspace (soroban-sdk 26.1, OpenZeppelin `stellar-accounts` 0.7.2):

| Crate | What it does |
|---|---|
| `shop-recycling` | Products with a sustainable flag, bottle counting, fixed recycling credit, government subsidy pool. At checkout the user pays price minus credit and the pool pays the credit, in one transaction. |
| `airline` | Skyscannerd timetable (BCN, CDG, LHR, AMS ↔ LIS); a flight is route + date. Ticket sales with 20% held in the contract; the oracle reports on time (hold released) or delayed (hold refunded). |
| `museum` | Several Lisbon museums (Gulbenkian, Arte Antiga, Azulejo, MAAT); default slots for any date, paid booking, free reschedule. |
| `smart-wallet` | The user's OpenZeppelin smart account. Rule 0 = owner (user key, can change settings). Rules 1-4 = agent key, scoped to USDC transfers (with the spending-limit policy) and to the shop, airline and museum. The agent cannot change or bypass the limit. |
| `spending-limit-policy`, `ed25519-verifier` | OpenZeppelin example contracts used by the wallet. |
| `notes` | Helper that builds the readable `note` string in every event. |

The demo "USDC" is a Stellar asset issued by the `issuer` account and used through its Stellar Asset Contract.
Soroban transactions cannot carry memos, so the readable labels (e.g. "subsidy_paid: 0.50 USDC by Government for product Bamboo bottle") are in each contract event's `note`, which stellar.expert shows on the transaction.

```bash
npm run test:contracts     # Rust unit tests
./scripts/deploy-contracts.sh   # redeploy contracts + demo data with the current accounts
npm run test:testnet       # runs the whole demo against testnet via lib/stellar.ts, then resets it
```

`lib/stellar.ts` is the shared interface used by the app and the agent. Functions that move money return `{ txHash, explorerUrl, result }`.

## Stellar testnet reset

Testnet is wiped periodically. To regenerate and re-fund every actor account
(user, government, recycler, shop, airline, museum, oracle):

```bash
./scripts/reset-testnet.sh --vercel
```

The script:
- creates new keys for all actors (plus `issuer` for the demo USDC and `agent` for Dino) and funds them with Friendbot (testnet only),
- replaces the `STELLAR_*_SECRET` lines in `.env.local` (the previous file is kept as `.env.local.bak`),
- rewrites `config/actors.ts`, then redeploys all contracts and demo data and rewrites `config/contracts.ts`,
- with `--vercel`, uploads the new `STELLAR_*` secrets to Vercel.

Afterwards, commit `config/actors.ts` and `config/contracts.ts` and push (this deploys).
To reset only the demo state (not the accounts), use `resetDemo()` from `lib/stellar.ts` (the control panel button).

## Dino, the agent

`lib/agent/dino.ts` holds Dino's persona and rules, `lib/agent/tools.ts` its tools (flights, museum,
shop, credit, history, travel time, open game), all wrapping `lib/stellar.ts`. `lib/ai.ts` is the only
module that talks to the model (`AI_MODEL`, `AI_REASONING_EFFORT`); if multi-step tool use slips, set
`AI_MODEL=gpt-5.6-terra`. `/api/chat` runs it; when a `delay_refund` event arrives, the agent page sends
it to Dino as an event and Dino reschedules the museum and posts about it. The delay button in `/control`
computes the new arrival and the museum slots on the server (`lib/agent/delay.ts`) and sends them to Dino over
Supabase Realtime, so Dino only has to apply them. The user lives in Barcelona and bookings are open from today to +6 days.

```bash
npm run test:agent   # resets the demo and runs the full conversation (real model + testnet)
```

## Street problem reports (Na Minha Rua LX, mock)

Companion → "Report incident", or tell Dino about a street problem. Take/upload a photo; the location
comes from EXIF GPS → device location → typed address / map pin. The vision model (`VISION_MODEL`,
default `gpt-5.6-luna`, via `lib/ai.ts`) writes a pt-PT report (category, description, severity);
Nominatim gives address + freguesia and checks it is in Lisbon; duplicates within 30 m are flagged.
Submit is a **mock** (reference `LX-2026-NNNNNN`, nothing is sent to the real portal); the report's
fingerprint is anchored on Stellar (classic tx with memo + manageData) and the Government pays a
0.50 USDC civic reward. `/control` → "Street report follow-up" makes Dino ask if it was fixed.
Code: `lib/report/`, `app/api/report/`, `components/report/`. Test photos: `test-photos/`.

```bash
npx tsx --conditions=react-server --env-file=.env.local scripts/report-demo.ts   # ~30 s end to end
```

## Motion Dino game

`dino-game/` is the webcam Dino game (MediaPipe pose). `npm run build` first runs `npm run build:game`,
which builds it and copies it to `public/game/` (served at `/game/`, embedded by `/play`).
For local development run `npm run build:game` once (or `npm --prefix dino-game run build:watch`).
There is one global game over Supabase Realtime; see `dino-game/README.md`.

## Where secrets live

| What | Where |
|---|---|
| All secrets (OpenAI, Supabase, Stellar secret keys, demo password) | `.env.local` (git-ignored) and Vercel env vars |
| Stellar CLI identities | `.stellar-cli/` (git-ignored) |
| Public Stellar addresses | `config/actors.ts` (committed) |

Never commit `.env*`, `.stellar-cli/` or `docs/`.
`docs/` is excluded locally through `.git/info/exclude`.

## Code map

- `lib/ai.ts`: the only module that talks to the AI model (`AI_MODEL`, `AI_REASONING_EFFORT`)
- `lib/supabase/client.ts`: browser client (publishable key)
- `lib/supabase/server.ts`: server-only client (secret key)
- `config/actors.ts`: public testnet addresses
- `config/contracts.ts`: public contract IDs
- `lib/stellar.ts`: shared Stellar interface; `lib/stellar/core.ts`: transactions + smart-wallet signing
- `app/health`: checks for Supabase, OpenAI and actor balances
