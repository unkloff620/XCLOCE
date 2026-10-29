import type { Reward } from "./rewards.ts";
import { BOSSES, type CardTier } from "./bosses.ts";
import { STASH_MEDAL_TARGETS, STASH_SETS_ORDERED } from "./stashes.ts";
import { MEDAL_NAMES, MEDAL_SET, MEDAL_TIERS, FIGHT_MODES } from "./medals.ts";

/*
 * Достижения: значок в профиле + разовая награда. Прогресс считается сервером из того, что уже записано
 * (статистика, бои, локации, серия входов) — отдельно ничего копить не нужно.
 */

/** what a badge measures (server: systems/achievements.ts → statsFor) */
export type AchStat = "authority" | "damage" | "hits" | "wins" | "soloWins" | "kills" | "locations" | "tasks" | "yard" | "bestStreak" | "chests" | "weeklyTop" | `solo:${string}` | `win:${string}` | `stashsets:${number}` | `medal:${string}`
  // the second set: modes, money, mini games, clans, the yard's social life (server: systems/achievements.ts)
  | "winsBlat" | "winsAvtor" | "bossesBeaten" | "exchanges" | "spentRUB" | "spentUSD" | "haveRUB" | "haveUSD" | "haveSOL" | "haveBTC"
  | "slotSpins" | "slot777" | "slotLevel" | "upgWins" | "upgLowWins" | "upgStreak" | "zonkGames" | "zonkBest" | "zonkDuels" | "pokerHands" | "pokerLevel"
  | "bjBlackjacks" | "bjWins" | "clanDays" | "clanBosses" | "clanCreated" | "spits" | "raids" | "nishtyaks";

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
  /** the thresholds, bronze → diamond (five; a one-off has one) */
  targets: number[];
}

