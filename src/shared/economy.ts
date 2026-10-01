/**
 * XCLOCE economy — single source of truth for every game formula.
 * Documented in GAME_DESIGN.md. Shared by server (authoritative) and client (display only).
 * Pure TypeScript, no imports: runnable with `node --experimental-strip-types`.
 */

// ---------- Currencies ----------
export type Currency = "RUB" | "USD" | "SOL" | "BTC";
export const CURRENCIES: Currency[] = ["RUB", "USD", "SOL", "BTC"];

export const START_BALANCES: Record<Currency, number> = { RUB: 10_000, USD: 0, SOL: 0, BTC: 0 };

/** Level required to use a currency in the exchanger. */
export const CURRENCY_UNLOCK_LEVEL: Record<Currency, number> = { RUB: 1, USD: 1, SOL: 1, BTC: 5 };

/** Decimal places used when rounding balances. */
export const CURRENCY_DECIMALS: Record<Currency, number> = { RUB: 2, USD: 2, SOL: 6, BTC: 8 };

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
export function roundCur(value: number, c: Currency): number {
  return roundTo(value, CURRENCY_DECIMALS[c]);
}

// ---------- Exchange rates (deterministic function of time, server authoritative) ----------
const HOUR = 3_600_000;

/** Smooth deterministic wobble in [-1, 1] built from incommensurate sines. */
function wobble(t: number, p1: number, p2: number, p3: number): number {
  return (
    0.55 * Math.sin((2 * Math.PI * t) / p1) +
    0.3 * Math.sin((2 * Math.PI * t) / p2 + 1.3) +
    0.15 * Math.sin((2 * Math.PI * t) / p3 + 2.1)
  );
}

/** USD value of 1 unit of each currency at time t (ms). */
export function usdRates(t: number): Record<Currency, number> {
  const rubPerUsd = 90 * (1 + 0.03 * wobble(t, 5 * HOUR, 1.7 * HOUR, 0.37 * HOUR));
  const sol = 150 * (1 + 0.08 * wobble(t, 9 * HOUR, 2.3 * HOUR, 0.53 * HOUR));
  const btc = 60_000 * (1 + 0.05 * wobble(t, 13 * HOUR, 3.1 * HOUR, 0.71 * HOUR));
  return { RUB: 1 / rubPerUsd, USD: 1, SOL: sol, BTC: btc };
}

/** Spread applied on every exchange (the player always gets the slightly worse side). */
export const EXCHANGE_SPREAD = 0.01;

/** Allowed exchange pairs. */
export const EXCHANGE_PAIRS: [Currency, Currency][] = [
  ["RUB", "USD"], ["USD", "RUB"],
  ["USD", "SOL"], ["SOL", "USD"],
  ["USD", "BTC"], ["BTC", "USD"],
];
export function isPairAllowed(from: Currency, to: Currency): boolean {
  return EXCHANGE_PAIRS.some(([a, b]) => a === from && b === to);
}

/** Amount of `to` received for `amount` of `from`. */
export function exchangeQuote(from: Currency, to: Currency, amount: number, t: number) {
  const r = usdRates(t);
  const usdValue = amount * r[from];
  const fee = usdValue * EXCHANGE_SPREAD;
  const received = roundCur((usdValue - fee) / r[to], to);
  return { received, usdValue, feeUsd: fee, rate: r[from] / r[to] };
}

// ---------- Trading ----------
export const TRADE_FEE = 0.01; // 1% on buy and on sell
export const MIN_TRADE_USD = 1;
/** Tokens are bought and sold for SOL. */
export const TRADE_CURRENCY: Currency = "SOL";

// ---------- Player level ----------
export function xpForNextLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5));
}
export const XP = {
  work: 1,
  buy: 2,
  sellBase: 4,
  /** extra XP on sell = floor(sqrt(saleUsd)) capped */
  sellBonus: (saleUsd: number) => Math.min(60, Math.floor(Math.sqrt(Math.max(0, saleUsd)))),
  exchange: 1,
};

// ---------- Energy ----------
export const ENERGY_REGEN_MS = 30_000; // +1 energy every 30 s
export const WORK_ENERGY_COST = 1;

// ---------- Offline / passive ----------
export const OFFLINE_CAP_MS = 4 * HOUR;

