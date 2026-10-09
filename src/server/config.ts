import type { Queryable } from "./db.ts";
import { BOSSES, FIGHT_HOURS, FIGHTS_PER_DAY, FULL_SHARE, KEY_SHARE, KEYS_TO_UNLOCK } from "../content/bosses.ts";
import { CURRENCY_DEFS, EXCHANGE_FEE, type Currency } from "../content/currencies.ts";
import { ENERGY, LEVELS } from "../content/levels.ts";
import { YARD_DROPS, YARD_MAX_ITEMS, YARD_SPAWN_MIN } from "../content/yard.ts";
import { OFFERS } from "../content/shop.ts";
import { DAILY_REWARDS } from "../content/daily.ts";
import { SELL_PRICES } from "../content/items.ts";
import { RENAME } from "../content/profile.ts";
import { SLOT_OUTCOMES, SLOT_SPINS_PER_HOUR } from "../content/slots.ts";
import type { Reward } from "../content/rewards.ts";
import { cleanEffects, type GameEventView } from "../content/events.ts";

/**
 * Game numbers. Defaults come from src/content; rows of the `config` table override them without a deploy:
 *   INSERT INTO config (key, value) VALUES ('boss.hp', '{"datsik": 4000}') ON CONFLICT (key) DO UPDATE SET value = excluded.value;
 */
export interface Config {
  bossHp: Record<string, number>;
  fight: { hours: number; perDay: number; keysToUnlock: number; fullShare: number; keyShare: number };
  energy: { max: number; regenMin: number };
  levels: { a: number; b: number; p: number; max: number };
  yard: { spawnMin: number; maxItems: number; weights: Record<string, number> };
  prices: Record<string, number>;
  exchange: { rub: Record<Currency, number>; fee: number };
  /** login reward cycle, one entry per day */
  daily: Reward[];
  /** inventory sale prices in RUB */
  sell: Record<string, number>;
  rename: { price: number; cooldownH: number };
  /** slot machine: outcome weights and spins per 60 minutes */
  slots: { perHour: number; weights: Record<string, number> };
  /** Telegram ids allowed to run admin actions */
  admins: number[];
  /** game events going on right now (their effects are already applied to the numbers above) */
  events: GameEventView[];
  /** the admin's boss controls: a boss put in (true) or taken out (false) of the game */
  bossOpen: Record<string, boolean>;
  /** boss reward multipliers (1 = usual) */
  bossReward: Record<string, number>;
}

export function defaultConfig(): Config {
  return {
    bossHp: Object.fromEntries(BOSSES.map((b) => [b.id, b.hp])),
    fight: { hours: FIGHT_HOURS, perDay: FIGHTS_PER_DAY, keysToUnlock: KEYS_TO_UNLOCK, fullShare: FULL_SHARE, keyShare: KEY_SHARE },
    energy: { max: ENERGY.max, regenMin: ENERGY.regenMin },
    levels: { ...LEVELS },
    yard: { spawnMin: YARD_SPAWN_MIN, maxItems: YARD_MAX_ITEMS, weights: Object.fromEntries(YARD_DROPS.map((d) => [d.id, d.weight])) },
    prices: Object.fromEntries(OFFERS.map((o) => [o.id, o.price.amount])),
    exchange: { rub: Object.fromEntries(Object.values(CURRENCY_DEFS).map((c) => [c.id, c.rub])) as Record<Currency, number>, fee: EXCHANGE_FEE },
    daily: DAILY_REWARDS.map((r) => structuredClone(r)),
    sell: { ...SELL_PRICES },
    rename: { price: RENAME.price, cooldownH: RENAME.cooldownH },
    slots: { perHour: SLOT_SPINS_PER_HOUR, weights: Object.fromEntries(SLOT_OUTCOMES.map((o) => [o.id, o.weight])) },
    admins: (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0),
    events: [],
    bossOpen: {},
    bossReward: {},
  };
}

