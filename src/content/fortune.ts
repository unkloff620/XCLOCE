import type { Reward } from "./rewards.ts";
import { ACH_BOX_COST } from "./ach-box.ts";

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
export const TICKET_PRICE = 10;
/** every spin adds this to the jackpot */
export const JACKPOT_ADD = 3;
/** the jackpot starts again from this after it is won */
export const JACKPOT_SEED = 300;
/** «Ящик ништяков» in the shop: this many tickets a box, and one more with the chance `extra` */
export const CASE_TICKETS = { min: 1, extra: 0.4 };
/** «Крутить на все»: at most this many spins at once */
export const SPIN_ALL_MAX = 100;
/** the wheel's experience: a level every this much */
export const FORTUNE_LEVEL_XP = 300;
export const fortuneLevel = (xp: number) => ({ level: 1 + Math.floor(Math.max(0, xp) / FORTUNE_LEVEL_XP), into: Math.max(0, xp) % FORTUNE_LEVEL_XP, need: FORTUNE_LEVEL_XP });

export type SectorKind = "empty" | "prize" | "xp" | "reward" | "tattoo";
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

/** clockwise from the top, as on the picture (tools/fortune/build-wheel.py draws 16 sectors) — the user's list */
export const SECTORS: Sector[] = [
  { id: "keys15", kind: "reward", icon: KEYCAP_ID, label: "15", name: "15 кнопок", weight: 12, reward: { items: [{ id: KEYCAP_ID, qty: 15 }] } },
  { id: "rpg", kind: "reward", icon: "rug-pull-gun", label: "1", name: "Пушка", weight: 4, reward: { items: [{ id: "rug-pull-gun", qty: 1 }] } },
  { id: "keys60", kind: "reward", icon: KEYCAP_ID, label: "60", name: "60 кнопок", weight: 4, reward: { items: [{ id: KEYCAP_ID, qty: 60 }] } },
  { id: "ticket", kind: "reward", icon: TICKET_ID, label: "1", name: "Билет", weight: 9, reward: { items: [{ id: TICKET_ID, qty: 1 }] } },
  { id: "energy", kind: "reward", icon: "energy-drink", label: "1", name: "Энергетик", weight: 8, reward: { items: [{ id: "energy-drink", qty: 1 }] } },
  // the wheel's own tattoo set (for the spins, not the bags' sets): the set is not drawn yet — weight 0, it never
  // falls until it comes (then: its id in WHEEL_TATTOO_SET and a weight here)
  { id: "tattoo", kind: "tattoo", icon: "tattoo", label: "", name: "Наколка", weight: 0 },
  { id: "keys45", kind: "reward", icon: KEYCAP_ID, label: "45", name: "45 кнопок", weight: 6, reward: { items: [{ id: KEYCAP_ID, qty: 45 }] } },
  { id: "prize", kind: "prize", icon: "prize", label: "", name: "ПРИЗ", weight: 3 },
  { id: "rub", kind: "reward", icon: "RUB", label: "10", name: "10 ₽", weight: 10, reward: { currencies: { RUB: 10 } } },
  { id: "token", kind: "reward", icon: "TOKEN", label: "12", name: "12 жетонов", weight: 4, reward: { currencies: { TOKEN: 12 } } },
  { id: "pap", kind: "reward", icon: "PAP", label: "3000", name: "3 000 папирос", weight: 6, reward: { currencies: { PAP: 3000 } } },
  { id: "keys75", kind: "reward", icon: KEYCAP_ID, label: "75", name: "75 кнопок", weight: 3, reward: { items: [{ id: KEYCAP_ID, qty: 75 }] } },
  { id: "xp", kind: "xp", icon: "fortune-xp", label: "30", name: "30 опыта колеса", weight: 12, xp: 30 },
  { id: "gpu", kind: "reward", icon: "gpu", label: "1", name: "Ствол", weight: 6, reward: { items: [{ id: "gpu", qty: 1 }] } },
  { id: "keys30", kind: "reward", icon: KEYCAP_ID, label: "30", name: "30 кнопок", weight: 9, reward: { items: [{ id: KEYCAP_ID, qty: 30 }] } },
  { id: "empty", kind: "empty", icon: "empty", label: "", name: "Пусто", weight: 14 },
];
/** the wheel's own tattoo set (content/tattoos.ts) — none yet */
export const WHEEL_TATTOO_SET: string | null = null;
/** the tattoo sector with every piece of the wheel's set owned: this instead */
export const TATTOO_SECTOR_FALLBACK: Reward = { items: [{ id: KEYCAP_ID, qty: 30 }] };
/** «ПРИЗ»: take this many roubles at once, or risk it on the cups */
export const PRIZE_TAKE_RUB = 500;

