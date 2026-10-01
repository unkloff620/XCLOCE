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
scripts/      gen-assets.ts + meme-bosses.ts (boss art), smoke.sh, screenshots.mjs, layout-check.mjs, ui-check.mjs
tests/        game.test.ts (fights, global damage, cooldowns, keys, locations, rename, shop, items, daily, idle, clans), auth.test.ts
```

## API

`POST /api/action {type, …}` — types: task, location_claim, fight_start, fight_hit, fight_claim, fight_flee, rename, unlock, yard_pick, workplace, theme, buy, equip, unequip, use, exchange, daily, mission,
clan_create, clan_disband, clan_request, clan_cancel, clan_accept, clan_reject, clan_kick, clan_leave. Returns `{result, state}`.
`GET /api/me`, `GET /api/fight` (active fight: HP after global damage, cooldowns, damage list, end time), `GET /api/yard` (items lying in the yard), `GET /api/clans?search=|?id=`, `GET /api/feed` (feed + top players), `POST /api/auth`, `GET /api/health`.

## Skins (owner's artwork)

- All replaceable pictures are listed in `src/shared/skin.ts` (`SKIN_SLOTS`: key, size at 3×, kind nine/image/cover, 9-slice corner,
  text padding, overlay zones). Owner's spec page: "Скины XCLOCE" artifact; templates zip generated from the same list.
- Put `public/skin/<key>.png` (or .webp/.jpg; items in `public/skin/items/<id>.png`, bosses in `public/skin/bosses/<slug>.png`).
  `scripts/skin-manifest.mjs` (runs before dev/build) writes `src/shared/skin-files.ts`; missing files fall back to the drawn art.
- 9-slice frames are applied by CSS `border-image` on the slot's selector (`SkinStyles`); text keeps its own padding (`pad`).
- `scripts/skin-check.mjs` verifies applied skins; `node --experimental-strip-types scripts/skin-export.ts` prints the slot list.

## Decisions / assumptions

- 7/day limit = fights started **per boss** (constant `ATTACKS_PER_DAY`).
- Global damage: a hit damages every fight active at that moment, regardless of boss; a boss killed by others' damage is still a victory.
- Weapon damage is flat; weapons are consumables (1 item = 1 hit), fists 20 / 1 h; power does not scale damage yet.
- Fights last 8 h; result window opens on the Boss tab. No passive income. Yard: 1 item / 5 s, 100 pickups per day.
- HUD and nav art is hand-drawn SVG (no image model available); nav buttons have no text labels.
- Market locations are replayable after their reward is claimed.
- Keys: 1 per victory, 3 consumed to unlock the next boss.

## Next steps / open

1. Owner to adjust boss names/HP, weapon damage/cooldowns and location rewards.
2. Battle Pass, staking, meme crew (reference screen elements) — not yet.
3. Clan chat / clan bosses / clan rewards.
4. Better art (owner may supply illustrated assets).
5. Referral links.
