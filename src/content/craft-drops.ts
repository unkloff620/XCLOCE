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
};

/** each boss's own very rare part: it may drop for a win over him */
export const BOSS_PARTS: Record<string, string> = {
  datsik: "part-motor", kedr: "part-gyro", mugo: "part-neodym", garkusha: "part-titanium", bebyakyan: "part-tesla",
  babafey: "part-pump", vodovoz: "part-carbon", knyaz: "part-quartz", vadim: "part-chip", botsman: "part-accu",
  utilizator: "part-cooler", fokus: "part-laser", solntse: "part-saltpeter", pepe: "part-sulfur",
};

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
export const DEALER_OFFERS = 4;
export const DEALER_STOCK = 5;
/** the same four parts for everybody on a Moscow day: three common and one rare, picked by the day */
export function dealerParts(day: string): string[] {
  let seed = [...day].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const common = [...PARTS_BY_RARITY.common].sort(() => rng() - 0.5).slice(0, DEALER_OFFERS - 1);
  return [...common, pick(PARTS_BY_RARITY.rare, rng)];
}
