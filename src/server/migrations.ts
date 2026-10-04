/**
 * XCLOCE 2.0 schema. Migration ids are prefixed "v2-" so they never collide with the old game's ids,
 * and v2-000 drops every table of the old game: the new game starts from a clean database.
 */
const OLD_TABLES = [
  "actions", "balances", "battles", "boss_damage", "boss_defeats", "boss_instances", "boss_progress", "clan_members", "clan_requests",
  "clans", "daily_rewards", "damage_events", "feed", "global_hits", "global_state", "inventory", "location_clears", "location_progress",
  "market_clock", "player_bosses", "player_fights", "player_stats", "players", "positions", "quest_claims", "quest_metrics",
  "token_prices", "tokens", "yard_pickups",
];

export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "v2-000-drop-old",
    sql: OLD_TABLES.map((t) => `DROP TABLE IF EXISTS ${t} CASCADE;`).join("\n"),
  },
  {
    id: "v2-001-core",
    sql: `
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE,
  guest_id UUID UNIQUE,
  username TEXT,
  display_name TEXT NOT NULL,
  photo_url TEXT,
  xp BIGINT NOT NULL DEFAULT 0,
  energy INT NOT NULL DEFAULT 50 CHECK (energy >= 0),
  energy_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clan_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_day DATE,
  active_days INT NOT NULL DEFAULT 0
);
CREATE TABLE wallets (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  amount NUMERIC(30, 8) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  PRIMARY KEY (player_id, currency)
);
CREATE TABLE inventory (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty >= 0),
  source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, item_id)
);
CREATE TABLE cooldowns (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  ready_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (player_id, item_id)
);
CREATE TABLE appearance (
  player_id INT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  equipped JSONB NOT NULL DEFAULT '{}'::jsonb,
  room TEXT NOT NULL DEFAULT 'basic'
);
CREATE TABLE player_stats (
  player_id INT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  total_damage BIGINT NOT NULL DEFAULT 0,
  weapons JSONB NOT NULL DEFAULT '{}'::jsonb,
  task_steps INT NOT NULL DEFAULT 0,
  tasks_done INT NOT NULL DEFAULT 0,
  locations_done INT NOT NULL DEFAULT 0,
  yard_found INT NOT NULL DEFAULT 0,
  rewards_got INT NOT NULL DEFAULT 0,
  fights_won INT NOT NULL DEFAULT 0,
  fights_lost INT NOT NULL DEFAULT 0
);
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ledger (
  id BIGSERIAL PRIMARY KEY,
  player_id INT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  delta NUMERIC(30, 8) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_player ON ledger (player_id, id);
CREATE TABLE idempotency (
  player_id INT NOT NULL,
  key TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, key)
);
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`,
  },
  {
    id: "v2-002-bosses",
    sql: `
CREATE TABLE bosses (
  id TEXT PRIMARY KEY,
  damage_total BIGINT NOT NULL DEFAULT 0,
  last_seq BIGINT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0
);
CREATE TABLE boss_hits (
  id BIGSERIAL PRIMARY KEY,
  boss_id TEXT NOT NULL,
  seq BIGINT NOT NULL,
  player_id INT NOT NULL,
  fight_id INT NOT NULL,
  weapon TEXT NOT NULL,
  damage INT NOT NULL,
  phrase INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (boss_id, seq)
);
CREATE INDEX boss_hits_fight ON boss_hits (fight_id);
CREATE TABLE fights (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  boss_id TEXT NOT NULL,
  hp_max INT NOT NULL,
  start_total BIGINT NOT NULL,
  start_seq BIGINT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  day DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  end_total BIGINT,
  end_seq BIGINT,
  ended_at TIMESTAMPTZ,
  killer_id INT,
  my_damage BIGINT NOT NULL DEFAULT 0,
  my_hits INT NOT NULL DEFAULT 0,
  reward JSONB,
  seen BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX fights_one_active ON fights (player_id) WHERE status = 'active';
CREATE INDEX fights_boss_active ON fights (boss_id) WHERE status = 'active';
CREATE INDEX fights_player_day ON fights (player_id, boss_id, day);
CREATE TABLE boss_damage (
  boss_id TEXT NOT NULL,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  damage BIGINT NOT NULL DEFAULT 0,
  hits INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  PRIMARY KEY (boss_id, player_id)
);
CREATE INDEX boss_damage_top ON boss_damage (boss_id, damage DESC);
`,
  },
  {
    id: "v2-003-world",
    sql: `
CREATE TABLE task_progress (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  steps INT NOT NULL DEFAULT 0,
  done_at TIMESTAMPTZ,
  PRIMARY KEY (player_id, task_id)
);
CREATE TABLE location_claims (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX location_claims_player ON location_claims (player_id, location_id);
CREATE TABLE yard (
  player_id INT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  anchor_at TIMESTAMPTZ
);
CREATE TABLE yard_items (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  slot INT NOT NULL,
  drop_id TEXT NOT NULL,
  spawned_at TIMESTAMPTZ NOT NULL,
  UNIQUE (player_id, slot)
);
CREATE TABLE clans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL UNIQUE,
  emblem TEXT NOT NULL,
  color TEXT NOT NULL,
  leader_id INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE clan_members (
  player_id INT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  clan_id INT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clan_members_clan ON clan_members (clan_id);
`,
  },
  {
    id: "v2-004-daily",
    sql: `
CREATE TABLE daily_login (
  player_id INT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  last_day TEXT NOT NULL,
  streak INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0
);
`,
  },
  {
    id: "v2-005-nick-slots",
    sql: `
ALTER TABLE players ADD COLUMN IF NOT EXISTS name_custom BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS name_changed_at TIMESTAMPTZ;
CREATE TABLE slot_spins (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  reels TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX slot_spins_player ON slot_spins (player_id, created_at DESC);
`,
  },
  {
    id: "v2-006-home",
    sql: `
ALTER TABLE appearance ADD COLUMN IF NOT EXISTS rooms JSONB NOT NULL DEFAULT '["basic"]';
ALTER TABLE appearance ADD COLUMN IF NOT EXISTS body JSONB NOT NULL DEFAULT '{}';
ALTER TABLE players ADD COLUMN IF NOT EXISTS help_seen JSONB NOT NULL DEFAULT '[]';
ALTER TABLE boss_hits ADD COLUMN IF NOT EXISTS crit BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE player_equipment (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL,
  level INT NOT NULL,
  PRIMARY KEY (player_id, equipment_id)
);
`,
  },
  {
    // the fist becomes the free permanent weapon; the mouse turns into a 30-damage consumable (players keep theirs)
    id: "v2-007-fist",
    sql: `
INSERT INTO inventory (player_id, item_id, qty, source) SELECT id, 'fist', 1, 'migration' FROM players
ON CONFLICT (player_id, item_id) DO NOTHING;
`,
  },
  {
    // talents: earned by damage dealt within one boss fight, spent on the computer parts (player_equipment pc-*)
    id: "v2-008-talents",
    sql: `
ALTER TABLE players ADD COLUMN IF NOT EXISTS talents INT NOT NULL DEFAULT 0;
`,
  },
  {
    // desks: everyone gets «Стол 001» and it stands in the room
    id: "v2-009-desk",
    sql: `
INSERT INTO inventory (player_id, item_id, qty, source) SELECT id, 'desk-001', 1, 'migration' FROM players
ON CONFLICT (player_id, item_id) DO NOTHING;
UPDATE appearance SET equipped = jsonb_set(equipped, '{DESK}', '"desk-001"') WHERE NOT (equipped ? 'DESK');
`,
  },
  {
    // desks are room upgrades now (equipment "desk", levels 0..3), not items: a bought desk becomes the level
    id: "v2-010-desk-level",
    sql: `
INSERT INTO player_equipment (player_id, equipment_id, level)
SELECT player_id, 'desk', MAX(CASE item_id WHEN 'desk-002' THEN 1 WHEN 'desk-003' THEN 2 WHEN 'desk-004' THEN 3 ELSE 0 END)
FROM inventory WHERE item_id IN ('desk-002', 'desk-003', 'desk-004') AND qty > 0 GROUP BY player_id
ON CONFLICT (player_id, equipment_id) DO UPDATE SET level = GREATEST(player_equipment.level, EXCLUDED.level);
DELETE FROM inventory WHERE item_id LIKE 'desk-%';
UPDATE appearance SET equipped = equipped - 'DESK';
`,
  },
  {
    // the stage of a room thing that stands in the room, chosen among the owned ones (chair: stool / office / gaming / throne)
    id: "v2-011-decor",
    sql: `
ALTER TABLE appearance ADD COLUMN IF NOT EXISTS decor JSONB NOT NULL DEFAULT '{}'::jsonb;
`,
  },
  {
    // daily quests (three a day + a chest) and Telegram bot reminders
    id: "v2-012-quests-notify",
    sql: `
CREATE TABLE IF NOT EXISTS daily_quests (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  claimed JSONB NOT NULL DEFAULT '[]'::jsonb,
  chest JSONB,
  PRIMARY KEY (player_id, day)
);
CREATE TABLE IF NOT EXISTS notifications (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (player_id, kind)
);
CREATE INDEX IF NOT EXISTS notifications_due ON notifications (due_at) WHERE sent_at IS NULL;
CREATE TABLE IF NOT EXISTS notify_runs (id INT PRIMARY KEY, at TIMESTAMPTZ NOT NULL);
INSERT INTO notify_runs (id, at) VALUES (1, '2000-01-01') ON CONFLICT DO NOTHING;
ALTER TABLE players ADD COLUMN IF NOT EXISTS notify_on BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE players ADD COLUMN IF NOT EXISTS pm_blocked BOOLEAN NOT NULL DEFAULT false;
`,
  },
];
