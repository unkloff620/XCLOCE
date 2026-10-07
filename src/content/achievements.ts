import type { Reward } from "./rewards.ts";
import { BOSSES, type CardTier } from "./bosses.ts";

/*
 * Достижения: значок в профиле + разовая награда. Прогресс считается сервером из того, что уже записано
 * (статистика, бои, локации, серия входов) — отдельно ничего копить не нужно.
 */

/** what a badge measures (server: systems/achievements.ts → statsFor) */
export type AchStat = "authority" | "damage" | "hits" | "wins" | "soloWins" | "kills" | "locations" | "tasks" | "yard" | "bestStreak" | "chests" | "weeklyTop" | `solo:${string}` | `win:${string}`;

/** 1 bronze · 2 silver · 3 gold · 4 platinum · 5 diamond */
export type AchTier = 1 | 2 | 3 | 4 | 5;
export const TIER_NAMES: Record<AchTier, string> = { 1: "Бронза", 2: "Серебро", 3: "Золото", 4: "Платина", 5: "Бриллиант" };
export const TIER_COLORS: Record<AchTier, string> = { 1: "#d0803f", 2: "#c3cdde", 3: "#ffcc33", 4: "#5ff0dc", 5: "#c07bff" };

export interface AchCategory {
  id: string;
  name: string;
  /** "Набери {n} авторитета" — {n} becomes the tier's target */
  hint: string;
  stat: AchStat;
  icon: string;
  /** five thresholds, bronze → diamond */
  targets: [number, number, number, number, number];
}

export const ACH_CATEGORIES: AchCategory[] = [
  { id: "authority", name: "Авторитет", hint: "Набери {n} авторитета", stat: "authority", icon: "xp", targets: [10_000, 500_000, 2_500_000, 5_000_000, 10_000_000] },
  { id: "damage", name: "Урон боссам", hint: "Нанеси боссам {n} урона", stat: "damage", icon: "ach-damage", targets: [1_000, 25_000, 250_000, 1_000_000, 5_000_000] },
  { id: "hits", name: "Удары", hint: "Нанеси {n} ударов", stat: "hits", icon: "ach-hits", targets: [10, 100, 1_000, 5_000, 20_000] },
  { id: "wins", name: "Победы", hint: "Выиграй {n} боёв с боссами", stat: "wins", icon: "ach-wins", targets: [1, 10, 50, 200, 500] },
  { id: "solo", name: "Соло", hint: "Победи босса в одиночку (бой «Соло») {n} раз", stat: "soloWins", icon: "swords", targets: [1, 5, 25, 100, 300] },
  { id: "kills", name: "Добивающий", hint: "Нанеси последний удар боссу {n} раз", stat: "kills", icon: "key", targets: [1, 5, 25, 100, 250] },
  { id: "locations", name: "Локации", hint: "Пройди локации {n} раз (повторы считаются)", stat: "locations", icon: "map", targets: [1, 5, 20, 50, 100] },
  { id: "tasks", name: "Задания", hint: "Выполни {n} заданий в локациях", stat: "tasks", icon: "energy", targets: [5, 25, 100, 300, 1_000] },
  { id: "yard", name: "Барахольщик", hint: "Подбери во дворе {n} находок", stat: "yard", icon: "ach-yard", targets: [10, 100, 500, 2_000, 5_000] },
  { id: "streak", name: "Серия входов", hint: "Заходи {n} дней подряд", stat: "bestStreak", icon: "gift", targets: [3, 7, 14, 30, 60] },
  { id: "chests", name: "Сундуки дня", hint: "Открой {n} сундуков за задания дня", stat: "chests", icon: "ach-chests", targets: [1, 7, 30, 100, 365] },
  { id: "weekly", name: "Топ недели", hint: "Попади в топ-10 недели по урону {n} раз", stat: "weeklyTop", icon: "ach-weekly", targets: [1, 3, 10, 25, 50] },
];

/** the same reward for a tier in every category: the higher, the richer */
export const TIER_REWARDS: Record<AchTier, Reward> = {
  1: { currencies: { RUB: 500 }, xp: 1_000 },
  2: { currencies: { USD: 10 }, xp: 10_000, items: [{ id: "keyboard", qty: 2 }] },
  3: { currencies: { USD: 30 }, xp: 50_000, items: [{ id: "gpu", qty: 2 }] },
  4: { currencies: { SOL: 0.1 }, xp: 150_000, items: [{ id: "rug-pull-gun", qty: 1 }] },
  5: { currencies: { SOL: 0.3 }, xp: 500_000, items: [{ id: "rug-pull-gun", qty: 3 }] },
};