// ---------- Bosses ----------
/** Market cap ($) of the n-th boss (1-based). Polynomial x mild exponential, not x10 per boss. */
export function bossMarketCap(n: number): number {
  const raw = 1000 * Math.pow(n, 1.5) * Math.pow(1.25, n - 1);
  return niceRound(raw);
}
function niceRound(v: number): number {
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.round(v / mag) * mag;
}
/** Share of market cap paid back as USD reward. Declines with depth. */
export function bossRewardRate(n: number): number {
  return Math.max(0.015, 0.03 - 0.0005 * (n - 1));
}
/**
 * Contribution factor: a boss killed entirely by other players' global damage still pays 25% of the reward;
 * full reward once the player personally dealt >= 10% of that boss's market cap.
 * Protects the economy from inflation when many players feed global damage.
 */
export const REWARD_MIN_FACTOR = 0.25;
export const REWARD_FULL_CONTRIBUTION = 0.1;
export function contributionFactor(personalDamageOnBoss: number, mcap: number): number {
  const share = Math.min(1, personalDamageOnBoss / (mcap * REWARD_FULL_CONTRIBUTION));
  return REWARD_MIN_FACTOR + (1 - REWARD_MIN_FACTOR) * share;
}
export function bossRewardUsd(n: number, personalDamageOnBoss: number): number {
  const mcap = bossMarketCap(n);
  return roundTo(mcap * bossRewardRate(n) * contributionFactor(personalDamageOnBoss, mcap), 2);
}
export function bossRewardXp(n: number): number {
  return Math.round(50 * Math.pow(n, 1.3));
}
/** Safety cap: max bosses one damage application may defeat; the rest waits for the next sync (nothing is lost). */
export const MAX_BOSS_CHAIN_STEPS = 200;

// ---------- Combo ----------
export const COMBO_WINDOW_MS = 10 * 60_000;
export const COMBO_MIN_SALE_USD = 5;
export const COMBO_MIN_INTERVAL_MS = 3_000;
export function comboMultiplier(combo: number): number {
  if (combo >= 10) return 1.25;
  if (combo >= 5) return 1.1;
  if (combo >= 2) return 1.05;
  return 1;
}

// ---------- Dump tools ----------
export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";
export interface DumpToolDef {
  id: string;
  name: string;
  rarity: Rarity;
  mult: number;
  critChance: number;
  critMult: number;
  energyCost: number;
  priceUsd: number | null; // null = drop only
  unlockLevel: number;
  description: string;
  effect: string;
}
export const DUMP_TOOLS: DumpToolDef[] = [
  { id: "paper-hands", name: "Paper Hands", rarity: "common", mult: 1.0, critChance: 0.02, critMult: 1.5, energyCost: 1, priceUsd: 0, unlockLevel: 1, description: "Продаёт при первом же красном свече.", effect: "paper" },
  { id: "sell-button", name: "Sell Button", rarity: "common", mult: 1.15, critChance: 0.04, critMult: 1.75, energyCost: 1, priceUsd: 250, unlockLevel: 2, description: "Большая красная кнопка. Жми.", effect: "button" },
  { id: "dump-bot", name: "Dump Bot", rarity: "rare", mult: 1.3, critChance: 0.06, critMult: 2, energyCost: 1, priceUsd: 1_500, unlockLevel: 4, description: "Скрипт, который сливает быстрее тебя.", effect: "bot" },
  { id: "whale-wallet", name: "Whale Wallet", rarity: "rare", mult: 1.45, critChance: 0.08, critMult: 2, energyCost: 2, priceUsd: 6_000, unlockLevel: 6, description: "Когда кит продаёт — график плачет.", effect: "whale" },
  { id: "mm-terminal", name: "Market Maker Terminal", rarity: "epic", mult: 1.6, critChance: 0.1, critMult: 2.25, energyCost: 2, priceUsd: 25_000, unlockLevel: 9, description: "Ты и есть ликвидность.", effect: "terminal" },
  { id: "liquidity-nuker", name: "Liquidity Nuker", rarity: "epic", mult: 1.8, critChance: 0.12, critMult: 2.5, energyCost: 2, priceUsd: 90_000, unlockLevel: 12, description: "Стирает пул в ноль одним кликом.", effect: "nuke" },
  { id: "rug-cannon", name: "Rug Cannon", rarity: "legendary", mult: 2.0, critChance: 0.14, critMult: 2.75, energyCost: 3, priceUsd: 350_000, unlockLevel: 15, description: "Стреляет коврами. Да, теми самыми.", effect: "cannon" },
  { id: "mega-dump", name: "Mega Dump Machine", rarity: "legendary", mult: 2.25, critChance: 0.16, critMult: 3, energyCost: 3, priceUsd: 1_200_000, unlockLevel: 19, description: "Индустриальный слив рынка.", effect: "machine" },
  { id: "black-swan", name: "Black Swan Generator", rarity: "mythic", mult: 2.5, critChance: 0.18, critMult: 3, energyCost: 3, priceUsd: null, unlockLevel: 1, description: "Выпадает только с босса #20. Событие, которого никто не ждал.", effect: "swan" },
];
export function toolById(id: string): DumpToolDef | undefined {
  return DUMP_TOOLS.find((t) => t.id === id);
}
/** Boss index -> tool dropped on first defeat. */
export const BOSS_TOOL_DROPS: Record<number, string> = { 3: "sell-button", 7: "dump-bot", 20: "black-swan" };

