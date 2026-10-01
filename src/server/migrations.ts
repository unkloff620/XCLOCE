// Database migrations, applied in order on cold start (see db.ts ensureSchema).
// Every statement is idempotent. Add new migrations to the end of MIGRATIONS; never edit applied ones.
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
-- XCLOCE schema v1. Idempotent: safe to run on every cold start.
-- Money and amounts are DOUBLE PRECISION, rounded in application code (src/shared/economy.ts).

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Players. tg_id is the Telegram user id (or "guest:<uuid>" for browser guests).
CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  tg_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT 'Degen',
  photo_url TEXT,
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  energy DOUBLE PRECISION NOT NULL DEFAULT 50,
  energy_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  passive_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  equipment_tier INT NOT NULL DEFAULT 1,
  equipped_tool TEXT NOT NULL DEFAULT 'paper-hands',
  combo INT NOT NULL DEFAULT 0,
  last_sell_at TIMESTAMPTZ,
  last_action_at TIMESTAMPTZ,
  tutorial_step INT NOT NULL DEFAULT 0,
  referrer_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS balances (
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (amount >= 0),
  PRIMARY KEY (player_id, currency)
);

-- Personal boss chain. One row per player: current boss + damage already taken by it.
CREATE TABLE IF NOT EXISTS boss_progress (
  player_id BIGINT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  boss_index INT NOT NULL DEFAULT 1,
  damage_taken DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (damage_taken >= 0),
  personal_on_boss DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- personal damage emitted by this player that has not yet been applied through the chain
  pending_personal DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- last processed value of global_state.damage_total
  global_checkpoint DOUBLE PRECISION NOT NULL DEFAULT 0,
  boss_started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boss_defeats (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  boss_index INT NOT NULL,
  market_cap DOUBLE PRECISION NOT NULL,
  personal_damage DOUBLE PRECISION NOT NULL,
  reward_usd DOUBLE PRECISION NOT NULL,
  reward_xp INT NOT NULL,
  reward_item TEXT,
  seen BOOLEAN NOT NULL DEFAULT FALSE,
  defeated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, boss_index)
);

-- Lifetime / daily stats
CREATE TABLE IF NOT EXISTS player_stats (
  player_id BIGINT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  lifetime_damage DOUBLE PRECISION NOT NULL DEFAULT 0,
  damage_today DOUBLE PRECISION NOT NULL DEFAULT 0,
  damage_day DATE NOT NULL DEFAULT CURRENT_DATE,
  biggest_dump DOUBLE PRECISION NOT NULL DEFAULT 0,
  bosses_defeated INT NOT NULL DEFAULT 0,
  trades INT NOT NULL DEFAULT 0,
  realized_profit_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  volume_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  rugs_suffered INT NOT NULL DEFAULT 0
);

-- Single-row global state (id = 1).
CREATE TABLE IF NOT EXISTS global_state (
  id INT PRIMARY KEY,
  damage_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_event_id BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO global_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Market simulation clock (separate row so trading does not contend with damage).
CREATE TABLE IF NOT EXISTS market_clock (
  id INT PRIMARY KEY,
  tick BIGINT NOT NULL DEFAULT 0
);
INSERT INTO market_clock (id, tick) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- Every damage event that passed through the Global Damage Bus.
CREATE TABLE IF NOT EXISTS damage_events (
  id BIGSERIAL PRIMARY KEY,
  source_player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  source_type TEXT NOT NULL,
  source_entity TEXT,
  crit BOOLEAN NOT NULL DEFAULT FALSE,
  combo INT NOT NULL DEFAULT 0,
  global_total_after DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS damage_events_created_idx ON damage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS damage_events_player_idx ON damage_events (source_player_id, created_at DESC);

-- Global feed (damage, crits, boss kills, market news).
CREATE TABLE IF NOT EXISTS feed (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  amount DOUBLE PRECISION,
  player_id BIGINT,
  token_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feed_id_desc_idx ON feed (id DESC);

-- Meme tokens and their simulated market state.
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  description TEXT NOT NULL,
  art JSONB NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  fair_price DOUBLE PRECISION NOT NULL,
  launch_price DOUBLE PRECISION NOT NULL,
  supply DOUBLE PRECISION NOT NULL,
  liquidity DOUBLE PRECISION NOT NULL,
  holders INT NOT NULL,
  volume_24h DOUBLE PRECISION NOT NULL DEFAULT 0,
  volatility DOUBLE PRECISION NOT NULL,
  dev_reputation DOUBLE PRECISION NOT NULL,
  whale_concentration DOUBLE PRECISION NOT NULL,
  hype DOUBLE PRECISION NOT NULL DEFAULT 0,
  regime TEXT NOT NULL DEFAULT 'normal',
  regime_ticks INT NOT NULL DEFAULT 0,
  launched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generation INT NOT NULL DEFAULT 1,
  rugged_count INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS token_prices (
  token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  tick BIGINT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (token_id, tick)
);

CREATE TABLE IF NOT EXISTS positions (
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (amount >= 0),
  cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  generation INT NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, token_id)
);

-- Trades double as the idempotency log for buy/sell/exchange/shop actions.
CREATE TABLE IF NOT EXISTS actions (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  idem_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  token_id TEXT,
  amount DOUBLE PRECISION,
  price DOUBLE PRECISION,
  usd_value DOUBLE PRECISION,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, idem_key)
);
CREATE INDEX IF NOT EXISTS actions_player_idx ON actions (player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory (
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, item_type, item_id)
);
`,
  },
  {
    id: "002_retention",
    sql: `
ALTER TABLE players ADD COLUMN IF NOT EXISTS outfit JSONB NOT NULL DEFAULT '{"hoodie":"hoodie-black","hat":"hat-none","glasses":"glasses-none","headphones":"headphones-none"}';

-- Daily login reward streak.
CREATE TABLE IF NOT EXISTS daily_rewards (
  player_id BIGINT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  streak INT NOT NULL DEFAULT 0,
  last_claim_at TIMESTAMPTZ
);

-- Quest progress counters per period ("d:YYYY-MM-DD" / "w:YYYY-MM-DD").
CREATE TABLE IF NOT EXISTS quest_metrics (
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  metric TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, period, metric)
);

