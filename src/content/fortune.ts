import type { Reward } from "./rewards.ts";

/*
 * «Колесо удачи» — a manhole wheel in the back yard. A spin costs one ticket (from the case in the shop, or bought for
 * TICKET_PRICE roubles); every spin of anybody adds JACKPOT_ADD to the shared jackpot. The wheel stops on one of its
 * sectors: a prize, nothing («Пусто»), or «ПРИЗ» — the cups game (nine cups, one of them holds the jackpot).
 * The sectors are equal on the picture; how often each comes is its weight (the wheel is turned to it by the server).
 */

export const TICKET_ID = "fortune-ticket";
/** «кнопки от клавиатуры» — the wheel's own money: the bag's boxes of tattoo sets are opened for them */
export const KEYCAP_ID = "keycap";
/** a ticket in the shop of the wheel, roubles */
export const TICKET_PRICE = 150;
/** every spin adds this to the jackpot */
export const JACKPOT_ADD = 150;
/** the jackpot starts again from this after it is won */
export const JACKPOT_SEED = 5_000;
/** «Ящик ништяков» in the shop: this many tickets a box, and one more with the chance `extra` */
export const CASE_TICKETS = { min: 1, extra: 0.4 };
/** «Крутить на все»: at most this many spins at once */
export const SPIN_ALL_MAX = 100;
/** the wheel's experience: a level every this much */
export const FORTUNE_LEVEL_XP = 300;
export const fortuneLevel = (xp: number) => ({ level: 1 + Math.floor(Math.max(0, xp) / FORTUNE_LEVEL_XP), into: Math.max(0, xp) % FORTUNE_LEVEL_XP, need: FORTUNE_LEVEL_XP });

export type SectorKind = "empty" | "prize" | "xp" | "reward";
export interface Sector {
  id: string;
  kind: SectorKind;
  /** what it shows: an item / currency icon and the number on the wheel */
  icon: string;
  label: string;
  /** the text in the result line */
  name: string;
  weight: number;
  reward?: Reward;
  xp?: number;
}

/** clockwise from the top, as on the picture (tools/fortune/build-wheel.py draws 13 sectors) */
export const SECTORS: Sector[] = [
  { id: "empty", kind: "empty", icon: "empty", label: "", name: "Пусто", weight: 14 },
  { id: "rub", kind: "reward", icon: "RUB", label: "150", name: "150 ₽", weight: 14, reward: { currencies: { RUB: 150 } } },
  { id: "keys15", kind: "reward", icon: KEYCAP_ID, label: "15", name: "15 кнопок", weight: 12, reward: { items: [{ id: KEYCAP_ID, qty: 15 }] } },
  { id: "gpu", kind: "reward", icon: "gpu", label: "1", name: "Видеокарта", weight: 4, reward: { items: [{ id: "gpu", qty: 1 }] } },
  { id: "xp", kind: "xp", icon: "fortune-xp", label: "30", name: "30 опыта колеса", weight: 12, xp: 30 },
  { id: "keys30", kind: "reward", icon: KEYCAP_ID, label: "30", name: "30 кнопок", weight: 9, reward: { items: [{ id: KEYCAP_ID, qty: 30 }] } },
  { id: "prize", kind: "prize", icon: "prize", label: "", name: "ПРИЗ", weight: 3 },
  { id: "energy", kind: "reward", icon: "energy-drink", label: "1", name: "Энергетик", weight: 10, reward: { items: [{ id: "energy-drink", qty: 1 }] } },
  { id: "keys45", kind: "reward", icon: KEYCAP_ID, label: "45", name: "45 кнопок", weight: 6, reward: { items: [{ id: KEYCAP_ID, qty: 45 }] } },
  { id: "ticket", kind: "reward", icon: TICKET_ID, label: "1", name: "Билет", weight: 9, reward: { items: [{ id: TICKET_ID, qty: 1 }] } },
  { id: "usd", kind: "reward", icon: "USD", label: "10", name: "10 $", weight: 2, reward: { currencies: { USD: 10 } } },
  { id: "keys75", kind: "reward", icon: KEYCAP_ID, label: "75", name: "75 кнопок", weight: 3, reward: { items: [{ id: KEYCAP_ID, qty: 75 }] } },
  { id: "rpg", kind: "reward", icon: "rug-pull-gun", label: "1", name: "Rug Pull Gun", weight: 2, reward: { items: [{ id: "rug-pull-gun", qty: 1 }] } },
];

/** the spokes bend this many degrees from the hub to the rim (tools/fortune/build-wheel.py CURVE); t = 0 hub … 1 rim */
export const WHEEL_CURVE = 34;
export const spokeBend = (t: number) => WHEEL_CURVE * Math.pow(Math.max(0, Math.min(1, t)), 1.35);
/** the wheel picture: the hub's and the rim's radius as a share of the half-width (134 and 404 px of 512 of fortune/lid-v1.webp) */
export const WHEEL_R = { hub: 134 / 512, rim: 404 / 512 };

export function rollSector(rng: () => number): number {
  const total = SECTORS.reduce((s, x) => s + x.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < SECTORS.length; i++) {
    r -= SECTORS[i].weight;
    if (r < 0) return i;
  }
  return SECTORS.length - 1;
}

