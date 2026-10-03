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

// Mouse, GPU and Rug Pull Gun never drop in the yard.
export const YARD_DROPS: YardDrop[] = [
  { id: "coins", name: "Мелочь из-под лавки", icon: "coins", weight: 40, reward: { currencies: { RUB: 25 } } },
  { id: "sticker-hodl", name: "Стикер HODL", icon: "sticker-hodl", weight: 8, reward: { items: [{ id: "sticker-hodl", qty: 1 }] } },
  { id: "bottle-cap", name: "Крышка от энергетика", icon: "bottle-cap", weight: 8, reward: { items: [{ id: "bottle-cap", qty: 1 }] } },
  { id: "spinner", name: "Спиннер из 2017", icon: "spinner", weight: 7, reward: { items: [{ id: "spinner", qty: 1 }] } },
  { id: "flyer-passive", name: "Листовка «Пассивный доход»", icon: "flyer-passive", weight: 7, reward: { items: [{ id: "flyer-passive", qty: 1 }] } },
  { id: "energy-drink", name: "Энергетик", icon: "energy-drink", weight: 18, reward: { items: [{ id: "energy-drink", qty: 1 }] } },
  { id: "lost-wallet", name: "Забытый кошелёк", icon: "lost-wallet", weight: 8, reward: { currencies: { USD: 0.5 }, items: [{ id: "lost-wallet", qty: 1 }] } },
  { id: "red-candle", name: "Красная свеча", icon: "red-candle", weight: 3, reward: { items: [{ id: "red-candle", qty: 1 }] } },
  { id: "keyboard", name: "Клавиатура", icon: "keyboard", weight: 1, reward: { items: [{ id: "keyboard", qty: 1 }] } },
];
