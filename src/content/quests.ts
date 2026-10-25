import { exchangeOpenOnDayNo } from "./currencies.ts";
import type { Reward } from "./rewards.ts";

/*
 * Ежедневные задания: каждый день у игрока четыре задания — по одному из каждой группы
 * (бой, энергия, экономика, мини-игры двора). Набор на день выбирается детерминированно от игрока и дня,
 * сбрасывается в полночь по Москве. Закрыл все три — открывается сундук.
 */

/** what the server counts: every kind is fed by one kind of action */
export type QuestKind = "damage" | "hits" | "steps" | "energy" | "yard" | "buy" | "exchange" | "slots" | "upgrade" | "poker" | "zonk" | "roach" | "bj";

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

/** three groups → three quests a day */
export const QUEST_GROUPS: QuestDef[][] = [
  [
    { id: "q-damage", kind: "damage", target: 500, title: "Нанеси 500 урона боссам", href: "/bosses", reward: R(250, 500) },
    { id: "q-hits", kind: "hits", target: 10, title: "Ударь босса 10 раз", href: "/bosses", reward: R(250, 500) },
  ],
  [
    { id: "q-steps", kind: "steps", target: 3, title: "Выполни 3 шага заданий в локациях", href: "/locations", reward: R(200, 400, { energy: 10 }) },
    { id: "q-energy", kind: "energy", target: 30, title: "Потрать 30 энергии", href: "/locations", reward: R(200, 400, { energy: 10 }) },
    { id: "q-yard", kind: "yard", target: 5, title: "Подбери 5 вещей во дворе", href: "/yard", reward: R(200, 400) },
  ],
  [
    { id: "q-buy", kind: "buy", target: 1, title: "Купи что-нибудь в магазине", href: "/shop", reward: R(150, 300) },
    { id: "q-exchange", kind: "exchange", target: 1, title: "Обменяй валюту в обменнике", hint: "Нажми на любую валюту вверху экрана", reward: R(150, 300) },
    { id: "q-slots", kind: "slots", target: 1, title: "Крутани однорукого бандита", href: "/yard", reward: R(150, 300) },
  ],
  // the yard's mini-games: the prize is a «Фишка» for the poker table
  [
    { id: "q-poker", kind: "poker", target: 3, title: "Сыграй 3 раздачи в покер", href: "/yard", hint: "Стол во дворе → Покер", reward: R(150, 300, { items: [{ id: "poker-chip", qty: 1 }] }) },
    { id: "q-zonk", kind: "zonk", target: 1, title: "Доиграй партию в зонк", href: "/yard", hint: "Стол во дворе → Зонк", reward: R(150, 300, { items: [{ id: "poker-chip", qty: 1 }] }) },
    { id: "q-roach", kind: "roach", target: 1, title: "Прихлопни таракана в зонке", href: "/yard", hint: "Он бегает по раме доски", reward: R(150, 300, { items: [{ id: "poker-chip", qty: 1 }] }) },
    { id: "q-bj", kind: "bj", target: 3, title: "Сыграй 3 раунда в блэкджек", href: "/yard", hint: "Стол во дворе → Блэкджек", reward: R(150, 300, { items: [{ id: "poker-chip", qty: 1 }] }) },
  ],
];

export const QUESTS: QuestDef[] = QUEST_GROUPS.flat();
export const questById = (id: string) => QUESTS.find((q) => q.id === id);

/** The chest for all three: a fixed part plus one weapon by chance. */
export const QUEST_CHEST_BASE: Reward = { currencies: { RUB: 500, USD: 3 }, energy: 20, xp: 2_000 };
export const QUEST_CHEST_LOOT: { v: { id: string; qty: number }; w: number }[] = [
  { v: { id: "keyboard", qty: 2 }, w: 45 },
  { v: { id: "keyboard", qty: 1 }, w: 35 },
  { v: { id: "gpu", qty: 1 }, w: 17 },
  { v: { id: "rug-pull-gun", qty: 1 }, w: 3 },
];

/** Stable small hash (FNV-1a) — the same player and day always get the same set. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function questsForDay(pid: number, day: string): QuestDef[] {
  // the exchanger works one day out of three — on the other days its quest is not given
  const exOpen = exchangeOpenOnDayNo(Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000));
  return QUEST_GROUPS.map((g0, i) => {
    const g = exOpen ? g0 : g0.filter((q) => q.kind !== "exchange");
    return g[hash(`${pid}:${day}:${i}`) % g.length];
  });
}