const KEYS: Record<string, (c: Config, v: unknown) => void> = {
  "boss.hp": (c, v) => Object.assign(c.bossHp, numMap(v)),
  fight: (c, v) => Object.assign(c.fight, numMap(v)),
  energy: (c, v) => Object.assign(c.energy, numMap(v)),
  levels: (c, v) => Object.assign(c.levels, numMap(v)),
  "yard.weights": (c, v) => Object.assign(c.yard.weights, numMap(v)),
  yard: (c, v) => {
    const m = numMap(v);
    if (m.spawnMin) c.yard.spawnMin = m.spawnMin;
    if (m.maxItems) c.yard.maxItems = m.maxItems;
  },
  prices: (c, v) => Object.assign(c.prices, numMap(v)),
  "exchange.rub": (c, v) => Object.assign(c.exchange.rub, numMap(v)),
  "exchange.fee": (c, v) => {
    if (typeof v === "number" && v >= 0 && v < 0.5) c.exchange.fee = v;
  },
  daily: (c, v) => {
    if (Array.isArray(v) && v.length >= 1 && v.length <= 31 && v.every((r) => r && typeof r === "object" && !Array.isArray(r))) c.daily = v as Reward[];
  },
  sell: (c, v) => Object.assign(c.sell, numMap(v)),
  rename: (c, v) => Object.assign(c.rename, numMap(v)),
  "slots.weights": (c, v) => Object.assign(c.slots.weights, numMap(v)),
  slots: (c, v) => {
    const m = numMap(v);
    if (m.perHour) c.slots.perHour = m.perHour;
  },
  admins: (c, v) => {
    if (Array.isArray(v)) c.admins = [...new Set([...c.admins, ...v.filter((x): x is number => typeof x === "number")])];
  },
};

function numMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (typeof x === "number" && Number.isFinite(x) && x >= 0) out[k] = x;
  return out;
}

let cache: { at: number; cfg: Config } | null = null;
const TTL_MS = 30_000;

export async function loadConfig(q: Queryable, now = Date.now()): Promise<Config> {
  if (cache && now - cache.at < TTL_MS) return cache.cfg;
  const cfg = defaultConfig();
  const rows = await q.query<{ key: string; value: unknown }>("SELECT key, value FROM config");
  for (const r of rows) KEYS[r.key]?.(cfg, r.value);
  await applyEvents(q, cfg, now);
  cache = { at: now, cfg };
  return cfg;
}
export function resetConfigCache() {
  cache = null;
}

/** Events going on at `now` change the numbers: multipliers multiply, the lowest fee and boss HP share win. */
async function applyEvents(q: Queryable, cfg: Config, now: number) {
  let rows: { id: number; title: string; description: string; starts_at: Date; ends_at: Date; effects: unknown }[] = [];
  try {
    rows = await q.query(
      "SELECT id, title, description, starts_at, ends_at, effects FROM game_events WHERE enabled AND starts_at <= $1 AND ends_at > $1 ORDER BY starts_at, id",
      [new Date(now)],
    );
  } catch {
    return; // the table is not there yet (before the migration)
  }
  let energy = 1, yard = 1, spins = 1, fee: number | null = null, hp: number | null = null;
  for (const r of rows) {
    const e = cleanEffects(r.effects);
    cfg.events.push({ id: Number(r.id), title: r.title, description: r.description, startsAt: new Date(r.starts_at).getTime(), endsAt: new Date(r.ends_at).getTime(), effects: e });
    if (e.energyRegen) energy *= e.energyRegen;
    if (e.yardSpeed) yard *= e.yardSpeed;
    if (e.slotsSpins) spins *= e.slotsSpins;
    if (e.exchangeFee !== undefined) fee = Math.min(fee ?? Infinity, e.exchangeFee);
    if (e.bossHp !== undefined) hp = Math.min(hp ?? Infinity, e.bossHp);
    // per boss: the latest started event decides visibility; HP and rewards multiply
    for (const [id, t] of Object.entries(e.bosses ?? {})) {
      if (t.visible !== undefined) cfg.bossOpen[id] = t.visible;
      if (t.hpPct && cfg.bossHp[id]) cfg.bossHp[id] = Math.max(1, Math.round((cfg.bossHp[id] * t.hpPct) / 100));
      if (t.rewardPct) cfg.bossReward[id] = (cfg.bossReward[id] ?? 1) * (t.rewardPct / 100);
    }
  }
  if (energy > 1) cfg.energy.regenMin = cfg.energy.regenMin / energy;
  if (yard > 1) cfg.yard.spawnMin = cfg.yard.spawnMin / yard;
  if (spins > 1) cfg.slots.perHour = Math.round(cfg.slots.perHour * spins);
  if (fee !== null) cfg.exchange.fee = Math.min(cfg.exchange.fee, fee / 100);
  if (hp !== null) for (const id of Object.keys(cfg.bossHp)) cfg.bossHp[id] = Math.max(1, Math.round((cfg.bossHp[id] * hp) / 100));
}
