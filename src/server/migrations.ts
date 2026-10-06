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
  {
    // weekly rating (damage per Moscow week), its results and prizes; achievements; the best login streak
    id: "v2-013-rating-achievements",
    sql: `
CREATE TABLE IF NOT EXISTS weekly_stats (
  week TEXT NOT NULL,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  damage BIGINT NOT NULL DEFAULT 0,
  hits INT NOT NULL DEFAULT 0,
  PRIMARY KEY (week, player_id)
);
CREATE INDEX IF NOT EXISTS weekly_stats_rank ON weekly_stats (week, damage DESC);
CREATE TABLE IF NOT EXISTS week_results (
  week TEXT NOT NULL,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  place INT NOT NULL,
  damage BIGINT NOT NULL,
  PRIMARY KEY (week, player_id)
);
CREATE TABLE IF NOT EXISTS weeks_settled (week TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS prizes (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  reward JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS prizes_open ON prizes (player_id) WHERE claimed_at IS NULL;
CREATE TABLE IF NOT EXISTS achievements (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, id)
);
ALTER TABLE daily_login ADD COLUMN IF NOT EXISTS best_streak INT NOT NULL DEFAULT 0;
UPDATE daily_login SET best_streak = GREATEST(best_streak, streak);
-- this week's damage so far counts; the week before is closed without prizes (the rating did not exist yet)
INSERT INTO weekly_stats (week, player_id, damage, hits)
SELECT to_char(date_trunc('week', (created_at AT TIME ZONE 'UTC') + interval '3 hours'), 'YYYY-MM-DD'), player_id, SUM(damage), COUNT(*)
FROM boss_hits
WHERE date_trunc('week', (created_at AT TIME ZONE 'UTC') + interval '3 hours') = date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '3 hours')
GROUP BY 1, 2
ON CONFLICT (week, player_id) DO NOTHING;
INSERT INTO weeks_settled (week) VALUES (to_char(date_trunc('week', (now() AT TIME ZONE 'UTC') + interval '3 hours') - interval '7 days', 'YYYY-MM-DD'))
ON CONFLICT DO NOTHING;
`,
  },
  {
    // clan settings: a description the leader writes
    id: "v2-014-clan-description",
    sql: `
ALTER TABLE clans ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
`,
  },
  {
    // the level curve got longer (levels above 100): players who were here before do not get the newcomer tour again
    id: "v2-015-levels-tour",
    sql: `
UPDATE players SET help_seen = help_seen || '["tutorial"]'::jsonb WHERE NOT (help_seen ? 'tutorial');
`,
  },
  {
    // Вадим and Боцман now stand between Князь and Утилизатор. Whoever already had Утилизатор open
    // (3 keys of Князь) keeps it: they get the keys of the two new bosses.
    id: "v2-016-vadim-botsman",
    sql: `
INSERT INTO inventory (player_id, item_id, qty, source)
SELECT k.player_id, n.item_id, 3, 'migration:new-bosses'
FROM inventory k CROSS JOIN (VALUES ('key-vadim'), ('key-botsman')) AS n(item_id)
WHERE k.item_id = 'key-knyaz' AND k.qty >= 3
ON CONFLICT (player_id, item_id) DO UPDATE SET qty = GREATEST(inventory.qty, 3);
`,
  },
  {
    // Гаркуша and Mugo now stand between Командате (bebyakyan) and Бабафей. Whoever already had Бабафей open
    // (3 keys of Командате) keeps everything after it: they get the keys of the two new bosses.
    id: "v2-017-garkusha-mugo",
    sql: `
INSERT INTO inventory (player_id, item_id, qty, source)
SELECT k.player_id, n.item_id, 3, 'migration:new-bosses'
FROM inventory k CROSS JOIN (VALUES ('key-garkusha'), ('key-mugo')) AS n(item_id)
WHERE k.item_id = 'key-bebyakyan' AND k.qty >= 3
ON CONFLICT (player_id, item_id) DO UPDATE SET qty = GREATEST(inventory.qty, 3);
`,
  },
  {
    // clothes falling from a boss: wins in a row without clothes (the 10th one gives a piece for sure)
    id: "v2-018-boss-pity",
    sql: `
CREATE TABLE IF NOT EXISTS boss_pity (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  boss_id TEXT NOT NULL,
  misses INT NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, boss_id)
);
`,
  },
  {
    // «Соло»: a personal fight where only my own hits take the boss's HP (others' damage does not count)
    id: "v2-019-solo-fights",
    sql: `
ALTER TABLE fights ADD COLUMN IF NOT EXISTS solo BOOLEAN NOT NULL DEFAULT false;
`,
  },
  {
    // things a boss drop opens in the shop (they are bought there afterwards)
    id: "v2-020-unlocks",
    sql: `
CREATE TABLE IF NOT EXISTS player_unlocks (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  boss_id TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, item_id)
);
`,
  },
  {
    // Таланты: the counter is the damage of all time (it no longer burns with the fight) and talents are spent on
    // weapon branches instead of computer parts. Computer parts are refunded (level n cost n talents), and everyone
    // gets the talents the new curve gives for their damage so far minus what they already earned.
    id: "v2-021-weapon-talents",
    sql: `
CREATE TABLE IF NOT EXISTS player_talents (
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  weapon_id TEXT NOT NULL,
  branch TEXT NOT NULL,
  level INT NOT NULL DEFAULT 0 CHECK (level >= 0),
  PRIMARY KEY (player_id, weapon_id, branch)
);
WITH refund AS (
  SELECT player_id, SUM(level * (level + 1) / 2)::int AS n FROM player_equipment
  WHERE equipment_id IN ('pc-gpu', 'pc-cooler', 'pc-psu') AND level > 0 GROUP BY player_id
), ins AS (
  INSERT INTO ledger (player_id, kind, key, delta, reason) SELECT player_id, 'talent', 'talent', n, 'refund:pc' FROM refund
)
UPDATE players p SET talents = p.talents + r.n FROM refund r WHERE r.player_id = p.id;
DELETE FROM player_equipment WHERE equipment_id IN ('pc-gpu', 'pc-cooler', 'pc-psu');
WITH thr(v) AS (VALUES (100),(401),(905),(1613),(2519),(3626),(4909),(6403),(8074),(9878),(11893),(14047),(16267),(18923),(21512),(24338),(27833),(31194),(35158),(38929),(43668),(48163),(53591),(58901),(65158),(70027),(76085),(82394),(88859),(96784),(101946),(108629),(113829),(120336),(125743),(131291),(137774),(143456),(150605),(155661),(163137),(169501),(177399),(183326),(188521),(201611),(211856),(221677),(230105),(242527),(250538),(267851),(278602),(289322),(300806),(321807),(337203),(342633),(363893),(379168),(384124),(402344),(415882),(425893),(444256),(458485),(465897),(479603),(489867),(504457),(509142),(524451),(525346),(531825),(547737),(551129),(564198),(578874),(594733),(604543),(630407),(641516),(661536),(680438),(710031),(728365),(756467),(775739),(802998),(824003),(845103),(867526),(883933),(902517),(920587),(934589),(949849),(965897),(982441),(1000000)),
due AS (
  SELECT s.player_id,
    (SELECT COUNT(*) FROM thr WHERE v <= s.total_damage)::int
      + GREATEST(0, FLOOR(SQRT(s.total_damage / 100.0))::int - 100)
      - COALESCE((SELECT SUM(delta) FROM ledger l WHERE l.player_id = s.player_id AND l.kind = 'talent' AND l.reason NOT LIKE 'refund:%'), 0)::int AS n
  FROM player_stats s
), ins AS (
  INSERT INTO ledger (player_id, kind, key, delta, reason) SELECT player_id, 'talent', 'talent', n, 'catch-up:damage' FROM due WHERE n > 0
)
UPDATE players p SET talents = p.talents + d.n FROM due d WHERE d.player_id = p.id AND d.n > 0;
`,
  },
];
