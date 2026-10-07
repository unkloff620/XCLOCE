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
  { id: "jackpot", title: "КУШ! 777", triple: "seven", kind: "jackpot", weight: 1, reward: { currencies: { RUB: 7777, SOL: 0.07 }, items: [{ id: "gpu", qty: 1 }, { id: "keyboard", qty: 3 }] } },
  { id: "bar", title: "Три BAR", triple: "bar", kind: "triple", weight: 1, reward: { currencies: { BTC: 0.0002 } } },
  { id: "bell", title: "Три колокола", triple: "bell", kind: "triple", weight: 2, reward: { currencies: { SOL: 0.02 } } },
  { id: "melon", title: "Три арбуза", triple: "melon", kind: "triple", weight: 3, reward: { items: [{ id: "keyboard", qty: 2 }] } },
  { id: "grape", title: "Три грозди", triple: "grape", kind: "triple", weight: 5, reward: { currencies: { USD: 7 } } },
  { id: "lemon", title: "Три лимона", triple: "lemon", kind: "triple", weight: 6, reward: { items: [{ id: "keyboard", qty: 3 }] } },
  { id: "cherry", title: "Три вишни", triple: "cherry", kind: "triple", weight: 9, reward: { currencies: { RUB: 777 } } },
  { id: "pair", title: "Пара!", triple: null, kind: "pair", weight: 28, reward: { currencies: { RUB: 150 } } },
  { id: "miss", title: "Мимо. Рынок сегодня против тебя", triple: null, kind: "miss", weight: 45, reward: {} },
];

export const SLOT_SPINS_PER_HOUR = 3;