-- One claim per quest per period (idempotent rewards).
CREATE TABLE IF NOT EXISTS quest_claims (
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL,
  period TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, quest_id, period)
);
`,
  },
  {
    id: "003_v2_rpg",
    sql: `
ALTER TABLE players ADD COLUMN IF NOT EXISTS power_bonus INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS loadout JSONB NOT NULL DEFAULT '{}';
ALTER TABLE players ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 't-default';
ALTER TABLE players ADD COLUMN IF NOT EXISTS idle_claimed_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE players ADD COLUMN IF NOT EXISTS clan_id BIGINT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS power_cached INT NOT NULL DEFAULT 100;
ALTER TABLE players ADD COLUMN IF NOT EXISTS v2_initialized BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-player boss progress: unlock state, wins, and the daily attack counter.
CREATE TABLE IF NOT EXISTS player_bosses (
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  boss_index INT NOT NULL,
  unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  attempts_day TEXT NOT NULL DEFAULT '',
  first_win_at TIMESTAMPTZ,
  PRIMARY KEY (player_id, boss_index)
);

CREATE TABLE IF NOT EXISTS clans (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clans_name_lower_idx ON clans (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS clans_tag_lower_idx ON clans (lower(tag));

CREATE TABLE IF NOT EXISTS clan_members (
  player_id BIGINT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clan_members_clan_idx ON clan_members (clan_id);

CREATE TABLE IF NOT EXISTS clan_requests (
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  clan_id BIGINT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, clan_id)
);

CREATE TABLE IF NOT EXISTS battles (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  boss_index INT NOT NULL,
  power INT NOT NULL,
  win BOOLEAN NOT NULL,
  damage INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS battles_player_idx ON battles (player_id, created_at DESC);
`,
  },
  {
    id: "004_shared_bosses",
    sql: `
CREATE TABLE IF NOT EXISTS boss_instances (
  id BIGSERIAL PRIMARY KEY,
  boss_index INT NOT NULL,
  hp_max BIGINT NOT NULL,
  hp BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'alive',
  killer_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  killed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS boss_instances_alive_idx ON boss_instances (boss_index) WHERE status = 'alive';
CREATE INDEX IF NOT EXISTS boss_instances_dead_idx ON boss_instances (boss_index, killed_at DESC) WHERE status = 'dead';

CREATE TABLE IF NOT EXISTS boss_damage (
  instance_id BIGINT NOT NULL REFERENCES boss_instances(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  damage BIGINT NOT NULL DEFAULT 0,
  hits INT NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reward JSONB,
  claimed_at TIMESTAMPTZ,
  PRIMARY KEY (instance_id, player_id)
);
CREATE INDEX IF NOT EXISTS boss_damage_top_idx ON boss_damage (instance_id, damage DESC);
CREATE INDEX IF NOT EXISTS boss_damage_pending_idx ON boss_damage (player_id) WHERE reward IS NOT NULL AND claimed_at IS NULL;
`,
  },
];
