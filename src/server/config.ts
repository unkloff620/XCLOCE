import type { Queryable } from "./db.ts";
import { BOSSES, FIGHT_HOURS, FIGHTS_PER_DAY, KEYS_TO_UNLOCK } from "../content/bosses.ts";
import { CURRENCY_DEFS, EXCHANGE_FEE, type Currency } from "../content/currencies.ts";
import { ENERGY, LEVELS } from "../content/levels.ts";
import { YARD_DROPS, YARD_MAX_ITEMS, YARD_SPAWN_MIN } from "../content/yard.ts";
import { OFFERS } from "../content/shop.ts";
import { DAILY_REWARDS } from "../content/daily.ts";
import type { Reward } from "../content/rewards.ts";

/**
 * Game numbers. Defaults come from src/content; rows of the `config` table override them without a deploy:
 *   INSERT INTO config (key, value) VALUES ('boss.hp', '{"datsik": 4000}') ON CONFLICT (key) DO UPDATE SET value = excluded.value;
 */
export interface Config {
  bossHp: Record<string, number>;
  fight: { hours: number; perDay: number; keysToUnlock: number };
  energy: { max: number; regenMin: number };
  levels: { base: number; power: number; max: number };
  yard: { spawnMin: number; maxItems: number; weights: Record<string, number> };
  prices: Record<string, number>;
  exchange: { rub: Record<Currency, number>; fee: number };
  /** login reward cycle, one entry per day */
  daily: Reward[];
  /** Telegram ids allowed to run admin actions */
  admins: number[];
}

export function defaultConfig(): Config {
  return {
    bossHp: Object.fromEntries(BOSSES.map((b) => [b.id, b.hp])),
    fight: { hours: FIGHT_HOURS, perDay: FIGHTS_PER_DAY, keysToUnlock: KEYS_TO_UNLOCK },
    energy: { max: ENERGY.max, regenMin: ENERGY.regenMin },
    levels: { ...LEVELS },
    yard: { spawnMin: YARD_SPAWN_MIN, maxItems: YARD_MAX_ITEMS, weights: Object.fromEntries(YARD_DROPS.map((d) => [d.id, d.weight])) },
    prices: Object.fromEntries(OFFERS.map((o) => [o.id, o.price.amount])),
    exchange: { rub: Object.fromEntries(Object.values(CURRENCY_DEFS).map((c) => [c.id, c.rub])) as Record<Currency, number>, fee: EXCHANGE_FEE },
    daily: DAILY_REWARDS.map((r) => structuredClone(r)),
    admins: (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0),
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
  cache = { at: now, cfg };
  return cfg;
}
export function resetConfigCache() {
  cache = null;
}
