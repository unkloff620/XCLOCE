import type { Reward } from "./rewards.ts";

/*
 * Игровой автомат 777 во дворе. Бесплатно, 3 прокрутки за любые 60 минут.
 * Сервер сначала выбирает исход по весам, потом подбирает барабаны под него.
 * Черновые значения — переопределяются через config "slots".
 */
export const SLOT_SYMBOLS = ["seven", "btc", "sol", "usd", "keyboard", "candle", "rub"] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

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
  { id: "btc", title: "Три биткоина", triple: "btc", kind: "triple", weight: 1, reward: { currencies: { BTC: 0.0002 } } },
  { id: "sol", title: "Три соланы", triple: "sol", kind: "triple", weight: 2, reward: { currencies: { SOL: 0.02 } } },
  { id: "keyboard", title: "Три клавы", triple: "keyboard", kind: "triple", weight: 3, reward: { items: [{ id: "keyboard", qty: 2 }] } },
  { id: "usd", title: "Три доллара", triple: "usd", kind: "triple", weight: 5, reward: { currencies: { USD: 7 } } },
  { id: "candle", title: "Три свечи", triple: "candle", kind: "triple", weight: 6, reward: { items: [{ id: "keyboard", qty: 3 }] } },
  { id: "rub", title: "Три рубля", triple: "rub", kind: "triple", weight: 9, reward: { currencies: { RUB: 777 } } },
  { id: "pair", title: "Пара!", triple: null, kind: "pair", weight: 28, reward: { currencies: { RUB: 150 } } },
  { id: "miss", title: "Мимо. Рынок сегодня против тебя", triple: null, kind: "miss", weight: 45, reward: {} },
];

export const SLOT_SPINS_PER_HOUR = 3;
