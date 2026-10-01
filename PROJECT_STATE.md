# PROJECT_STATE

> Project memory. Read first in every new session.

## Status — v2 "Meme Fighter" (current, `main`)

Owner redesigned the game (2026-10-01) after a comic-style reference: dressable shiba hero, boss list with keys, energy tasks on Market,
5-column inventory, clans. Implemented and deployed: auth, HUD (avatar/nick/level/XP, POWER, RUB/USD/SOL/BTC, energy), bottom nav
Boss · Market · Home · Inventory · Social, Home scene with FIGHT NOW + side buttons + Idle/Upgrade/Equip, 10 bosses with
7 attacks/day/boss and 3-key unlocks, battle animation, Market tasks, shop (gear, items, themes, exchange), inventory & equipment,
login streak, daily missions, events, workplace upgrades, clans (create/request/accept/reject/kick/leave/disband), top players.

v1 (meme-token trading, personal bosses + global damage) is archived in branch **`v1-trading`**.

- Production: https://xcloce.vercel.app (Vercel project `xcloce`, auto-deploy from `main`; `dev` → previews)
- Repo: https://github.com/unkloff620/XCLOCE

## Stack

Next.js 16 (App Router) + React 19 + TypeScript on Vercel; Postgres via `pg` (Neon); PGlite for local/tests; Vitest; SVG art in code.
Fonts: Bangers (comic, latin) + Russo One (cyrillic fallback) + Inter.

## Structure

```
src/shared/   economy.ts (currencies, power, battle math, workplace), items.ts (catalog), content.ts (bosses, tasks, rewards, missions, events, clans)
src/server/   db.ts, migrations.ts, auth.ts, http.ts, routes.ts, log.ts, xp.ts, game.ts (all game actions + state)
src/app/api/  auth, me, action (single action dispatcher), clans, feed, health
src/client/   store.tsx, api.ts, hud.tsx, ui.tsx, telegram.ts, art/{hero,items,scene,icons}.tsx, screens/{Home,Boss,Market,Inventory,Social,Sheets}.tsx
scripts/      gen-assets.ts + meme-bosses.ts (boss art), smoke.sh, screenshots.mjs, layout-check.mjs
tests/        game.test.ts (bosses, keys, limits, tasks, shop, items, daily, idle, clans), auth.test.ts
```

## API

`POST /api/action {type, …}` — types: task, attack, unlock, idle, workplace, theme, buy, equip, unequip, use, exchange, daily, mission,
clan_create, clan_disband, clan_request, clan_cancel, clan_accept, clan_reject, clan_kick, clan_leave. Returns `{result, state}`.
`GET /api/me`, `GET /api/clans?search=|?id=`, `GET /api/feed` (feed + top players), `POST /api/auth`, `GET /api/health`.

## Decisions / assumptions

- 7 attacks/day are **per boss** (owner's wording ambiguous; constant `ATTACKS_PER_DAY`).
- Keys: 1 per win, 3 consumed to unlock the next boss.
- Battles resolved server-side (10 hits, crits); client only animates the returned hits.
- Players from v1 are migrated on first request (boss #1 opened, energy reset, balances kept).

## Next steps / open

1. Owner to adjust boss names/HP and rewards.
2. Battle Pass, staking, meme crew (reference screen elements) — not yet.
3. Clan chat / clan bosses / clan rewards.
4. Better art (owner may supply illustrated assets).
5. Referral links.
