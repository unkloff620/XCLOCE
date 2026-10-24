import type { Reward } from "./rewards.ts";

/*
 * Награды за вход: цикл из 7 дней. Забирать раз в московские сутки.
 * Пропустил день — серия начинается с 1-го дня. После 7-го дня цикл идёт заново.
 * Каждый день награда больше предыдущей, 7-й — редкое оружие. Черновые значения — переопределяются через config "daily".
 */
export const DAILY_REWARDS: Reward[] = [
  { currencies: { RUB: 300 }, xp: 200 },
  { currencies: { RUB: 500 }, items: [{ id: "keyboard", qty: 1 }], xp: 400 },
  { currencies: { RUB: 700 }, energy: 25, xp: 700 },
  { currencies: { RUB: 900 }, items: [{ id: "keyboard", qty: 1 }], xp: 1_000 },
  { currencies: { USD: 10 }, energy: 40, xp: 1_500 },
  { currencies: { USD: 15 }, items: [{ id: "gpu", qty: 1 }], xp: 2_500 },
  // 7th day: the rare one — a legendary weapon
  { currencies: { SOL: 0.03 }, items: [{ id: "rug-pull-gun", qty: 1 }], xp: 5_000 },
];

/*
 * Бонус серии: сверх награды дня на 7-й, 14-й и 30-й день подряд (дальше — каждые 30 дней).
 * Пропустил день — серия, а с ней и путь к бонусу, начинаются заново.
 */
export const STREAK_BONUS: { at: number; reward: Reward }[] = [
  { at: 7, reward: { items: [{ id: "poker-chip", qty: 5 }] } },
  { at: 14, reward: { currencies: { USD: 20 }, items: [{ id: "gpu", qty: 2 }, { id: "poker-chip", qty: 5 }] } },
  { at: 30, reward: { currencies: { SOL: 0.1 }, items: [{ id: "rug-pull-gun", qty: 3 }, { id: "poker-chip", qty: 15 }] } },
];
/** the streak bonus for reaching `streak` days in a row, if any (30, 60, 90… all get the 30-day one) */
export function streakBonus(streak: number): Reward | null {
  const hit = STREAK_BONUS.find((b) => b.at === streak);
  if (hit) return hit.reward;
  return streak > 30 && streak % 30 === 0 ? STREAK_BONUS[STREAK_BONUS.length - 1].reward : null;
}
/** the next streak bonus after `streak` days */
export function nextStreakBonus(streak: number): { at: number; reward: Reward } {
  const b = STREAK_BONUS.find((x) => x.at > streak);
  if (b) return b;
  const at = (Math.floor(streak / 30) + 1) * 30;
  return { at, reward: STREAK_BONUS[STREAK_BONUS.length - 1].reward };
}