// ---------- Equipment (workplace tiers) ----------
export interface EquipmentDef {
  tier: number;
  id: string;
  name: string;
  price: number;
  priceCurrency: Currency;
  unlockLevel: number;
  workRub: number; // RUB per work action
  passiveRubPerHour: number;
  maxEnergy: number;
  damageBonus: number; // additive, e.g. 0.1 = +10%
}
export const EQUIPMENT: EquipmentDef[] = [
  { tier: 1, id: "old-laptop", name: "Старый ноутбук", price: 0, priceCurrency: "RUB", unlockLevel: 1, workRub: 50, passiveRubPerHour: 300, maxEnergy: 50, damageBonus: 0 },
  { tier: 2, id: "office-pc", name: "Офисный ПК", price: 30_000, priceCurrency: "RUB", unlockLevel: 2, workRub: 80, passiveRubPerHour: 900, maxEnergy: 60, damageBonus: 0.03 },
  { tier: 3, id: "gaming-pc", name: "Игровой ПК", price: 1_000, priceCurrency: "USD", unlockLevel: 3, workRub: 130, passiveRubPerHour: 2_500, maxEnergy: 70, damageBonus: 0.06 },
  { tier: 4, id: "trader-setup", name: "Трейдерский сетап", price: 4_000, priceCurrency: "USD", unlockLevel: 5, workRub: 200, passiveRubPerHour: 6_000, maxEnergy: 80, damageBonus: 0.1 },
  { tier: 5, id: "crypto-station", name: "Крипто-станция", price: 15_000, priceCurrency: "USD", unlockLevel: 8, workRub: 320, passiveRubPerHour: 15_000, maxEnergy: 90, damageBonus: 0.15 },
  { tier: 6, id: "server-rack", name: "Серверная стойка", price: 60_000, priceCurrency: "USD", unlockLevel: 11, workRub: 500, passiveRubPerHour: 40_000, maxEnergy: 100, damageBonus: 0.2 },
  { tier: 7, id: "whale-center", name: "Whale Command Center", price: 250_000, priceCurrency: "USD", unlockLevel: 15, workRub: 800, passiveRubPerHour: 100_000, maxEnergy: 120, damageBonus: 0.3 },
];
export function equipmentByTier(tier: number): EquipmentDef {
  return EQUIPMENT[Math.max(0, Math.min(EQUIPMENT.length - 1, tier - 1))];
}

// ---------- Damage formula ----------
export interface DamageInput {
  saleUsd: number;
  tool: DumpToolDef;
  combo: number;
  equipmentTier: number;
  critRoll: number; // uniform [0,1) produced by the server RNG
}
export function computeDamage(i: DamageInput) {
  const base = i.saleUsd; // BASE DAMAGE = SALE VALUE (GAME_DESIGN.md §Damage)
  const toolMult = i.tool.mult;
  const crit = i.critRoll < i.tool.critChance;
  const critMult = crit ? i.tool.critMult : 1;
  const comboMult = comboMultiplier(i.combo);
  const equipMult = 1 + equipmentByTier(i.equipmentTier).damageBonus;
  const amount = roundTo(base * toolMult * critMult * comboMult * equipMult, 2);
  return { amount, base, toolMult, crit, critMult, comboMult, equipMult };
}
