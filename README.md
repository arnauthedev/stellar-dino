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

## Stellar testnet reset

Testnet is wiped periodically. To regenerate and re-fund every actor account
(user, government, recycler, shop, airline, museum, oracle):

```bash
./scripts/reset-testnet.sh
```

The script:
- creates new keys and funds them with Friendbot (testnet only),
- replaces the `STELLAR_*_SECRET` lines in `.env.local` (the previous file is kept as `.env.local.bak`),
- rewrites `config/actors.ts` with the new public addresses.

Afterwards, commit `config/actors.ts` and re-upload the new secrets to Vercel
(`npx vercel env add STELLAR_USER_SECRET production --force`, etc., for production, preview and development).

## Where secrets live

| What | Where |
|---|---|
| All secrets (OpenAI, Supabase, Stellar secret keys, demo password) | `.env.local` (git-ignored) and Vercel env vars |
| Stellar CLI identities | `.stellar-cli/` (git-ignored) |
| Public Stellar addresses | `config/actors.ts` (committed) |

Never commit `.env*`, `.stellar-cli/`, `docs/` or `dino-game/`.
`docs/` and `dino-game/` are excluded locally through `.git/info/exclude`.

## Code map

- `lib/ai.ts`: the only module that talks to the AI model (`AI_MODEL`, `AI_REASONING_EFFORT`)
- `lib/supabase/client.ts`: browser client (publishable key)
- `lib/supabase/server.ts`: server-only client (secret key)
- `config/actors.ts`: public testnet addresses
- `app/health`: checks for Supabase, OpenAI and actor balances
