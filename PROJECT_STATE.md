# PROJECT_STATE

> Project memory. Read this first in every new session. Update after each major stage.

## Status

**Stage 1 — MVP vertical slice: implemented.** Telegram auth, profile, currencies + exchanger, meme market with charts, buy/sell, portfolio, personal bosses, Global Damage Bus, realtime (SSE), boss defeat + rewards (once), Dump Tools (buy/equip, drops), workplace tiers with room art, leaderboards, global feed, tutorial, responsive UI.

- Production URL: https://xcloce.vercel.app (Vercel project `xcloce`, auto-deploys from `main`; `dev` → preview deployments)
- Repo: https://github.com/unkloff620/XCLOCE

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript**, one Vercel project for UI and API (route handlers, Node runtime).
- **Postgres** via `pg` (Neon, Vercel Storage). Local/tests: **PGlite** (in-process WASM Postgres) when `DATABASE_URL` is empty.
- No ORM: hand-written SQL with explicit locks (see DATABASE_SCHEMA.md).
- Realtime: **Server-Sent Events** (`/api/stream`), 50 s connections with auto-reconnect; polling fallback every 8 s.
- Tests: **Vitest** with PGlite. All art is generated SVG (`scripts/gen-assets.ts` → `public/assets`, token logos rendered from `src/shared/art.ts`).

## Structure

```
src/shared/      economy.ts (ALL formulas), bosses.ts, tokens.ts (seeds, risk), art.ts (procedural SVG)
src/server/      db.ts (pg/PGlite, migrations), migrations.ts, seed.ts, auth.ts (initData + sessions),
                 damageBus.ts (GLOBAL DAMAGE BUS), bossChain.ts (pure chain/overkill), game.ts (actions),
                 market.ts + marketSim.ts (market), http.ts (route wrapper, errors, rate limit), routes.ts, log.ts
src/app/api/*    route handlers
src/client/      store.tsx (state, SSE, actions), api.ts, telegram.ts, ui.tsx, chrome.tsx, screens/*
scripts/         gen-assets.ts, economy-table.ts, market-sim-check.ts, smoke.sh
tests/           bossChain, damageBus (§99–101 + concurrency + reward-once), trading, auth
public/assets/   bosses, dump-tools, rooms, icons, ui, effects
```

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /api/auth | – | `{initData}` (Telegram, HMAC-validated) or `{guestId}` → session token |
| GET | /api/me | ✓ | sync global damage → full state |
| GET | /api/market | – | tokens + sparklines (advances market) |
| GET | /api/token?id= | – | token detail + 1 h history |
| POST | /api/trade | ✓ | `{side: buy, tokenId, sol, idem}` / `{side: sell, tokenId, fraction, idem}` |
| POST | /api/exchange | ✓ | `{from, to, amount, idem}` |
| POST | /api/work | ✓ | +RUB for 1 energy |
| POST | /api/shop | ✓ | `{kind: equipment, tier}` / `{kind: tool, toolId}` + idem |
| POST | /api/equip | ✓ | equip owned Dump Tool |
| POST | /api/tutorial | ✓ | `boss_opened` (also marks defeats seen) / `skip` |
| GET | /api/bosses | ✓ | boss progression list |
| GET | /api/leaderboard?type= | – | damage_today, damage_all, bosses, biggest_dump, profit, level |
| GET | /api/feed | – | latest feed + global total |
| GET | /api/stream | – | SSE: `global`, `feed`, `market` events |
| GET | /api/health | – | DB / bot config check |

Every action returns `{result, state}` computed in the same transaction.

## Global Damage Bus (how it works)

`emitDamage` (inside the seller's transaction) atomically adds to `global_state.damage_total`, records a `damage_events` row (source, amount, type, entity), updates personal stats and `pending_personal`, and writes the feed. Each player keeps `global_checkpoint`; `syncBoss` applies `total − checkpoint` through `applyChain` (overkill → next bosses, safety cap 200 defeats per sync, unapplied rest kept). This gives O(1) work per event, offline damage for free, no fan-out writes. New players start at the current total. Rewards are inserted with `UNIQUE(player_id, boss_index)`.

## Key decisions

- Damage = gross sale value (documented in GAME_DESIGN.md), modifiers applied server-side.
- Reward contribution factor (25%..100%) to keep the economy finite with many players.
- Market & exchange rates are deterministic functions of (seed, tick/time) → consistent across serverless instances.
- Guest browser mode (`ALLOW_GUEST`, default on) for testing outside Telegram; guests are separate `guest:<uuid>` accounts.
- Session token = HMAC-signed `{pid, exp}` (7 days); secret from `SESSION_SECRET` or derived from bot token.

## Environment

See `.env.example`. Production (Vercel): `DATABASE_URL` (Neon integration), `TELEGRAM_BOT_TOKEN` (production only). Optional: `SESSION_SECRET`, `ALLOW_GUEST`, `NEXT_PUBLIC_BOT_USERNAME`.

## Checks

`npm run typecheck`, `npm test` (26 tests), `npm run build`, `bash scripts/smoke.sh` against a running server. The local agent environment has no npm registry access; checks run in a Vercel Sandbox (`xcloce-dev`) cloned from the `dev` branch.

## Open issues / next stage

1. **Stage 2:** character + cosmetics (dress-up) — owner request; room decorations; daily reward & streak; daily/weekly quests; achievements.
2. Assistants (passive bonuses), referrals via `start_param=ref_<tgId>` (stored as `referrer_id`, rewards not implemented yet).
3. Dump Tool upgrade levels; loot boxes; news-driven market events beyond the simulation.
4. Boss scaling vs. player count (see GAME_DESIGN.md open questions).
5. SSE polls the DB every 1.5 s per open connection — move to Postgres LISTEN/NOTIFY or a pub/sub service when concurrency grows.
6. Telegram bot: set Mini App URL in @BotFather to the production URL (owner action).
