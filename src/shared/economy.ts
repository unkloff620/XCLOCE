/**
 * XCLOCE v2 — game configuration and formulas (single source of truth).
 * Pure TypeScript, no imports: runnable with `node --experimental-strip-types`.
 * Documented in GAME_DESIGN.md.
 */

// ---------------- Currencies ----------------
export type Currency = "RUB" | "USD" | "SOL" | "BTC";
export const CURRENCIES: Currency[] = ["RUB", "USD", "SOL", "BTC"];
export const START_BALANCES: Record<Currency, number> = { RUB: 5_000, USD: 20, SOL: 0, BTC: 0 };
export const CURRENCY_DECIMALS: Record<Currency, number> = { RUB: 0, USD: 2, SOL: 4, BTC: 6 };

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
export function roundCur(value: number, c: Currency): number {
  return roundTo(value, CURRENCY_DECIMALS[c]);
}
export interface Price { currency: Currency; amount: number }

// ---------------- Exchange (deterministic rates, 2% spread) ----------------
const HOUR = 3_600_000;
function wobble(t: number, p1: number, p2: number): number {
  return 0.65 * Math.sin((2 * Math.PI * t) / p1) + 0.35 * Math.sin((2 * Math.PI * t) / p2 + 1.3);
}
/** USD value of one unit of each currency at time t. */
export function usdRates(t: number): Record<Currency, number> {
  return {
    RUB: 1 / (90 * (1 + 0.02 * wobble(t, 7 * HOUR, 1.9 * HOUR))),
    USD: 1,
    SOL: 150 * (1 + 0.05 * wobble(t, 11 * HOUR, 2.7 * HOUR)),
    BTC: 60_000 * (1 + 0.04 * wobble(t, 13 * HOUR, 3.1 * HOUR)),
  };
}
export const EXCHANGE_SPREAD = 0.02;
export function exchangeQuote(from: Currency, to: Currency, amount: number, t: number) {
  const r = usdRates(t);
  const usd = amount * r[from];
  const received = roundCur((usd * (1 - EXCHANGE_SPREAD)) / r[to], to);
  return { received, rate: r[from] / r[to], usd };
}

// ---------------- Level / XP ----------------
export function xpForNextLevel(level: number): number {
  return Math.round(80 * Math.pow(level, 1.45));
}

// ---------------- Energy ----------------
export const ENERGY_BASE_MAX = 100;
export const ENERGY_REGEN_MS = 60_000; // +1 per minute

// ---------------- Workplace (Home upgrades) ----------------
export interface WorkplaceTier {
  tier: number;
  name: string;
  price: Price | null;
  unlockLevel: number;
  power: number; // flat power bonus
  maxEnergyBonus: number;
}
export const WORKPLACE: WorkplaceTier[] = [
  { tier: 1, name: "Старый ноутбук", price: null, unlockLevel: 1, power: 0, maxEnergyBonus: 0 },
  { tier: 2, name: "Офисный ПК", price: { currency: "RUB", amount: 15_000 }, unlockLevel: 2, power: 40, maxEnergyBonus: 10 },
  { tier: 3, name: "Игровой сетап", price: { currency: "USD", amount: 150 }, unlockLevel: 4, power: 100, maxEnergyBonus: 20 },
  { tier: 4, name: "Трейдерская станция", price: { currency: "USD", amount: 600 }, unlockLevel: 7, power: 220, maxEnergyBonus: 30 },
  { tier: 5, name: "Крипто-ферма", price: { currency: "SOL", amount: 8 }, unlockLevel: 11, power: 450, maxEnergyBonus: 40 },
  { tier: 6, name: "Whale Command Center", price: { currency: "BTC", amount: 0.05 }, unlockLevel: 16, power: 900, maxEnergyBonus: 60 },
];
export function workplace(tier: number): WorkplaceTier {
  return WORKPLACE[Math.max(0, Math.min(WORKPLACE.length - 1, tier - 1))];
}

// ---------------- Power ----------------
export const BASE_POWER = 100;
export const POWER_PER_LEVEL = 20;
export function computePower(level: number, itemPower: number, workplaceTier: number, permanent: number): number {
  return Math.round(BASE_POWER + POWER_PER_LEVEL * (level - 1) + itemPower + workplace(workplaceTier).power + permanent);
}

// ---------------- Battle ----------------
export const ATTACKS_PER_DAY = 7; // fights started per boss per day, resets at 00:00 UTC
export const KEYS_TO_UNLOCK = 3;
export const RENAME_COOLDOWN_MS = 24 * 3_600_000;
/** A boss fight lasts 8 hours; if the boss is still alive then, the fight is lost. */
export const FIGHT_DURATION_MS = 8 * 3_600_000;

// ---------------- Yard ----------------
export const YARD_SLOT_MS = 5_000; // a new item appears every 5 seconds
export const YARD_TTL_SLOTS = 6; // and lies for 30 seconds
export const YARD_DAILY_LIMIT = 100; // pickups per UTC day

export function dayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}
export function nextDayStart(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}
