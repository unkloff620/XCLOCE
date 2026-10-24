import type { Reward } from "./rewards.ts";

/** One thing that can lie on the ground in the yard. `weight` is relative (draft, overridable via config "yard.drops"). */
export interface YardDrop {
  id: string;
  name: string;
  /** icon id for the client (an item id or a currency icon) */
  icon: string;
  weight: number;
  reward: Reward;
}

export const YARD_SPAWN_MIN = 5;
export const YARD_MAX_ITEMS = 5;

// Weapons never drop in the yard except a rare keyboard (the fist, the mouse and the candle are everyone's anyway).
export const YARD_DROPS: YardDrop[] = [
  { id: "coins", name: "Мелочь из-под лавки", icon: "coins", weight: 43, reward: { currencies: { RUB: 25 } } },
  { id: "sticker-hodl", name: "Стикер HODL", icon: "sticker-hodl", weight: 8, reward: { items: [{ id: "sticker-hodl", qty: 1 }] } },
  { id: "bottle-cap", name: "Крышка от энергетика", icon: "bottle-cap", weight: 8, reward: { items: [{ id: "bottle-cap", qty: 1 }] } },
  { id: "spinner", name: "Спиннер из 2017", icon: "spinner", weight: 7, reward: { items: [{ id: "spinner", qty: 1 }] } },
  { id: "flyer-passive", name: "Листовка «Пассивный доход»", icon: "flyer-passive", weight: 7, reward: { items: [{ id: "flyer-passive", qty: 1 }] } },
  { id: "energy-drink", name: "Энергетик", icon: "energy-drink", weight: 18, reward: { items: [{ id: "energy-drink", qty: 1 }] } },
  { id: "lost-wallet", name: "Забытый кошелёк", icon: "lost-wallet", weight: 8, reward: { currencies: { USD: 0.5 }, items: [{ id: "lost-wallet", qty: 1 }] } },
  { id: "poker-chip", name: "Фишка", icon: "poker-chip", weight: 5, reward: { items: [{ id: "poker-chip", qty: 1 }] } },
  { id: "keyboard", name: "Клавиатура", icon: "keyboard", weight: 1, reward: { items: [{ id: "keyboard", qty: 1 }] } },
];

/*
 * Time of day in the yard (Moscow time): the picture is tinted to match, and at night rare finds come more often.
 * day 8–17, evening 17–22, night 22–5, morning 5–8.
 */
export type YardTime = "morning" | "day" | "evening" | "night";
export function yardTime(now: number): YardTime {
  const h = new Date(now + 3 * 3600_000).getUTCHours();
  return h >= 22 || h < 5 ? "night" : h < 8 ? "morning" : h < 17 ? "day" : "evening";
}
/** at night these finds are this many times likelier (the dark hides a lot under the benches) */
export const NIGHT_BOOST: Record<string, number> = { "poker-chip": 2, "lost-wallet": 2, keyboard: 2 };