export const ACH_CATEGORIES: AchCategory[] = [
  { id: "authority", name: "Авторитет", hint: "Набери {n} авторитета", stat: "authority", icon: "xp", targets: [10_000, 500_000, 2_500_000, 5_000_000, 10_000_000] },
  { id: "damage", name: "Урон боссам", hint: "Нанеси боссам {n} урона", stat: "damage", icon: "ach-damage", targets: [1_000, 25_000, 250_000, 1_000_000, 5_000_000] },
  { id: "hits", name: "Удары", hint: "Нанеси {n} ударов", stat: "hits", icon: "ach-hits", targets: [10, 100, 1_000, 5_000, 20_000] },
  { id: "wins", name: "Победы", hint: "Выиграй {n} боёв с боссами", stat: "wins", icon: "ach-wins", targets: [1, 10, 50, 200, 500] },
  { id: "solo", name: "Соло", hint: "Победи босса в одиночку (бой «Соло») {n} раз", stat: "soloWins", icon: "ach-solo", targets: [1, 5, 25, 100, 300] },
  { id: "kills", name: "Добивающий", hint: "Нанеси последний удар боссу {n} раз", stat: "kills", icon: "key", targets: [1, 5, 25, 100, 250] },
  { id: "locations", name: "Локации", hint: "Пройди локации {n} раз (повторы считаются)", stat: "locations", icon: "map", targets: [1, 5, 20, 50, 100] },
  { id: "tasks", name: "Задания", hint: "Выполни {n} заданий в локациях", stat: "tasks", icon: "energy", targets: [5, 25, 100, 300, 1_000] },
  { id: "yard", name: "Барахольщик", hint: "Подбери во дворе {n} находок", stat: "yard", icon: "ach-yard", targets: [10, 100, 500, 2_000, 5_000] },
  { id: "streak", name: "Серия входов", hint: "Заходи {n} дней подряд", stat: "bestStreak", icon: "gift", targets: [3, 7, 14, 30, 60] },
  { id: "chests", name: "Сундуки дня", hint: "Открой {n} сундуков за задания дня", stat: "chests", icon: "ach-chests", targets: [1, 7, 30, 100, 365] },
  { id: "weekly", name: "Топ недели", hint: "Попади в топ-10 недели по урону {n} раз", stat: "weeklyTop", icon: "ach-weekly", targets: [1, 3, 10, 25, 50] },
  // ---- the second set ----
  { id: "wins-blat", name: "Блатной", hint: "Выиграй {n} боёв в режиме «Блатной»", stat: "winsBlat", icon: "ach-blat", targets: [1, 10, 50, 150, 500] },
  { id: "wins-avtor", name: "Авторитетный", hint: "Выиграй {n} боёв в режиме «Авторитетный»", stat: "winsAvtor", icon: "ach-avtor", targets: [1, 10, 50, 150, 500] },
  { id: "all-bosses", name: "Весь Close", hint: "Победи {n} разных боссов (хотя бы раз каждого)", stat: "bossesBeaten", icon: "ach-allboss", targets: [3, 5, 7, 10, 13] },
  { id: "exchanger", name: "Меняла", hint: "Сделай {n} обменов в обменнике", stat: "exchanges", icon: "exchange", targets: [1, 10, 50, 150, 500] },
  { id: "spent-rub", name: "Шопоголик ₽", hint: "Потрать в магазине {n} ₽", stat: "spentRUB", icon: "ach-shop", targets: [10_000, 50_000, 250_000, 1_000_000, 5_000_000] },
  { id: "spent-usd", name: "Шопоголик $", hint: "Потрать в магазине {n} $", stat: "spentUSD", icon: "ach-shop", targets: [100, 500, 2_500, 10_000, 50_000] },
  // savings: what lies in the wallet right now (1 $ = 85 ₽, 1 SOL = 120 $, 1 BTC = 85 000 $ — the BTC ones are for the richest)
  { id: "save-rub", name: "Копилка ₽", hint: "Накопи {n} ₽", stat: "haveRUB", icon: "RUB", targets: [50_000, 100_000, 250_000, 500_000, 1_000_000] },
  { id: "save-usd", name: "Копилка $", hint: "Накопи {n} $", stat: "haveUSD", icon: "USD", targets: [500, 2_000, 5_000, 10_000, 25_000] },
  { id: "save-sol", name: "Копилка SOL", hint: "Накопи {n} SOL", stat: "haveSOL", icon: "SOL", targets: [3, 10, 25, 50, 100] },
  { id: "save-btc", name: "Копилка BTC", hint: "Накопи {n} BTC", stat: "haveBTC", icon: "BTC", targets: [1, 2, 3, 4, 5] },
  { id: "slots-spins", name: "Лудоман", hint: "Прокрути автомат 777 {n} раз", stat: "slotSpins", icon: "ach-slots", targets: [10, 100, 500, 2_000, 5_000] },
  { id: "slots-777", name: "Три семёрки", hint: "Выбей 777 на автомате {n} раз", stat: "slot777", icon: "ach-slots", targets: [1, 3, 10, 25, 50] },
  { id: "slots-level", name: "Уровень автомата", hint: "Подними уровень автомата 777 до {n}", stat: "slotLevel", icon: "ach-slots", targets: [2, 5, 10, 20, 40] },
  { id: "upg-wins", name: "Апгрейдер", hint: "Прокачай вещь в апгрейдере {n} раз", stat: "upgWins", icon: "ach-upgrader", targets: [1, 10, 50, 200, 1_000] },
  { id: "upg-low", name: "Рисковый", hint: "Прокачай вещь с шансом 15% и ниже {n} раз", stat: "upgLowWins", icon: "ach-upgrader", targets: [1, 3, 10, 25, 50] },
  { id: "upg-streak", name: "Везунчик", hint: "Прокачай {n} раза подряд без провала", stat: "upgStreak", icon: "ach-upgrader", targets: [2, 3, 4, 5, 7] },
  { id: "zonk-games", name: "Зонк", hint: "Сыграй {n} партий в зонк", stat: "zonkGames", icon: "ach-zonk", targets: [1, 10, 50, 200, 500] },
  { id: "zonk-best", name: "Зонк: рекорд", hint: "Набери {n} очков за одну партию зонка", stat: "zonkBest", icon: "ach-zonk", targets: [2_000, 4_000, 6_000, 8_000, 10_000] },
  { id: "zonk-duels", name: "Дуэлянт", hint: "Выиграй {n} дуэлей в зонк", stat: "zonkDuels", icon: "ach-zonk", targets: [1, 5, 25, 100, 250] },
  { id: "poker-hands", name: "Покер: все комбинации", hint: "Собери {n} разных комбинаций в покере (от пары до роял-флеша)", stat: "pokerHands", icon: "ach-poker", targets: [3, 5, 7, 8, 9] },
  { id: "poker-level", name: "Уровень покера", hint: "Подними уровень покера до {n}", stat: "pokerLevel", icon: "ach-poker", targets: [5, 10, 20, 50, 100] },
  { id: "bj-blackjacks", name: "Блэкджек!", hint: "Собери блэкджек {n} раз", stat: "bjBlackjacks", icon: "ach-bj", targets: [1, 10, 50, 200, 500] },
  { id: "bj-wins", name: "Игрок за столом", hint: "Выиграй {n} рук в блэкджек", stat: "bjWins", icon: "ach-bj", targets: [1, 25, 100, 500, 2_000] },
  { id: "clan-days", name: "Клановый", hint: "Пробудь в клане {n} дней подряд", stat: "clanDays", icon: "ach-clan", targets: [1, 7, 30, 90, 365] },
  { id: "clan-bosses", name: "Клановый босс", hint: "Победи с кланом {n} клановых боссов (бей сам)", stat: "clanBosses", icon: "ach-clan", targets: [1, 3, 10, 25, 50] },
  { id: "clan-leader", name: "Лидер", hint: "Создай свой клан", stat: "clanCreated", icon: "ach-leader", targets: [1] },
  { id: "spits", name: "Харкун", hint: "Харкни в игроков {n} раз", stat: "spits", icon: "ach-spit", targets: [1, 10, 50, 200, 500] },
  { id: "raids", name: "Наезд", hint: "Наедь на игроков {n} раз", stat: "raids", icon: "ach-raid", targets: [1, 10, 50, 200, 500] },
  { id: "nishtyaks", name: "Ништяк!", hint: "Получи {n} «ништяков» от других игроков", stat: "nishtyaks", icon: "ach-nishtyak", targets: [1, 10, 50, 200, 1_000] },
];

