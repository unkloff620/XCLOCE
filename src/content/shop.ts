import type { Currency } from "./currencies.ts";

export interface Offer {
  id: string;
  section: "weapons" | "energy" | "clothing" | "misc";
  /** what the player gets: an item or raw energy */
  give: { item?: string; energy?: number; qty: number };
  price: { currency: Currency; amount: number };
  title: string;
  note?: string;
}

export const SHOP_SECTIONS = [
  { id: "weapons", name: "Оружие" },
  { id: "energy", name: "Энергия" },
  { id: "clothing", name: "Одежда" },
  { id: "misc", name: "Разное" },
] as const;

// Draft prices. Energy costs 18 RUB-equivalent per point, more than the best task pays (16), so it cannot be farmed.
export const OFFERS: Offer[] = [
  { id: "mouse-1", section: "weapons", give: { item: "mouse", qty: 1 }, price: { currency: "RUB", amount: 60 }, title: "Мышь" },
  { id: "mouse-10", section: "weapons", give: { item: "mouse", qty: 10 }, price: { currency: "RUB", amount: 540 }, title: "Мышь ×10", note: "−10%" },
  { id: "candle-1", section: "weapons", give: { item: "red-candle", qty: 1 }, price: { currency: "RUB", amount: 100 }, title: "Красная свеча" },
  { id: "candle-10", section: "weapons", give: { item: "red-candle", qty: 10 }, price: { currency: "RUB", amount: 900 }, title: "Красная свеча ×10", note: "−10%" },
  { id: "keyboard-1", section: "weapons", give: { item: "keyboard", qty: 1 }, price: { currency: "RUB", amount: 190 }, title: "Клавиатура" },
  { id: "keyboard-10", section: "weapons", give: { item: "keyboard", qty: 10 }, price: { currency: "RUB", amount: 1700 }, title: "Клавиатура ×10", note: "−10%" },
  { id: "gpu-1", section: "weapons", give: { item: "gpu", qty: 1 }, price: { currency: "USD", amount: 4 }, title: "Видеокарта" },
  { id: "gpu-10", section: "weapons", give: { item: "gpu", qty: 10 }, price: { currency: "USD", amount: 36 }, title: "Видеокарта ×10", note: "−10%" },
  { id: "rpg-1", section: "weapons", give: { item: "rug-pull-gun", qty: 1 }, price: { currency: "SOL", amount: 0.03 }, title: "Rug Pull Gun" },
  { id: "rpg-10", section: "weapons", give: { item: "rug-pull-gun", qty: 10 }, price: { currency: "SOL", amount: 0.27 }, title: "Rug Pull Gun ×10", note: "−10%" },
  { id: "energy-50", section: "energy", give: { energy: 50, qty: 1 }, price: { currency: "RUB", amount: 900 }, title: "+50 энергии" },
  { id: "energy-100", section: "energy", give: { energy: 100, qty: 1 }, price: { currency: "USD", amount: 20 }, title: "+100 энергии" },
  { id: "energy-500", section: "energy", give: { energy: 500, qty: 1 }, price: { currency: "SOL", amount: 0.6 }, title: "+500 энергии", note: "сверх лимита" },
  { id: "tee-pump", section: "clothing", give: { item: "tee-pump", qty: 1 }, price: { currency: "RUB", amount: 1500 }, title: "Футболка PUMP" },
  { id: "cap-moon", section: "clothing", give: { item: "cap-moon", qty: 1 }, price: { currency: "USD", amount: 15 }, title: "Чёрная кепка" },
  { id: "energy-drink", section: "misc", give: { item: "energy-drink", qty: 1 }, price: { currency: "RUB", amount: 180 }, title: "Энергетик" },
];
export const offerById = (id: string) => OFFERS.find((o) => o.id === id);
