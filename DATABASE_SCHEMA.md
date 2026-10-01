# Database schema (v2)

Postgres (Neon) in production, PGlite locally/in tests. Idempotent migrations in [`src/server/migrations.ts`](src/server/migrations.ts)
(001 v1 base, 002 retention, 003 v2 RPG, 005 personal fights + locations, **006 consumable weapons + yard**; 004 shared bosses was replaced by 005). v1-only tables (tokens, positions, damage events, …) remain but are unused.

| Table | Purpose | Key |
|---|---|---|
| `players` | account, `display_name` (unique, case-insensitive) + `name_changed_at`, level/xp, energy + regen timestamp, `equipment_tier` (workplace), `loadout` JSONB (equipped gear), `theme`, `idle_claimed_at`, `power_bonus` (permanent), `power_cached`, `clan_id` | `id`, unique `tg_id` |
| `balances` | RUB / USD / SOL / BTC, `CHECK amount >= 0` | (`player_id`, `currency`) |
| `inventory` | items (`item_type='item'`), stackable `quantity` | (`player_id`, `item_type`, `item_id`) |
| `player_bosses` | per boss: `unlocked`, `wins`, `losses`, daily `attempts` + `attempts_day` | (`player_id`, `boss_index`) |
| `battles` | legacy battle log | `id` |
| `player_fights` | personal fight: boss, `hp_max`, `start_hit_id`, `status` active/won/lost/fled (8 h duration), weapon `cooldowns` JSONB, `reward` | `id`, unique active per player |
| `global_hits` | every hit of every player (boss, weapon, damage) — the global damage ledger | `id` |
| `yard_pickups` | yard pickups per 5-second slot (one per slot), daily limit counted by `created_at` | (`player_id`, `slot`) |
| `location_progress` | Market task progress N/target | (`player_id`, `task_id`) |
| `location_clears` | how many times a location was completed | (`player_id`, `location_id`) |
| `daily_rewards` | login streak | `player_id` |
| `quest_metrics` / `quest_claims` | daily mission counters (`d:YYYY-MM-DD`) and one claim per mission per day | composite |
| `clans` | name/tag unique (case-insensitive), owner | `id` |
| `clan_members` | one clan per player, role leader/member | `player_id` |
| `clan_requests` | join requests (max 5 per player) | (`player_id`, `clan_id`) |
| `actions` | idempotency log for purchases/exchange | (`player_id`, `idem_key`) |
| `feed` | server events (first boss kills, new clans) | `id` |

Concurrency: every action locks the player row (`SELECT … FOR UPDATE`), then the player's fight / boss row; debits are conditional
(`WHERE amount >= $x`); unique constraints guard double claims.
