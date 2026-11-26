import { exchangeOpenOnDayNo, EXCHANGE_SCHEDULE, type ExchangeSchedule } from "./currencies.ts";
import type { Reward } from "./rewards.ts";

/*
 * «Задания дня» (the user 2026-11-26): every day seven quests — one of each group (the bosses, the locations, the yard's
 * finds and the bandit, the yard's machines, the table games, «Зарубы» and the garage, the shop's weapons). The day's set
 * is picked from the player and the day (the same all day), it resets at 00:00 MSK. Each one pays 5–25 roubles and some
 * authority when claimed; all seven claimed — the chest of the day (QUEST_CHEST, every amount rolled in its range).
 */

/** what the server counts: every kind is fed by one kind of action (game.ts afterAction, combat.ts, zarub.ts) */
export type QuestKind = "damage" | "hits" | "kill" | "steps" | "energy" | "yard" | "bandit" | "slots" | "fortune" | "poker" | "zonk" | "bj" | "zarub" | "weapon" | "craft"
  // still counted for «Зарубы» and «Календарь» (no daily quest of theirs now)
  | "buy" | "exchange" | "roach" | "social" | "upgrader";

export interface QuestDef {
  id: string;
  kind: QuestKind;
  target: number;
  title: string;
  /** where to go to do it (none: the hint says how) */
  href?: string;
  hint?: string;
  reward: Reward;
}

const R = (rub: number, xp: number, extra: Reward = {}): Reward => ({ currencies: { RUB: rub }, xp, ...extra });

/** seven groups → seven quests a day */
export const QUEST_GROUPS: QuestDef[][] = [
  // the bosses («Забив»)
  [
    { id: "q-damage", kind: "damage", target: 2_000, title: "Нанеси 2 000 урона боссам", href: "/bosses", reward: R(20, 300) },
    { id: "q-hits", kind: "hits", target: 15, title: "Ударь босса 15 раз", href: "/bosses", reward: R(15, 300) },
    { id: "q-kill", kind: "kill", target: 1, title: "Победи любого босса", href: "/bosses", reward: R(25, 400) },
  ],
  // the locations and the energy
  [
    { id: "q-steps", kind: "steps", target: 5, title: "Выполни 5 шагов в локациях", href: "/locations", reward: R(10, 200, { energy: 10 }) },
    { id: "q-energy", kind: "energy", target: 50, title: "Потрать 50 энергии", href: "/locations", reward: R(15, 200, { energy: 10 }) },
  ],
  // the yard: the finds and «Бандитский фарт»
  [
    { id: "q-yard", kind: "yard", target: 5, title: "Подбери 5 находок во дворе", href: "/yard", reward: R(10, 200) },
    { id: "q-bandit", kind: "bandit", target: 20, title: "Крутани «Бандитский фарт» 20 раз", href: "/yard/bandit", reward: R(15, 200) },
  ],
  // the yard's machines
  [
    { id: "q-slots", kind: "slots", target: 1, title: "Крутани автомат 777", href: "/yard", reward: R(5, 150) },
    { id: "q-fortune", kind: "fortune", target: 1, title: "Крутани «Колесо удачи»", href: "/yard/fortune", reward: R(5, 150) },
  ],
  // the table games: the prize is a «Фишка» for the poker table
  [
    { id: "q-poker", kind: "poker", target: 3, title: "Сыграй 3 раздачи в покер", href: "/yard", hint: "Стол во дворе → Покер", reward: R(10, 150, { items: [{ id: "poker-chip", qty: 1 }] }) },
    { id: "q-zonk", kind: "zonk", target: 2, title: "Доиграй 2 партии в зонк", href: "/yard", hint: "Стол во дворе → Зонк", reward: R(10, 150, { items: [{ id: "poker-chip", qty: 1 }] }) },
    { id: "q-bj", kind: "bj", target: 3, title: "Сыграй 3 раунда в блэкджек", href: "/yard", hint: "Стол во дворе → Блэкджек", reward: R(10, 150, { items: [{ id: "poker-chip", qty: 1 }] }) },
  ],
  // «Зарубы» and the garage
  [
    { id: "q-zarub", kind: "zarub", target: 3, title: "Выполни 3 задания в зарубах", href: "/zarub", reward: R(20, 300) },
    { id: "q-craft", kind: "craft", target: 1, title: "Собери в гараже инструмент 1 уровня", href: "/craft", reward: R(20, 300) },
  ],
  // the weapons used on the bosses (the shop's: a knife, a gun, a cannon — not the free fist)
  [
    { id: "q-weapon", kind: "weapon", target: 10, title: "Используй 10 оружия в бою", href: "/bosses", hint: "Нож, ствол или пушка — не кулак", reward: R(10, 200) },
  ],
];

export const QUESTS: QuestDef[] = QUEST_GROUPS.flat();
export const questById = (id: string) => QUESTS.find((q) => q.id === id);

/** The chest for all seven: each amount rolled in its range (the user 2026-11-26) — every weapon of the shop, authority,
 *  roubles, a poker chip, a gold bar, cigarettes, teeth */
export const QUEST_CHEST = {
  weapons: [["keyboard", 5, 10], ["gpu", 5, 10], ["rug-pull-gun", 5, 10]] as [string, number, number][],
  xp: [300, 1_500] as [number, number],
  currencies: { RUB: [25, 50], GOLD: [1, 1], PAP: [705, 1_402], TOOTH: [502, 1_104] } as Record<string, [number, number]>,
  items: [["poker-chip", 1]] as [string, number][],
};
/** the chest's reward rolled with rng */
export function rollQuestChest(rng: () => number): Reward {
  const n = ([lo, hi]: [number, number]) => lo + Math.floor(rng() * (hi - lo + 1));
  return {
    xp: n(QUEST_CHEST.xp),
    currencies: Object.fromEntries(Object.entries(QUEST_CHEST.currencies).map(([c, r]) => [c, n(r)])),
    items: [...QUEST_CHEST.weapons.map(([id, lo, hi]) => ({ id, qty: n([lo, hi]) })), ...QUEST_CHEST.items.map(([id, qty]) => ({ id, qty }))],
  };
}

/** Stable small hash (FNV-1a) — the same player and day always get the same set. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function questsForDay(pid: number, day: string, schedule: ExchangeSchedule = EXCHANGE_SCHEDULE): QuestDef[] {
  // the exchanger works only some days (the admin's schedule) — on the other days its quest is not given
  const exOpen = exchangeOpenOnDayNo(Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000), schedule);
  return QUEST_GROUPS.map((g0, i) => {
    const g = exOpen ? g0 : g0.filter((q) => q.kind !== "exchange");
    return g[hash(`${pid}:${day}:${i}`) % g.length];
  });
}
