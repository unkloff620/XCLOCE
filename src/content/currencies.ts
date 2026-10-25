/** In-game currencies. They have no real-world value and are not tied to any wallet. */
export const CURRENCIES = ["RUB", "USD", "SOL", "BTC"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface CurrencyDef {
  id: Currency;
  name: string;
  /** decimals kept on the server and shown in the UI */
  decimals: number;
  /** value of 1 unit in RUB, used by the exchanger (draft, overridable via config "exchange") */
  rub: number;
}

export const CURRENCY_DEFS: Record<Currency, CurrencyDef> = {
  RUB: { id: "RUB", name: "Рубли", decimals: 0, rub: 1 },
  // whole numbers only; close to the real rates: 1 USD = 85 ₽, 1 SOL = 120 $, 1 BTC = 85 000 $.
  // SOL and BTC are for big rewards and purchases (v2-056 moved the old SOL/BTC rewards, prices and balances to USD)
  USD: { id: "USD", name: "Доллары", decimals: 0, rub: 85 },
  SOL: { id: "SOL", name: "Solana", decimals: 0, rub: 10_200 },
  BTC: { id: "BTC", name: "Bitcoin", decimals: 0, rub: 7_225_000 },
};

/** The exchanger is an event: it works one Moscow day out of every EXCHANGE_EVERY_DAYS. */
export const EXCHANGE_EVERY_DAYS = 3;
const DAY_MS = 86_400_000;
const MSK_MS = 3 * 3_600_000;
const mskDayNo = (now: number) => Math.floor((now + MSK_MS) / DAY_MS);
export const exchangeOpenOnDayNo = (n: number) => ((n % EXCHANGE_EVERY_DAYS) + EXCHANGE_EVERY_DAYS) % EXCHANGE_EVERY_DAYS === 0;

export interface ExchangeWindow {
  open: boolean;
  /** Moscow day "YYYY-MM-DD" of today */
  day: string;
  /** open → when it closes; closed → when it opens next (ms) */
  until: number;
}
export function exchangeWindow(now: number): ExchangeWindow {
  const n = mskDayNo(now);
  const day = new Date(n * DAY_MS).toISOString().slice(0, 10);
  const open = exchangeOpenOnDayNo(n);
  let next = n + 1;
  if (!open) while (!exchangeOpenOnDayNo(next)) next++;
  return { open, day, until: next * DAY_MS - MSK_MS };
}

export const EXCHANGE_FEE = 0.05;

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

/** Rounds an amount down to the currency's precision (never creates money by rounding up). */
export function floorTo(c: Currency, v: number): number {
  const k = 10 ** CURRENCY_DEFS[c].decimals;
  return Math.floor(v * k + 1e-9) / k;
}