/** the same reward for a tier in every category: the higher, the richer */
export const TIER_REWARDS: Record<AchTier, Reward> = {
  1: { currencies: { RUB: 500 }, xp: 1_000 },
  2: { currencies: { USD: 10 }, xp: 10_000, items: [{ id: "keyboard", qty: 2 }] },
  3: { currencies: { USD: 30 }, xp: 50_000, items: [{ id: "gpu", qty: 2 }] },
  4: { currencies: { USD: 18 }, xp: 150_000, items: [{ id: "rug-pull-gun", qty: 1 }] },
  5: { currencies: { USD: 53 }, xp: 500_000, items: [{ id: "rug-pull-gun", qty: 3 }] },
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
  /** a per-boss badge: shown only while the boss is in the game */
  boss?: string;
}

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/\u00a0/g, " ");

/** the pass tier of a boss → the medal and reward tier of beating him solo (the final boss counts as diamond) */
const CARD_TO_TIER: Record<CardTier, AchTier> = { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5 };

/** One badge per boss: win a solo fight against him once. Stat "solo:<boss id>" = solo wins over that boss. */
export const SOLO_BOSS_ACHIEVEMENTS: AchievementDef[] = BOSSES.map((b) => {
  const tier = b.card ? CARD_TO_TIER[b.card] : 5;
  return {
    id: `soloboss-${b.id}`, category: "solo-boss", name: `Соло: ${b.name}`, hint: `Убей босса ${b.name} в одиночку (бой «Соло»)`,
    stat: `solo:${b.id}` as const, target: 1, tier, icon: "ach-solo", reward: TIER_REWARDS[tier], boss: b.id,
  };
});

