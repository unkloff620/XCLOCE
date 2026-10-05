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

// Draft prices. Energy costs 18 RUB-equivalent per point, more than the best task pays (16), so it cannot be farmed.
export const OFFERS: Offer[] = [
  { id: "mouse-1", section: "weapons", give: { item: "mouse", qty: 1 }, price: { currency: "RUB", amount: 60 }, title: "Мышь", bulk: true },
  { id: "candle-1", section: "weapons", give: { item: "red-candle", qty: 1 }, price: { currency: "RUB", amount: 100 }, title: "Красная свеча", bulk: true },
  { id: "keyboard-1", section: "weapons", give: { item: "keyboard", qty: 1 }, price: { currency: "RUB", amount: 190 }, title: "Клавиатура", bulk: true },
  { id: "gpu-1", section: "weapons", give: { item: "gpu", qty: 1 }, price: { currency: "USD", amount: 4 }, title: "Видеокарта", bulk: true },
  { id: "rpg-1", section: "weapons", give: { item: "rug-pull-gun", qty: 1 }, price: { currency: "SOL", amount: 0.03 }, title: "Rug Pull Gun", bulk: true },
  { id: "energy-50", section: "energy", give: { energy: 50, qty: 1 }, price: { currency: "RUB", amount: 900 }, title: "+50 энергии" },
  { id: "energy-100", section: "energy", give: { energy: 100, qty: 1 }, price: { currency: "USD", amount: 20 }, title: "+100 энергии" },
  { id: "energy-500", section: "energy", give: { energy: 500, qty: 1 }, price: { currency: "SOL", amount: 0.6 }, title: "+500 энергии", note: "сверх лимита" },
  { id: "tee-white", section: "clothing", give: { item: "tee-white", qty: 1 }, price: { currency: "RUB", amount: 400 }, title: "Белая футболка" },
  { id: "slippers", section: "clothing", give: { item: "slippers", qty: 1 }, price: { currency: "RUB", amount: 900 }, title: "Тапки" },
  { id: "sneakers", section: "clothing", give: { item: "sneakers", qty: 1 }, price: { currency: "RUB", amount: 500 }, title: "Кеды" },
  { id: "jeans", section: "clothing", give: { item: "jeans", qty: 1 }, price: { currency: "RUB", amount: 600 }, title: "Джинсы" },
  { id: "tee-pump", section: "clothing", give: { item: "tee-pump", qty: 1 }, price: { currency: "RUB", amount: 1500 }, title: "Футболка PUMP" },
  { id: "shorts-remote", section: "clothing", give: { item: "shorts-remote", qty: 1 }, price: { currency: "RUB", amount: 1800 }, title: "Шорты «на удалёнке»" },
  { id: "cap-moon", section: "clothing", give: { item: "cap-moon", qty: 1 }, price: { currency: "USD", amount: 15 }, title: "Чёрная кепка" },
  { id: "hoodie-hodl", section: "clothing", give: { item: "hoodie-hodl", qty: 1 }, price: { currency: "USD", amount: 35 }, title: "Худи HODL" },
  { id: "gold-chain", section: "clothing", give: { item: "gold-chain", qty: 1 }, price: { currency: "SOL", amount: 0.12 }, title: "Серебряная цепь" },
  { id: "energy-drink", section: "misc", give: { item: "energy-drink", qty: 1 }, price: { currency: "RUB", amount: 180 }, title: "Энергетик" },
];
export const offerById = (id: string) => OFFERS.find((o) => o.id === id);
