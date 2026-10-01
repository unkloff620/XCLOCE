# Database schema (v2)

Postgres (Neon) in production, PGlite locally/in tests. Idempotent migrations in [`src/server/migrations.ts`](src/server/migrations.ts)
(001 v1 base, 002 retention, **003 v2 RPG**). v1-only tables (tokens, positions, damage events, …) remain but are unused.

| Table | Purpose | Key |
|---|---|---|
| `players` | account, level/xp, energy + regen timestamp, `equipment_tier` (workplace), `loadout` JSONB (equipped gear), `theme`, `idle_claimed_at`, `power_bonus` (permanent), `power_cached`, `clan_id` | `id`, unique `tg_id` |
| `balances` | RUB / USD / SOL / BTC, `CHECK amount >= 0` | (`player_id`, `currency`) |
| `inventory` | items (`item_type='item'`), stackable `quantity` | (`player_id`, `item_type`, `item_id`) |
| `player_bosses` | per boss: `unlocked`, `wins`, `losses`, daily `attempts` + `attempts_day` | (`player_id`, `boss_index`) |
| `battles` | battle log (power, win, damage) | `id` |
| `daily_rewards` | login streak | `player_id` |
| `quest_metrics` / `quest_claims` | daily mission counters (`d:YYYY-MM-DD`) and one claim per mission per day | composite |
| `clans` | name/tag unique (case-insensitive), owner | `id` |
| `clan_members` | one clan per player, role leader/member | `player_id` |
| `clan_requests` | join requests (max 5 per player) | (`player_id`, `clan_id`) |
| `actions` | idempotency log for purchases/exchange | (`player_id`, `idem_key`) |
| `feed` | server events (first boss kills, new clans) | `id` |

Concurrency: every action locks the player row (`SELECT … FOR UPDATE`), then the boss row; debits are conditional
(`WHERE amount >= $x`); unique constraints guard double claims.
