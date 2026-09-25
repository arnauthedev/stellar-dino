# stellar-dino

Stellar **testnet** demo app with a motion-controlled Dino game and an AI agent ("Dino").
Next.js (App Router, TypeScript, Tailwind) · Supabase · OpenAI · Stellar testnet · Vercel.

- Repo: https://github.com/arnauthedev/stellar-dino (private)
- Production: https://stellar-dino.vercel.app
- Health check: `/health`

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
| `airline` | Ticket sales with 20% held in the contract; the oracle reports on time (hold released to the airline) or delayed (hold refunded to the passenger). |
| `museum` | Timed slots, paid booking, free reschedule. |
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