export interface AchievementDef {
  id: string;
  category: string;
  name: string;
  hint: string;
  stat: AchStat;
  target: number;
  tier: AchTier;
  icon: string;
  reward: Reward;
}

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/\u00a0/g, " ");

/** the pass tier of a boss → the medal and reward tier of beating him solo (the final boss counts as diamond) */
const CARD_TO_TIER: Record<CardTier, AchTier> = { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5 };

/** One badge per boss: win a solo fight against him once. Stat "solo:<boss id>" = solo wins over that boss. */
export const SOLO_BOSS_ACHIEVEMENTS: AchievementDef[] = BOSSES.map((b) => {
  const tier = b.card ? CARD_TO_TIER[b.card] : 5;
  return {
    id: `soloboss-${b.id}`, category: "solo-boss", name: `Соло: ${b.name}`, hint: `Убей босса ${b.name} в одиночку (бой «Соло»)`,
    stat: `solo:${b.id}` as const, target: 1, tier, icon: "swords", reward: TIER_REWARDS[tier],
  };
});

/** «Убийца боссов»: three medals per boss — bronze, silver and gold for 10, 50 and 100 wins. Stat "win:<boss id>". */
export const BOSS_KILL_TARGETS = [10, 50, 100] as const;
export const BOSS_KILL_ACHIEVEMENTS: AchievementDef[] = BOSSES.flatMap((b) =>
  BOSS_KILL_TARGETS.map((target, i) => {
    const tier = (i + 1) as AchTier;
    return {
      id: `bosskill-${b.id}-${tier}`, category: "boss-kill", name: `${b.name}: ${TIER_NAMES[tier]}`, hint: `Победи босса ${b.name} ${target} раз`,
      stat: `win:${b.id}` as const, target, tier, icon: "ach-wins", reward: TIER_REWARDS[tier],
    };
  }),
);

export const ACHIEVEMENTS: AchievementDef[] = [
  ...ACH_CATEGORIES.flatMap((c) =>
    c.targets.map((target, i) => {
      const tier = (i + 1) as AchTier;
      return { id: `${c.id}-${tier}`, category: c.id, name: `${c.name}: ${TIER_NAMES[tier]}`, hint: c.hint.replace("{n}", fmt(target)), stat: c.stat, target, tier, icon: c.icon, reward: TIER_REWARDS[tier] };
    }),
  ),
  ...SOLO_BOSS_ACHIEVEMENTS,
  ...BOSS_KILL_ACHIEVEMENTS,
];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);

/* ---------------- weekly rating ---------------- */

/** Prizes for the weekly damage top-10, by place (index 0 = 1st place). */
export const WEEKLY_PRIZES: Reward[] = [
  { currencies: { SOL: 0.1, USD: 30 }, xp: 300_000, items: [{ id: "rug-pull-gun", qty: 2 }] },
  { currencies: { SOL: 0.06, USD: 20 }, xp: 200_000, items: [{ id: "rug-pull-gun", qty: 1 }] },
  { currencies: { SOL: 0.04, USD: 15 }, xp: 150_000, items: [{ id: "gpu", qty: 2 }] },
  ...Array.from({ length: 7 }, () => ({ currencies: { USD: 10 }, xp: 50_000, items: [{ id: "gpu", qty: 1 }] }) as Reward),
];
/** Every member of the top-10 clans of the week (by the members' damage that week); places 4–10 get the same. */
export const CLAN_PRIZES: Reward[] = [
  { currencies: { RUB: 5000 }, xp: 10_000, items: [{ id: "rug-pull-gun", qty: 3 }] },
  { currencies: { RUB: 2500 }, xp: 5_000, items: [{ id: "rug-pull-gun", qty: 1 }] },
  { currencies: { RUB: 1250 }, xp: 2_500, items: [{ id: "gpu", qty: 1 }] },
  ...Array.from({ length: 7 }, () => ({ currencies: { RUB: 250 }, xp: 500, items: [{ id: "keyboard", qty: 1 }] }) as Reward),
];

/** frame on the player card for last week's place */
export type Frame = "gold" | "silver" | "bronze" | "top";
export function frameOf(place: number | null | undefined): Frame | null {
  if (!place) return null;
  return place === 1 ? "gold" : place === 2 ? "silver" : place === 3 ? "bronze" : place <= 10 ? "top" : null;
}
