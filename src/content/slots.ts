import type { Reward } from "./rewards.ts";

/*
 * Игровой автомат 777 во дворе. Бесплатно, 3 прокрутки за любые 60 минут.
 * Сервер сначала выбирает исход по весам, потом подбирает барабаны под него.
 * Черновые значения — переопределяются через config "slots".
 */
/** the classic fruit machine: 777, BAR, a bell, a watermelon, grapes, a lemon and cherries */
export const SLOT_SYMBOLS = ["seven", "bar", "bell", "melon", "grape", "lemon", "cherry"] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];
export const SLOT_SYMBOL_NAMES: Record<SlotSymbol, string> = { seven: "7", bar: "BAR", bell: "колокол", melon: "арбуз", grape: "виноград", lemon: "лимон", cherry: "вишня" };

export interface SlotOutcome {
  id: string;
  title: string;
  /** three equal symbols; null for "two of a kind" and for a miss */
  triple: SlotSymbol | null;
  kind: "jackpot" | "triple" | "pair" | "miss";
  weight: number;
  reward: Reward;
}

export const SLOT_OUTCOMES: SlotOutcome[] = [
  // the user's table: roubles only; a pair pays nothing now (only the machine's xp)
  { id: "jackpot", title: "КУШ! 777", triple: "seven", kind: "jackpot", weight: 1, reward: { currencies: { RUB: 777 } } },
  { id: "bar", title: "Три BAR", triple: "bar", kind: "triple", weight: 1, reward: { currencies: { RUB: 333 } } },
  { id: "bell", title: "Три колокола", triple: "bell", kind: "triple", weight: 2, reward: { currencies: { RUB: 100 } } },
  { id: "melon", title: "Три арбуза", triple: "melon", kind: "triple", weight: 3, reward: { currencies: { RUB: 75 } } },
  { id: "grape", title: "Три грозди", triple: "grape", kind: "triple", weight: 5, reward: { currencies: { RUB: 50 } } },
  { id: "lemon", title: "Три лимона", triple: "lemon", kind: "triple", weight: 6, reward: { currencies: { RUB: 30 } } },
  { id: "cherry", title: "Три вишни", triple: "cherry", kind: "triple", weight: 9, reward: { currencies: { RUB: 15 } } },
  { id: "pair", title: "Пара!", triple: null, kind: "pair", weight: 28, reward: {} },
  { id: "miss", title: "Мимо!", triple: null, kind: "miss", weight: 45, reward: {} },
];

export const SLOT_SPINS_PER_HOUR = 3;

/**
 * The machine's own level («уровень автомата»): every spin gives xp by its outcome — a plain miss 3, the 777 jackpot 77.
 * Level 1 → 2 takes 100 xp, every next level 12 more (100, 112, 124, …). Every new level pays slotLevelReward.
 */
export const SLOT_XP: Record<string, number> = { jackpot: 77, bar: 50, bell: 40, melon: 30, grape: 25, lemon: 20, cherry: 15, pair: 7, miss: 3 };
export const slotXpOf = (outcome: string) => SLOT_XP[outcome] ?? 3;
/** xp from level n to n + 1 */
export const slotLevelNeed = (level: number) => 100 + 12 * (level - 1);
/** the level of a total xp and the progress inside it */
export function slotLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1, rest = Math.max(0, Math.floor(xp));
  while (rest >= slotLevelNeed(level)) { rest -= slotLevelNeed(level); level++; }
  return { level, into: rest, need: slotLevelNeed(level) };
}
/** what reaching this level pays: roubles growing with the level, every 10th a GPU */
export function slotLevelReward(level: number): Reward {
  const currencies: NonNullable<Reward["currencies"]> = { RUB: 150 + 50 * level };
  return { currencies, ...(level % 10 === 0 ? { items: [{ id: "gpu", qty: 1 }] } : {}) };
}
