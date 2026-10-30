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

/**
 * The exchanger is an event. By default it works one Moscow day out of every 3, all day; the admin panel
 * («События» → «Ивенты: Обменник», config key `exchange.schedule`) can change the cycle, the day in it and the hours,
 * or keep it always open / closed.
 */
export interface ExchangeSchedule {
  mode: "cycle" | "always" | "closed";
  /** a cycle of `every` Moscow days; it works on the day `offset` of the cycle */
  every: number;
  offset: number;
  /** Moscow hours: open from `from`:00 to `to`:00 (0–24 = all day) */
  from: number;
  to: number;
}
export const EXCHANGE_SCHEDULE: ExchangeSchedule = { mode: "cycle", every: 3, offset: 0, from: 0, to: 24 };
/** the default cycle (texts that do not know the admin's schedule) */
export const EXCHANGE_EVERY_DAYS = EXCHANGE_SCHEDULE.every;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MSK_MS = 3 * HOUR_MS;
const mskDayNo = (now: number) => Math.floor((now + MSK_MS) / DAY_MS);
/** a schedule from anything (the admin's JSON): numbers in range, the hours in order */
export function cleanSchedule(v: unknown): ExchangeSchedule {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d);
  const mode = o.mode === "always" || o.mode === "closed" ? o.mode : "cycle";
  const every = n(o.every, 1, 30, EXCHANGE_SCHEDULE.every);
  const from = n(o.from, 0, 23, 0);
  const to = Math.max(from + 1, n(o.to, 1, 24, 24));
  return { mode, every, offset: n(o.offset, 0, every - 1, 0), from, to };
}
export const exchangeOpenOnDayNo = (n: number, s: ExchangeSchedule = EXCHANGE_SCHEDULE) =>
  s.mode === "always" ? true : s.mode === "closed" ? false : (((n - s.offset) % s.every) + s.every) % s.every === 0;
/** how the schedule reads for the players: «один день из 3 · с 12:00 до 20:00 по Москве» */
export function exchangeScheduleText(s: ExchangeSchedule = EXCHANGE_SCHEDULE): string {
  if (s.mode === "always") return "работает каждый день";
  if (s.mode === "closed") return "сейчас не работает";
  const days = s.every === 1 ? "каждый день" : `один день из ${s.every}`;
  return s.from === 0 && s.to === 24 ? days : `${days} · с ${s.from}:00 до ${s.to}:00 по Москве`;
}

export interface ExchangeWindow {
  open: boolean;
  /** Moscow day "YYYY-MM-DD" of today */
  day: string;
  /** open → when it closes; closed → when it opens next (ms) */
  until: number;
}
export function exchangeWindow(now: number, s: ExchangeSchedule = EXCHANGE_SCHEDULE): ExchangeWindow {
  const n = mskDayNo(now);
  const day = new Date(n * DAY_MS).toISOString().slice(0, 10);
  const at = (dayNo: number, h: number) => dayNo * DAY_MS + h * HOUR_MS - MSK_MS;
  if (s.mode === "always") return { open: true, day, until: now + 365 * DAY_MS };
  if (s.mode === "closed") return { open: false, day, until: now + 365 * DAY_MS };
  const hour = Math.floor(((now + MSK_MS) % DAY_MS) / HOUR_MS);
  if (exchangeOpenOnDayNo(n, s) && hour >= s.from && hour < s.to) return { open: true, day, until: at(n, s.to) };
  let next = exchangeOpenOnDayNo(n, s) && hour < s.from ? n : n + 1;
  while (!exchangeOpenOnDayNo(next, s)) next++;
  return { open: false, day, until: at(next, s.from) };
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
