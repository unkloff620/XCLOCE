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
  USD: { id: "USD", name: "Доллары", decimals: 2, rub: 90 },
  SOL: { id: "SOL", name: "Solana", decimals: 4, rub: 15_000 },
  BTC: { id: "BTC", name: "Bitcoin", decimals: 6, rub: 6_000_000 },
};

export const EXCHANGE_FEE = 0.05;

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

/** Rounds an amount down to the currency's precision (never creates money by rounding up). */
export function floorTo(c: Currency, v: number): number {
  const k = 10 ** CURRENCY_DEFS[c].decimals;
  return Math.floor(v * k + 1e-9) / k;
}