/** «Убийца боссов»: three medals per boss — bronze, silver and gold for 10, 50 and 100 wins. Stat "win:<boss id>". */
export const BOSS_KILL_TARGETS = [10, 50, 100] as const;
export const BOSS_KILL_ACHIEVEMENTS: AchievementDef[] = BOSSES.flatMap((b) =>
  BOSS_KILL_TARGETS.map((target, i) => {
    const tier = (i + 1) as AchTier;
    return {
      id: `bosskill-${b.id}-${tier}`, category: "boss-kill", name: `${b.name}: ${TIER_NAMES[tier]}`, hint: `Победи босса ${b.name} ${target} раз`,
      stat: `win:${b.id}` as const, target, tier, icon: "ach-wins", reward: TIER_REWARDS[tier], boss: b.id,
    };
  }),
);

/** «Нычки»: three medals per set — bronze, silver and gold for 10, 50 and 100 sets collected. Stat "stashsets:<n>". */
export const STASH_ACHIEVEMENTS: AchievementDef[] = STASH_SETS_ORDERED.flatMap((s) =>
  STASH_MEDAL_TARGETS.map((target, i) => {
    const tier = (i + 1) as AchTier;
    return { id: `stashset-${s.n}-${tier}`, category: "stash", name: `${s.name}: ${TIER_NAMES[tier]}`, hint: `Собери набор «${s.name}» ${target} раз`, stat: `stashsets:${s.n}` as const, target, tier, icon: "chest", reward: TIER_REWARDS[tier] };
  }),
);

/**
 * «Медали боссов»: a full set (MEDAL_SET) of each boss's bronze, silver and gold medals (content/medals.ts) — from his
 * «Пацанский», «Блатной» and «Авторитетный» fights. Stat "medal:<boss id>:<tier>".
 */
export const MEDAL_ACHIEVEMENTS: AchievementDef[] = BOSSES.flatMap((b) =>
  MEDAL_TIERS.map((t, i) => {
    const tier = (i + 1) as AchTier;
    const mode = FIGHT_MODES.find((m) => m.medal === t)!;
    return {
      id: `medal-${b.id}-${t}`, category: "boss-medal", name: `${b.name}: ${MEDAL_NAMES[t]} — полный сет`, hint: `Собери ${MEDAL_SET} взрывов «${MEDAL_NAMES[t]}» босса ${b.name} — побеждай его в режиме «${mode.name}»`,
      stat: `medal:${b.id}:${t}` as const, target: MEDAL_SET, tier, icon: "ach-wins", reward: TIER_REWARDS[tier], boss: b.id,
    };
  }),
);

export const ACHIEVEMENTS: AchievementDef[] = ([
  ...ACH_CATEGORIES.flatMap((c) =>
    c.targets.map((target, i) => {
      const tier = (i + 1) as AchTier;
      return { id: `${c.id}-${tier}`, category: c.id, name: `${c.name}: ${TIER_NAMES[tier]}`, hint: c.hint.replace("{n}", fmt(target)), stat: c.stat, target, tier, icon: c.icon, reward: TIER_REWARDS[tier] };
    }),
  ),
  ...SOLO_BOSS_ACHIEVEMENTS,
  ...BOSS_KILL_ACHIEVEMENTS,
  ...STASH_ACHIEVEMENTS,
  ...MEDAL_ACHIEVEMENTS,
] as AchievementDef[]).map((a) => ({ ...a, reward: { ...a.reward, achPoints: a.tier } }));

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);

/* ---------------- weekly rating ---------------- */

/** Prizes for the weekly damage top-10, by place (index 0 = 1st place). */
export const WEEKLY_PRIZES: Reward[] = [
  { currencies: { USD: 48 }, xp: 300_000, items: [{ id: "rug-pull-gun", qty: 2 }] },
  { currencies: { USD: 31 }, xp: 200_000, items: [{ id: "rug-pull-gun", qty: 1 }] },
  { currencies: { USD: 22 }, xp: 150_000, items: [{ id: "gpu", qty: 2 }] },
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
