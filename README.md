# XCLOCE

Telegram Mini App crypto-meme game: work for rubles, swap into USD and SOL, trade meme tokens, and **dump** them — every sale becomes damage against your personal boss *and* the bosses of every other player (**personal bosses + global damage**).

## Quick start (local)

```bash
npm install
npm run dev          # http://localhost:3000 — opens in guest mode, uses in-process PGlite
```

No database needed locally: without `DATABASE_URL` the server runs Postgres in-process (PGlite) and seeds tokens automatically. Set `PGLITE_DIR=.pglite` to keep data between restarts. Copy `.env.example` to `.env.local` to configure.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest (Global Damage Bus, trading, auth) |
| `npm run typecheck` | TypeScript |
| `npm run check` | typecheck + tests + build |
| `npm run assets` | regenerate all SVG art in `public/assets` |
| `npm run economy` | print the boss/level progression table |
| `npm run market:check` | simulate 24 h of the meme market |
| `BASE=http://localhost:3000 bash scripts/smoke.sh` | API smoke test |

## Deploy (Vercel)

1. Import the repo into Vercel (framework: Next.js, defaults).
2. Storage → create **Neon Postgres** and connect it to the project (sets `DATABASE_URL`).
3. Settings → Environment Variables → `TELEGRAM_BOT_TOKEN` (from @BotFather).
4. Push to `main` → production deploy. Tables and seed data are created on first request.
5. In @BotFather: `/mybots` → your bot → **Bot Settings → Configure Mini App → Enable Mini App** and set the URL to the production domain (e.g. `https://xcloce.vercel.app`). Optionally set the menu button to the same URL.

## Docs

- [PROJECT_STATE.md](PROJECT_STATE.md) — architecture, API, decisions, next steps
- [GAME_DESIGN.md](GAME_DESIGN.md) — mechanics and all economy formulas
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) — tables and concurrency rules
