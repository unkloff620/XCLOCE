import { CURRENCY_DEFS, type Currency } from "./currencies.ts";

export interface Offer {
  id: string;
  section: "weapons" | "energy" | "clothing" | "misc";
  /** what the player gets: an item or raw energy */
  give: { item?: string; energy?: number; qty: number };
  price: { currency: Currency; amount: number };
  title: string;
  note?: string;
  /** sold in batches of BULK sizes with a discount (weapons) */
  bulk?: boolean;
}

/** Batch sizes for weapons and their discounts: the more you take at once, the cheaper each piece. */
export const BULK = [
  { qty: 1, off: 0 },
  { qty: 10, off: 0.02 },
  { qty: 100, off: 0.05 },
  { qty: 1000, off: 0.1 },
  { qty: 10000, off: 0.1 },
  { qty: 99999, off: 0.1 },
] as const;
export const bulkOf = (qty: number) => BULK.find((b) => b.qty === qty);

/** price of `qty` pieces at `unit` each, with the batch discount, rounded to the currency's precision (at least the smallest unit) */
export function bulkPrice(currency: Currency, unit: number, qty: number): number {
  const k = 10 ** CURRENCY_DEFS[currency].decimals;
  const off = bulkOf(qty)?.off ?? 0;
  return Math.max(1, Math.round(unit * qty * (1 - off) * k)) / k;
}

export const SHOP_SECTIONS = [
  { id: "weapons", name: "Оружие" },
  { id: "energy", name: "Энергия" },
  { id: "clothing", name: "Одежда" },
  { id: "misc", name: "Разное" },
] as const;

// Weapons and clothes for RUB; the energy drink (to the limit) for gold bars.
export const OFFERS: Offer[] = [
  { id: "keyboard-1", section: "weapons", give: { item: "keyboard", qty: 1 }, price: { currency: "RUB", amount: 4 }, title: "Нож", bulk: true },
  { id: "gpu-1", section: "weapons", give: { item: "gpu", qty: 1 }, price: { currency: "RUB", amount: 5 }, title: "Ствол", bulk: true },
  { id: "rpg-1", section: "weapons", give: { item: "rug-pull-gun", qty: 1 }, price: { currency: "RUB", amount: 18 }, title: "Пушка", bulk: true },
  // energy drinks are not sold here any more: only «Пополнить» in the energy window (content/items.ts ENERGY_REFILL)
  { id: "slippers", section: "clothing", give: { item: "slippers", qty: 1 }, price: { currency: "RUB", amount: 900 }, title: "Тапки" },
  { id: "tee-pump", section: "clothing", give: { item: "tee-pump", qty: 1 }, price: { currency: "RUB", amount: 1500 }, title: "Футболка PUMP" },
  { id: "mug-coin", section: "clothing", give: { item: "mug-coin", qty: 1 }, price: { currency: "RUB", amount: 2500 }, title: "Кружка с монетой" },
  { id: "shorts-remote", section: "clothing", give: { item: "shorts-remote", qty: 1 }, price: { currency: "RUB", amount: 1800 }, title: "Шорты «на удалёнке»" },
  { id: "cap-moon", section: "clothing", give: { item: "cap-moon", qty: 1 }, price: { currency: "RUB", amount: 1_300 }, title: "Чёрная кепка" },
  { id: "hoodie-hodl", section: "clothing", give: { item: "hoodie-hodl", qty: 1 }, price: { currency: "RUB", amount: 3_000 }, title: "Худи HODL" },
  { id: "gold-chain", section: "clothing", give: { item: "gold-chain", qty: 1 }, price: { currency: "RUB", amount: 1_900 }, title: "Серебряная цепь" },
];
export const offerById = (id: string) => OFFERS.find((o) => o.id === id);