/** the spokes bend this many degrees from the hub to the rim (tools/fortune/build-wheel.py CURVE); t = 0 hub … 1 rim */
export const WHEEL_CURVE = 34;
export const spokeBend = (t: number) => WHEEL_CURVE * Math.pow(Math.max(0, Math.min(1, t)), 1.35);
/** the wheel picture: the hub's and the rim's radius as a share of the half-width (134 and 404 px of 512 of fortune/lid-v2.webp) */
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
 * shuffled; the player lifts one. What lies under it is drawn by the server — any of the nine with the same chance,
 * the jackpot too (the shuffle on the screen is only a show — following the jackpot cup with the eye does not win it).
 */
export type CupKind = "energy" | "gpu" | "tickets" | "chips" | "jackpot" | "pap" | "case" | "rpg" | "keyboard";
export interface Cup { kind: CupKind; reward?: Reward }
/** the nine cups: what lies under them (amounts rolled within the user's ranges) */
export const CUP_SET: CupKind[] = ["energy", "gpu", "tickets", "chips", "jackpot", "pap", "case", "rpg", "keyboard"];
/** «Ящик ништяков» = this many achievement points (one more opening of the case in the shop) */
export const CUP_CASE_POINTS = ACH_BOX_COST;

function pick(rng: () => number, from: number, to: number, step = 1) {
  return from + Math.floor(rng() * ((to - from) / step + 1)) * step;
}
export function cupReward(kind: CupKind, rng: () => number): Reward | undefined {
  switch (kind) {
    case "energy": return { items: [{ id: "energy-drink", qty: pick(rng, 4, 7) }] };
    case "gpu": return { items: [{ id: "gpu", qty: pick(rng, 45, 65) }] };
    case "tickets": return { items: [{ id: TICKET_ID, qty: pick(rng, 3, 6) }] };
    case "chips": return { items: [{ id: "poker-chip", qty: pick(rng, 3, 6) }] };
    case "pap": return { currencies: { PAP: pick(rng, 15_000, 29_000, 500) } };
    // «кейсы»: openings of «Ящик ништяков» (its achievement points)
    case "case": return { achPoints: CUP_CASE_POINTS * pick(rng, 2, 5) };
    case "rpg": return { items: [{ id: "rug-pull-gun", qty: pick(rng, 45, 65) }] };
    case "keyboard": return { items: [{ id: "keyboard", qty: pick(rng, 45, 65) }] };
    case "jackpot": return undefined;
  }
}
/** the nine cups in a random order, each with its prize */
export function rollCups(rng: () => number): Cup[] {
  const list = CUP_SET.map((kind) => ({ kind, reward: cupReward(kind, rng) }));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

/*
 * The bag of the wheel: four bags opened for keycaps. A bag gives all of it at once — authority, roubles, dollars and
 * stash pieces — and with BAG_TATTOO_CHANCE a piece of its own tattoo set (one not owned yet), shown in a paper frame.
 */
export interface FortuneBag {
  id: string; name: string;
  /** keycaps to open it */
  price: number;
  /** its tattoo set (content/tattoos.ts, boss "fortune") */
  set: string;
  /** the bag picture's colour (a CSS hue turn of the black bag's stripe and glow) */
  hue: number;
  xp: [number, number]; rub: [number, number]; usd: [number, number]; stash: [number, number];
}
export const BAG_TATTOO_CHANCE = 0.3;
export const FORTUNE_BAGS: FortuneBag[] = [
  { id: "bag1", name: "Сумка с района", price: 140, set: "luck", hue: 0, xp: [200, 400], rub: [800, 1_500], usd: [3, 8], stash: [1, 1] },
  { id: "bag2", name: "Сумка барыги", price: 300, set: "hustler", hue: 140, xp: [500, 1_000], rub: [1_500, 3_000], usd: [8, 15], stash: [1, 1] },
  { id: "bag3", name: "Сумка катрана", price: 600, set: "katran", hue: 220, xp: [1_200, 2_200], rub: [3_000, 6_000], usd: [15, 30], stash: [1, 2] },
  { id: "bag4", name: "Сумка смотрящего", price: 1_200, set: "smotr", hue: 300, xp: [2_500, 4_500], rub: [6_000, 12_000], usd: [30, 60], stash: [2, 3] },
];
export const bagById = (id: string) => FORTUNE_BAGS.find((b) => b.id === id);

/** what the bag gives: every kind, an amount in its range (stash — that many random stash pieces, picked by the caller) */
export function rollBagLoot(bag: FortuneBag, rng: () => number) {
  const roll = ([a, b]: [number, number], step: number) => a + Math.floor(rng() * ((b - a) / step + 1)) * step;
  return { xp: roll(bag.xp, 50), rub: roll(bag.rub, 100), usd: roll(bag.usd, 1), stash: roll(bag.stash, 1) };
}
