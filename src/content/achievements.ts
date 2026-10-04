import type { Reward } from "./rewards.ts";

/*
 * Достижения: значок в профиле + разовая награда. Прогресс считается сервером из того, что уже записано
 * (статистика, бои, локации, серия входов) — отдельно ничего копить не нужно.
 */

/** what a badge measures (server: systems/achievements.ts → statsFor) */
export type AchStat = "hits" | "damage" | "wins" | "kills" | "locations" | "tasks" | "yard" | "bestStreak" | "level" | "clan" | "chests" | "weeklyTop";

export type AchTier = "bronze" | "silver" | "gold";

export interface AchievementDef {
  id: string;
  name: string;
  hint: string;
  stat: AchStat;
  target: number;
  tier: AchTier;
  /** icon name from art/icons.tsx */
  icon: string;
  reward: Reward;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-blood", name: "Первая кровь", hint: "Ударь любого босса", stat: "hits", target: 1, tier: "bronze", icon: "swords", reward: { currencies: { RUB: 200 } } },
  { id: "hits-100", name: "Разогрелся", hint: "Нанеси 100 ударов", stat: "hits", target: 100, tier: "silver", icon: "swords", reward: { currencies: { RUB: 800 }, items: [{ id: "keyboard", qty: 1 }] } },
  { id: "hits-1000", name: "Тысяча ударов", hint: "Нанеси 1 000 ударов", stat: "hits", target: 1000, tier: "gold", icon: "swords", reward: { currencies: { USD: 25 }, items: [{ id: "gpu", qty: 2 }] } },
  { id: "dmg-10k", name: "Ощутимо", hint: "Нанеси боссам 10 000 урона", stat: "damage", target: 10_000, tier: "silver", icon: "fire", reward: { currencies: { RUB: 1500 } } },
  { id: "dmg-100k", name: "Разрушитель", hint: "Нанеси боссам 100 000 урона", stat: "damage", target: 100_000, tier: "gold", icon: "fire", reward: { currencies: { SOL: 0.05 }, items: [{ id: "rug-pull-gun", qty: 1 }] } },
  { id: "win-1", name: "Первая победа", hint: "Выиграй бой с боссом", stat: "wins", target: 1, tier: "bronze", icon: "trophy", reward: { currencies: { RUB: 300 } } },
  { id: "win-25", name: "Гроза офиса", hint: "Выиграй 25 боёв", stat: "wins", target: 25, tier: "gold", icon: "trophy", reward: { currencies: { USD: 20 }, items: [{ id: "gpu", qty: 1 }] } },
  { id: "kill-1", name: "Добивающий", hint: "Нанеси последний удар боссу", stat: "kills", target: 1, tier: "silver", icon: "key", reward: { currencies: { USD: 5 } } },
  { id: "loc-1", name: "Стажёр", hint: "Пройди первую локацию", stat: "locations", target: 1, tier: "bronze", icon: "map", reward: { energy: 20 } },
  { id: "loc-all", name: "Весь офис наш", hint: "Пройди все локации", stat: "locations", target: 5, tier: "gold", icon: "map", reward: { currencies: { USD: 30 }, energy: 100 } },
  { id: "tasks-25", name: "Исполнительный", hint: "Выполни 25 заданий в локациях", stat: "tasks", target: 25, tier: "silver", icon: "energy", reward: { currencies: { RUB: 1000 }, energy: 30 } },
  { id: "yard-100", name: "Барахольщик", hint: "Подбери 100 находок во дворе", stat: "yard", target: 100, tier: "silver", icon: "chest", reward: { currencies: { RUB: 1000 } } },
  { id: "streak-7", name: "Неделя подряд", hint: "Заходи 7 дней подряд", stat: "bestStreak", target: 7, tier: "silver", icon: "gift", reward: { currencies: { USD: 5 } } },
  { id: "streak-30", name: "Без выходных", hint: "Заходи 30 дней подряд", stat: "bestStreak", target: 30, tier: "gold", icon: "gift", reward: { currencies: { SOL: 0.05 }, items: [{ id: "rug-pull-gun", qty: 1 }] } },
  { id: "level-10", name: "Авторитет", hint: "Достигни 10 уровня", stat: "level", target: 10, tier: "silver", icon: "xp", reward: { currencies: { USD: 10 } } },
  { id: "level-25", name: "Легенда офиса", hint: "Достигни 25 уровня", stat: "level", target: 25, tier: "gold", icon: "xp", reward: { currencies: { SOL: 0.05 } } },
  { id: "clan", name: "Командный игрок", hint: "Вступи в клан или создай свой", stat: "clan", target: 1, tier: "bronze", icon: "user", reward: { currencies: { RUB: 300 } } },
  { id: "chests-7", name: "Охотник за сундуками", hint: "Открой 7 сундуков дня", stat: "chests", target: 7, tier: "silver", icon: "chest", reward: { currencies: { USD: 5 }, items: [{ id: "keyboard", qty: 2 }] } },
  { id: "weekly-top", name: "В десятке", hint: "Попади в топ-10 недели по урону", stat: "weeklyTop", target: 1, tier: "gold", icon: "trophy", reward: { currencies: { USD: 10 } } },
];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);

/* ---------------- weekly rating ---------------- */

/** Prizes for the weekly damage top-10, by place (index 0 = 1st place). */
export const WEEKLY_PRIZES: Reward[] = [
  { currencies: { SOL: 0.1, USD: 30 }, items: [{ id: "rug-pull-gun", qty: 2 }] },
  { currencies: { SOL: 0.06, USD: 20 }, items: [{ id: "rug-pull-gun", qty: 1 }] },
  { currencies: { SOL: 0.04, USD: 15 }, items: [{ id: "gpu", qty: 2 }] },
  ...Array.from({ length: 7 }, () => ({ currencies: { USD: 10 }, items: [{ id: "gpu", qty: 1 }] }) as Reward),
];
/** Every member of the top-3 clans of the week. */
export const CLAN_PRIZES: Reward[] = [
  { currencies: { USD: 10 }, items: [{ id: "keyboard", qty: 2 }] },
  { currencies: { USD: 6 }, items: [{ id: "keyboard", qty: 1 }] },
  { currencies: { USD: 4 } },
];

/** frame on the player card for last week's place */
export type Frame = "gold" | "silver" | "bronze" | "top";
export function frameOf(place: number | null | undefined): Frame | null {
  if (!place) return null;
  return place === 1 ? "gold" : place === 2 ? "silver" : place === 3 ? "bronze" : place <= 10 ? "top" : null;
}
