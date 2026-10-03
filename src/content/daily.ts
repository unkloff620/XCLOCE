import type { Reward } from "./rewards.ts";

/*
 * Награды за вход: цикл из 7 дней. Забирать раз в московские сутки.
 * Пропустил день — серия начинается с 1-го дня. После 7-го дня цикл идёт заново.
 * Черновые значения — переопределяются через config "daily".
 */
export const DAILY_REWARDS: Reward[] = [
  { currencies: { RUB: 300 }, xp: 10 },
  { items: [{ id: "red-candle", qty: 2 }], xp: 15 },
  { energy: 20, xp: 20 },
  { currencies: { RUB: 700 }, items: [{ id: "keyboard", qty: 1 }], xp: 25 },
  { currencies: { USD: 10 }, xp: 30 },
  { energy: 50, items: [{ id: "energy-drink", qty: 2 }], xp: 40 },
  { currencies: { SOL: 0.02 }, items: [{ id: "gpu", qty: 1 }], xp: 60 },
];
