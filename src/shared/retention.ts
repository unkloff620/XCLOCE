/**
 * Retention content: daily login reward streak, daily/weekly quests, cosmetics (character wardrobe).
 * Server-authoritative; the client only displays these definitions.
 */
import type { Currency } from "./economy.ts";

// ---------------- Daily reward ----------------
export const DAILY_COOLDOWN_MS = 20 * 3_600_000; // can claim again after 20 h
export const DAILY_STREAK_RESET_MS = 48 * 3_600_000; // streak breaks if not claimed for 48 h
export interface Reward { currency?: Currency; amount?: number; energy?: number; xp?: number }
export const DAILY_REWARDS: Reward[] = [
  { currency: "RUB", amount: 2_000, xp: 10 },
  { currency: "RUB", amount: 4_000, xp: 15 },
  { currency: "USD", amount: 25, xp: 20 },
  { currency: "RUB", amount: 8_000, energy: 20, xp: 25 },
  { currency: "USD", amount: 60, xp: 30 },
  { currency: "SOL", amount: 0.25, xp: 40 },
  { currency: "USD", amount: 150, energy: 50, xp: 60 },
];
export function dailyRewardForStreakDay(day: number): Reward {
  return DAILY_REWARDS[(Math.max(1, day) - 1) % DAILY_REWARDS.length];
}

// ---------------- Quests ----------------
export type Metric = "buys" | "sells" | "sell_usd" | "damage" | "work" | "bosses" | "exchanges";
export interface QuestDef {
  id: string;
  period: "daily" | "weekly";
  title: string;
  metric: Metric;
  target: number;
  reward: Reward;
}
export const QUESTS: QuestDef[] = [
  { id: "d_work", period: "daily", title: "Отработай 20 смен", metric: "work", target: 20, reward: { currency: "RUB", amount: 2_500, xp: 20 } },
  { id: "d_buy3", period: "daily", title: "Купи 3 мемкоина", metric: "buys", target: 3, reward: { currency: "RUB", amount: 3_000, xp: 20 } },
  { id: "d_trades5", period: "daily", title: "Продай 5 раз", metric: "sells", target: 5, reward: { currency: "SOL", amount: 0.1, xp: 25 } },
  { id: "d_sell500", period: "daily", title: "Продай токенов на $500", metric: "sell_usd", target: 500, reward: { currency: "USD", amount: 20, xp: 30 } },
  { id: "d_dmg1k", period: "daily", title: "Нанеси $1,000 урона", metric: "damage", target: 1_000, reward: { currency: "USD", amount: 30, energy: 15, xp: 30 } },
  { id: "d_boss1", period: "daily", title: "Победи 1 босса", metric: "bosses", target: 1, reward: { currency: "USD", amount: 40, xp: 40 } },
  { id: "w_dmg25k", period: "weekly", title: "Нанеси $25,000 урона за неделю", metric: "damage", target: 25_000, reward: { currency: "USD", amount: 500, xp: 200 } },
  { id: "w_boss5", period: "weekly", title: "Победи 5 боссов за неделю", metric: "bosses", target: 5, reward: { currency: "USD", amount: 400, xp: 200 } },
  { id: "w_trades50", period: "weekly", title: "Соверши 50 продаж за неделю", metric: "sells", target: 50, reward: { currency: "SOL", amount: 1.5, xp: 150 } },
  { id: "w_work200", period: "weekly", title: "Отработай 200 смен за неделю", metric: "work", target: 200, reward: { currency: "RUB", amount: 40_000, xp: 120 } },
];
export function questById(id: string) {
  return QUESTS.find((q) => q.id === id);
}

/** Period keys in UTC: daily "d:2026-10-01", weekly "w:2026-10-05" (Monday of the ISO week). */
export function periodKey(period: "daily" | "weekly", t: number): string {
  const d = new Date(t);
  const day = d.toISOString().slice(0, 10);
  if (period === "daily") return "d:" + day;
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  return "w:" + monday.toISOString().slice(0, 10);
}
export function periodEnds(period: "daily" | "weekly", t: number): number {
  const d = new Date(t);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  if (period === "daily") return next;
  const dow = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (7 - dow));
}

// ---------------- Cosmetics ----------------
export type Slot = "hoodie" | "hat" | "glasses" | "headphones";
export interface CosmeticDef {
  id: string;
  slot: Slot;
  name: string;
  price: number;
  currency: Currency;
  unlockLevel: number;
  /** main colour (hoodie) or variant key used by the character renderer */
  color?: string;
  variant?: string;
}
export const COSMETICS: CosmeticDef[] = [
  { id: "hoodie-black", slot: "hoodie", name: "Чёрное худи", price: 0, currency: "RUB", unlockLevel: 1, color: "#2c3142" },
  { id: "hoodie-grey", slot: "hoodie", name: "Серое худи", price: 6_000, currency: "RUB", unlockLevel: 1, color: "#6b7080" },
  { id: "hoodie-green", slot: "hoodie", name: "Худи «Green Candle»", price: 15_000, currency: "RUB", unlockLevel: 2, color: "#159a5c" },
  { id: "hoodie-red", slot: "hoodie", name: "Худи «Liquidation»", price: 15_000, currency: "RUB", unlockLevel: 2, color: "#b3283c" },
  { id: "hoodie-violet", slot: "hoodie", name: "Худи «Night Trader»", price: 120, currency: "USD", unlockLevel: 4, color: "#5b2fa8" },
  { id: "hoodie-gold", slot: "hoodie", name: "Золотое худи кита", price: 2_500, currency: "USD", unlockLevel: 10, color: "#c99a1a" },
  { id: "hat-none", slot: "hat", name: "Без головного убора", price: 0, currency: "RUB", unlockLevel: 1, variant: "none" },
  { id: "hat-cap", slot: "hat", name: "Кепка дегена", price: 8_000, currency: "RUB", unlockLevel: 1, variant: "cap" },
  { id: "hat-beanie", slot: "hat", name: "Шапка «HODL»", price: 60, currency: "USD", unlockLevel: 3, variant: "beanie" },
  { id: "hat-crown", slot: "hat", name: "Корона мем-короля", price: 5_000, currency: "USD", unlockLevel: 12, variant: "crown" },
  { id: "glasses-none", slot: "glasses", name: "Без очков", price: 0, currency: "RUB", unlockLevel: 1, variant: "none" },
  { id: "glasses-shades", slot: "glasses", name: "Чёрные очки", price: 10_000, currency: "RUB", unlockLevel: 2, variant: "shades" },
  { id: "glasses-laser", slot: "glasses", name: "Лазерный визор", price: 300, currency: "USD", unlockLevel: 6, variant: "laser" },
  { id: "headphones-none", slot: "headphones", name: "Без наушников", price: 0, currency: "RUB", unlockLevel: 1, variant: "none" },
  { id: "headphones-gamer", slot: "headphones", name: "Игровые наушники", price: 12_000, currency: "RUB", unlockLevel: 2, variant: "gamer" },
  { id: "headphones-rgb", slot: "headphones", name: "RGB-наушники", price: 200, currency: "USD", unlockLevel: 5, variant: "rgb" },
];
export type Outfit = Record<Slot, string>;
export const DEFAULT_OUTFIT: Outfit = { hoodie: "hoodie-black", hat: "hat-none", glasses: "glasses-none", headphones: "headphones-none" };
export function cosmeticById(id: string) {
  return COSMETICS.find((c) => c.id === id);
}
export function isFreeCosmetic(c: CosmeticDef) {
  return c.price === 0;
}
