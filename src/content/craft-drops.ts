/*
 * Where the craft parts (content/craft.ts) come from — almost everywhere, a little, at random («полный рандом»):
 * the yard, location tasks and closings, bosses (by fight mode, each boss with his own very rare part), the «Ящик
 * ништяков», the daily login and the day's chest, the mini games, the roach and the pigeons, fist fights, the clan
 * boss; the dealer in the garage sells a few every day and buys them back; a level-1/2 thing can be taken apart;
 * players ask each other for parts and send them (systems/swap.ts).
 */
import { CRAFT_PARTS } from "./craft.ts";
import type { Rarity } from "./items.ts";

export const PARTS_BY_RARITY: Record<"common" | "rare" | "epic", string[]> = {
  common: CRAFT_PARTS.filter((p) => p.rarity === "common").map((p) => p.id),
  rare: CRAFT_PARTS.filter((p) => p.rarity === "rare").map((p) => p.id),
  epic: CRAFT_PARTS.filter((p) => p.rarity === "epic").map((p) => p.id),
};
const P = (...ids: string[]) => ids.map((i) => `part-${i}`);

/** what each location's tasks drop more often (its theme); the rest of the parts come too, more rarely */
export const LOCATION_PARTS: Record<string, string[]> = {
  openspace: P("clip", "staples", "pencil", "cup", "glue", "scotch", "chalk", "button", "bag", "thread"),
  market: P("can", "bottle", "bag", "sock", "straw", "lighter", "magnet", "matches", "cork", "mirror"),
  serverroom: P("cable", "wire", "copper", "bulb", "speaker", "screwdriver", "pliers", "gear", "tape", "chip"),
  basement: P("battery", "gasoline", "hose", "wheel", "bearing", "sandpaper", "drill", "cooler", "solder", "accu"),
  board: P("glass", "lens", "metal", "chain", "clamp", "wrench", "quartz", "laser", "titanium", "carbon"),
  accounting: P("clip", "staples", "pencil", "cardboard", "glue", "button", "file", "magnet", "chip", "quartz"),
  hr: P("thread", "needle", "zipper", "clothespin", "rag", "sock", "scotch", "paint", "mirror", "glass"),
  party: P("bottle", "cork", "cup", "straw", "foil", "matches", "lighter", "stub", "speaker", "bulb"),
  offshore: P("rope", "sponge", "hose", "funnel", "pump", "stone", "can", "copper", "gasoline", "neodym"),
  yacht: P("rope", "chain", "tire", "pump", "motor", "bearing", "gear", "pipe", "titanium", "carbon"),
  moonbase: P("metal", "titanium", "accu", "tesla", "gyro", "laser", "solder", "cooler", "neodym", "chip"),
};

/**
 * The parts from location tasks grow with the location: a step gives 1…(2 + order/4) parts, the closing
 * 10 + 4 per location after the first (Опенспейс 10, Лунная база 50) and 1 + order/4 very rare ones.
 */
export const locStepParts = (order: number) => ({ min: 1, max: 2 + Math.floor(order / 4), rare: Math.min(0.4, 0.18 + 0.02 * order), epic: Math.min(0.06, 0.01 + 0.004 * order) });
export const locClaimParts = (order: number) => ({ n: 10 + 4 * (order - 1), rare: Math.min(0.5, 0.25 + 0.02 * order), epic: 1 + Math.floor(order / 4) });

/** each boss's own very rare part: it may drop for a win over him */
export const BOSS_PARTS: Record<string, string> = {
  datsik: "part-motor", kedr: "part-gyro", mugo: "part-neodym", garkusha: "part-titanium", bebyakyan: "part-tesla",
  babafey: "part-pump", vodovoz: "part-carbon", knyaz: "part-quartz", vadim: "part-chip", botsman: "part-accu",
  utilizator: "part-cooler", fokus: "part-laser", solntse: "part-saltpeter", pepe: "part-sulfur",
};

/**
 * The parts for a win over a boss: the harder the boss (his order, 1…13) and the mode, the more and the rarer.
 * «Пацанский» ×1, «Блатной» ×1.8, «Авторитетный» ×3 on a base of 3 parts that grows ×0.55 (the first boss) … ×2.35
 * (the last); his own very rare part: «Пацанский» never, «Блатной» 15…45%, «Авторитетный» for sure, 1…3 of it.
 */
export function craftBossParts(order: number, mode: string) {
  const o = Math.max(1, Math.min(13, order));
  const boss = 0.4 + 0.15 * o;
  const m = mode === "avtor" ? 3 : mode === "blat" ? 1.8 : 1;
  const mid = 3 * boss * m;
  return {
    min: Math.max(1, Math.round(mid * 0.75)), max: Math.max(2, Math.round(mid * 1.25)),
    rare: Math.min(0.6, 0.12 + 0.02 * o + (mode === "pacan" ? 0 : 0.08)),
    epic: Math.min(0.15, 0.003 * o * m),
    sigChance: mode === "avtor" ? 1 : mode === "blat" ? 0.12 + 0.025 * o : 0,
    sigMin: 1, sigMax: mode === "avtor" ? 1 + Math.floor(o / 5) : 1,
  };
}

type Rng = () => number;
const pick = <T,>(list: T[], rng: Rng) => list[Math.floor(rng() * list.length) % list.length];
/** a whole number from min to max, both included */
export const between = (min: number, max: number, rng: Rng) => min + Math.floor(rng() * (max - min + 1));

/**
 * `n` random parts: each is very rare with chance `epic`, rare with chance `rare`, else common; `pool` (a location's
 * theme) is used for half of them. Returns reward items (the same part summed).
 */
export function rollParts(rng: Rng, n: number, opts: { rare?: number; epic?: number; pool?: string[] } = {}): { id: string; qty: number }[] {
  const out = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    let id: string;
    if (opts.pool?.length && rng() < 0.5) id = pick(opts.pool, rng);
    else {
      const r = rng();
      const tier: keyof typeof PARTS_BY_RARITY = r < (opts.epic ?? 0) ? "epic" : r < (opts.epic ?? 0) + (opts.rare ?? 0.2) ? "rare" : "common";
      id = pick(PARTS_BY_RARITY[tier], rng);
    }
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return [...out].map(([id, qty]) => ({ id, qty }));
}
/** one part of a given rarity */
export const onePart = (rng: Rng, rarity: Rarity) => pick(PARTS_BY_RARITY[rarity === "epic" ? "epic" : rarity === "rare" ? "rare" : "common"], rng);

/** the dealer: sell prices (₽ a part he pays) and his own prices; every day he has DEALER_OFFERS parts, DEALER_STOCK of each */
export const PART_SELL: Record<string, number> = { common: 50, rare: 130, epic: 400 };
export const PART_BUY: Record<string, number> = { common: 150, rare: 400 };
/** a missing part bought right in the scheme, for dollars: common 5 $, then twice as much a rarity up */
export const PART_USD: Record<string, number> = { common: 5, rare: 10, epic: 20 };
export const DEALER_OFFERS = 4;
export const DEALER_STOCK = 5;
/** the same four parts for everybody on a Moscow day: three common and one rare, picked by the day */
export function dealerParts(day: string): string[] {
  let seed = [...day].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const common = [...PARTS_BY_RARITY.common].sort(() => rng() - 0.5).slice(0, DEALER_OFFERS - 1);
  return [...common, pick(PARTS_BY_RARITY.rare, rng)];
}