/*
 * «ПРИЗ» — the cups: nine upside-down mugs, each over a prize (one over the jackpot). They are lifted, put down and
 * shuffled; the player lifts one. What lies under it is drawn by the server by CUP_WEIGHTS (the shuffle on the screen
 * is only a show — following the jackpot cup with the eye does not win it).
 */
export type CupKind = "rub" | "weapon" | "usd" | "chips" | "jackpot" | "case" | "keys";
export interface Cup { kind: CupKind; reward?: Reward }
/** the nine cups: what lies under them (amounts rolled a little) */
export const CUP_SET: CupKind[] = ["jackpot", "rub", "rub", "weapon", "usd", "chips", "case", "keys", "keys"];
/** how often each kind is the one lifted (for a kind with two cups — either of them) */
export const CUP_WEIGHTS: Record<CupKind, number> = { jackpot: 4, rub: 26, weapon: 14, usd: 12, chips: 12, case: 8, keys: 24 };
/** «Ящик ништяков» = this many achievement points (one more opening of the case in the shop) */
export const CUP_CASE_POINTS = 5;

function pick(rng: () => number, from: number, to: number, step = 1) {
  return from + Math.floor(rng() * ((to - from) / step + 1)) * step;
}
export function cupReward(kind: CupKind, rng: () => number): Reward | undefined {
  switch (kind) {
    case "rub": return { currencies: { RUB: pick(rng, 1000, 3000, 250) } };
    case "usd": return { currencies: { USD: pick(rng, 10, 30, 5) } };
    case "weapon": return rng() < 0.5 ? { items: [{ id: "rug-pull-gun", qty: pick(rng, 1, 2) }] } : { items: [{ id: "gpu", qty: pick(rng, 2, 3) }] };
    case "chips": return { items: [{ id: "poker-chip", qty: pick(rng, 3, 5) }] };
    case "case": return { achPoints: CUP_CASE_POINTS };
    case "keys": return { items: [{ id: KEYCAP_ID, qty: pick(rng, 50, 150, 10) }] };
    case "jackpot": return undefined;
  }
}
/** the nine cups in a random order, each with its prize */
export function rollCups(rng: () => number): Cup[] {
  const list = CUP_SET.map((kind) => ({ kind, reward: cupReward(kind, rng) }));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
/** the kind under the lifted cup */
export function rollCupKind(rng: () => number): CupKind {
  const e = Object.entries(CUP_WEIGHTS) as [CupKind, number][];
  let r = rng() * e.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of e) { r -= w; if (r < 0) return k; }
  return "rub";
}

/*
 * The bag of the wheel: four bags opened for keycaps. A bag gives one prize — authority, roubles, a stash or dollars — and
 * with BAG_TATTOO_CHANCE a piece of its own tattoo set (one not owned yet), shown in a paper frame.
 */
export type BagPrize = "xp" | "rub" | "stash" | "usd";
export interface FortuneBag {
  id: string; name: string;
  /** keycaps to open it */
  price: number;
  /** its tattoo set (content/tattoos.ts, boss "fortune"); null — the set is not drawn yet */
  set: string | null;
  /** the bag picture's colour (a CSS hue turn of the black bag's stripe and glow) */
  hue: number;
  xp: [number, number]; rub: [number, number]; usd: [number, number]; stash: [number, number];
}
export const BAG_TATTOO_CHANCE = 0.3;
export const BAG_PRIZE_WEIGHTS: Record<BagPrize, number> = { xp: 30, rub: 35, stash: 15, usd: 20 };
export const FORTUNE_BAGS: FortuneBag[] = [
  { id: "bag1", name: "Сумка с района", price: 140, set: null, hue: 0, xp: [300, 800], rub: [1_500, 3_000], usd: [5, 15], stash: [1, 1] },
  { id: "bag2", name: "Сумка барыги", price: 300, set: null, hue: 140, xp: [800, 2_000], rub: [3_000, 6_000], usd: [15, 30], stash: [1, 2] },
  { id: "bag3", name: "Сумка катрана", price: 600, set: null, hue: 220, xp: [2_000, 4_500], rub: [6_000, 12_000], usd: [30, 60], stash: [2, 3] },
  { id: "bag4", name: "Сумка смотрящего", price: 1_200, set: null, hue: 300, xp: [4_500, 9_000], rub: [12_000, 25_000], usd: [60, 120], stash: [3, 5] },
];
export const bagById = (id: string) => FORTUNE_BAGS.find((b) => b.id === id);

/** the bag's prize: which kind, and how much (a stash — that many random stash pieces, picked by the caller) */
export function rollBagPrize(bag: FortuneBag, rng: () => number): { kind: BagPrize; amount: number } {
  const e = Object.entries(BAG_PRIZE_WEIGHTS) as [BagPrize, number][];
  let r = rng() * e.reduce((s, [, w]) => s + w, 0);
  let kind: BagPrize = "rub";
  for (const [k, w] of e) { r -= w; if (r < 0) { kind = k; break; } }
  const [a, b] = bag[kind];
  const step = kind === "rub" ? 100 : kind === "xp" ? 50 : 1;
  return { kind, amount: a + Math.floor(rng() * ((b - a) / step + 1)) * step };
}
