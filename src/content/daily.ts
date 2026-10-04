import type { Reward } from "./rewards.ts";

/*
 * Награды за вход: цикл из 7 дней. Забирать раз в московские сутки.
 * Пропустил день — серия начинается с 1-го дня. После 7-го дня цикл идёт заново.
 * Каждый день награда больше предыдущей, 7-й — редкое оружие. Черновые значения — переопределяются через config "daily".
 */
export const DAILY_REWARDS: Reward[] = [
  { currencies: { RUB: 300 } },
  { currencies: { RUB: 500 }, items: [{ id: "red-candle", qty: 2 }] },
  { currencies: { RUB: 700 }, energy: 25 },
  { currencies: { RUB: 900 }, items: [{ id: "keyboard", qty: 1 }] },
  { currencies: { USD: 10 }, energy: 40 },
  { currencies: { USD: 15 }, items: [{ id: "gpu", qty: 1 }] },
  // 7th day: the rare one — a legendary weapon
  { currencies: { SOL: 0.03 }, items: [{ id: "rug-pull-gun", qty: 1 }] },
];
