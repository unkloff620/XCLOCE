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
export const JACKPOT_SEED = 10_000;
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
/** the wheel picture: the hub's and the rim's radius as a share of the half-width (134 and 404 px of 512) */
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
