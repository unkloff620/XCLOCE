# Database schema

Postgres (Neon in production, in-process PGlite locally/tests). The schema is created by idempotent migrations in [`src/server/migrations.ts`](src/server/migrations.ts), applied automatically on cold start under an advisory lock. Amounts are `DOUBLE PRECISION`, rounded in application code.

| Table | Purpose | Key |
|---|---|---|
| `players` | Telegram (or guest) account, level/xp, energy + regen timestamp, passive timestamp, workplace tier, equipped Dump Tool, combo, tutorial step, rate-limit timestamp | `id`, unique `tg_id` |
| `balances` | RUB / USD / SOL / BTC per player, `CHECK amount >= 0` | (`player_id`, `currency`) |
| `boss_progress` | Personal boss chain: current `boss_index`, `damage_taken`, `personal_on_boss`, `pending_personal`, **`global_checkpoint`** | `player_id` |
| `boss_defeats` | One row per defeated boss with reward paid; **UNIQUE (player_id, boss_index)** guarantees rewards once | `id` |
| `player_stats` | lifetime damage, damage today, biggest dump, bosses defeated, trades, volume, realized profit | `player_id` |
| `global_state` | single row: **`damage_total` = GLOBAL_DAMAGE_TOTAL** | `id = 1` |
| `damage_events` | every event through the Global Damage Bus: source player, amount, source type/entity, crit, combo, total after | `id` |
| `feed` | realtime feed: damage, crits, boss kills, market news | `id` |
| `tokens` | meme tokens + simulated market state (price, fair price, liquidity, holders, risk inputs, regime) | `id` |
| `token_prices` | price per tick, last ~1 hour | (`token_id`, `tick`) |
| `market_clock` | last simulated tick | `id = 1` |
| `positions` | player's token holdings + cost basis | (`player_id`, `token_id`) |
| `actions` | idempotency log for exchange/buy/sell/shop with stored result; **UNIQUE (player_id, idem_key)** | `id` |
| `inventory` | owned Dump Tools and workplace items | (`player_id`, `item_type`, `item_id`) |

## Concurrency rules

- Every mutating action runs in one transaction and starts with `SELECT … FROM players WHERE id = $1 FOR UPDATE`.
- Lock order is always **player → token → global_state** (no deadlocks).
- `global_state.damage_total` is incremented with `UPDATE … SET damage_total = damage_total + $1 RETURNING` (atomic).
- Boss sync locks `boss_progress` of that player only; other players are never written by someone else's action.
- Debits use `UPDATE … WHERE amount >= $x RETURNING` so balances cannot go negative.
