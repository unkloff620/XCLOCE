/*
 * «Общак» (the user 2026-11-23): a subscription for 30 days, four levels. Every Moscow day (from 00:00 МСК) it is
 * collected once: the day's stock of damage («Урон от Иглы», a button in a boss fight, apart from the weapons) and the
 * level's bonuses. Nothing piles up: the stock not spent today is gone tomorrow. What a boss cannot take of it stays
 * for the next one. A new level over an active one starts its 30 days anew and can be collected at once; the same
 * level again adds 30 days to what is left.
 * The user's own list, our things in place of theirs: мыло → Золотые слитки, чифир → Энергетик, сахар → Зубы,
 * финки → Нож, яд → Rug Pull Gun, самопалы → Пистолет.
 */
import type { Reward } from "./rewards.ts";

export type ObshakLevel = "pacan" | "blat" | "avtor" | "vor";
export interface ObshakDef {
  id: ObshakLevel;
  n: number;
  name: string;
  /** in золотые слитки */
  price: number;
  /** the day's stock of damage */
  damage: number;
  /** the day's bonuses */
  bonus: Reward;
  /** a chance of «Связка ключей» a day (once, while the player has none) */
  keysChance?: number;
}

export const OBSHAK_DAYS = 30;
export const OBSHAK_KEYS = "keys-bundle";
/** the needle's «weapon» id in the fight's feed (its picture: public/assets/items/needle.webp) */
export const NEEDLE_ID = "needle";

export const OBSHAK: ObshakDef[] = [
  { id: "pacan", n: 1, name: "Пацанский", price: 100, damage: 3_000_000,
    bonus: { currencies: { PAP: 500, TOOTH: 50 }, items: [{ id: "energy-drink", qty: 1 }, { id: "keyboard", qty: 10 }] } },
  { id: "blat", n: 2, name: "Блатной", price: 200, damage: 6_000_000,
    bonus: { currencies: { PAP: 1000, TOOTH: 100 }, items: [{ id: "energy-drink", qty: 2 }, { id: "keyboard", qty: 15 }] } },
  { id: "avtor", n: 3, name: "Авторитетный", price: 500, damage: 10_000_000,
    bonus: { currencies: { TOOTH: 300, RUB: 5 }, items: [{ id: "energy-drink", qty: 3 }, { id: "rug-pull-gun", qty: 1 }, { id: "keyboard", qty: 20 }, { id: "poker-chip", qty: 1 }] } },
  { id: "vor", n: 4, name: "Воровской", price: 600, damage: 20_000_000, keysChance: 0.03,
    bonus: { currencies: { RUB: 10 }, items: [{ id: "energy-drink", qty: 4 }, { id: "rug-pull-gun", qty: 2 }, { id: "keyboard", qty: 20 }, { id: "gpu", qty: 10 }, { id: "poker-chip", qty: 2 }] } },
];
export const obshakById = (id: string | null | undefined) => OBSHAK.find((o) => o.id === id);
