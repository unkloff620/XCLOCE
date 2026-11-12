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

// Everything is sold for RUB. Energy: +50 — 40 ₽ a point, +100 — 36, +500 — 30 (the best deal); all far above the best task pay (16), so it cannot be farmed.
export const OFFERS: Offer[] = [
  { id: "keyboard-1", section: "weapons", give: { item: "keyboard", qty: 1 }, price: { currency: "RUB", amount: 190 }, title: "Клавиатура", bulk: true },
  { id: "gpu-1", section: "weapons", give: { item: "gpu", qty: 1 }, price: { currency: "RUB", amount: 350 }, title: "Видеокарта", bulk: true },
  { id: "rpg-1", section: "weapons", give: { item: "rug-pull-gun", qty: 1 }, price: { currency: "RUB", amount: 500 }, title: "Rug Pull Gun", bulk: true },
  { id: "energy-50", section: "energy", give: { energy: 50, qty: 1 }, price: { currency: "RUB", amount: 4_500 }, title: "+50 энергии" },
  { id: "energy-100", section: "energy", give: { energy: 100, qty: 1 }, price: { currency: "RUB", amount: 8_200 }, title: "+100 энергии" },
  { id: "energy-500", section: "energy", give: { energy: 500, qty: 1 }, price: { currency: "RUB", amount: 35_000 }, title: "+500 энергии", note: "самое выгодное" },
  { id: "tee-white", section: "clothing", give: { item: "tee-white", qty: 1 }, price: { currency: "RUB", amount: 400 }, title: "Белая футболка" },
  { id: "slippers", section: "clothing", give: { item: "slippers", qty: 1 }, price: { currency: "RUB", amount: 900 }, title: "Тапки" },
  { id: "sneakers", section: "clothing", give: { item: "sneakers", qty: 1 }, price: { currency: "RUB", amount: 500 }, title: "Кеды" },
  { id: "jeans", section: "clothing", give: { item: "jeans", qty: 1 }, price: { currency: "RUB", amount: 600 }, title: "Джинсы" },
  { id: "tee-pump", section: "clothing", give: { item: "tee-pump", qty: 1 }, price: { currency: "RUB", amount: 1500 }, title: "Футболка PUMP" },
  { id: "hand-drum", section: "clothing", give: { item: "hand-drum", qty: 1 }, price: { currency: "RUB", amount: 2000 }, title: "Нервные пальцы" },
  { id: "bottle-komandate", section: "clothing", give: { item: "bottle-komandate", qty: 1 }, price: { currency: "RUB", amount: 3000 }, title: "Бутылка Командате" },
  { id: "jacket-komandate", section: "clothing", give: { item: "jacket-komandate", qty: 1 }, price: { currency: "RUB", amount: 2_100 }, title: "Олимпийка Командате" },
  { id: "pants-komandate", section: "clothing", give: { item: "pants-komandate", qty: 1 }, price: { currency: "RUB", amount: 2500 }, title: "Спортивки Командате" },
  { id: "sneakers-komandate", section: "clothing", give: { item: "sneakers-komandate", qty: 1 }, price: { currency: "RUB", amount: 2500 }, title: "Кроссовки Командате" },
  { id: "jacket-puffer", section: "clothing", give: { item: "jacket-puffer", qty: 1 }, price: { currency: "RUB", amount: 2_800 }, title: "Пуховик Гаркуши" },
  { id: "pants-black", section: "clothing", give: { item: "pants-black", qty: 1 }, price: { currency: "RUB", amount: 2_000 }, title: "Чёрные штаны Гаркуши" },
  { id: "sneakers-chunky", section: "clothing", give: { item: "sneakers-chunky", qty: 1 }, price: { currency: "RUB", amount: 2_200 }, title: "Кроссовки Гаркуши" },
  { id: "tee-sailor", section: "clothing", give: { item: "tee-sailor", qty: 1 }, price: { currency: "RUB", amount: 1_700 }, title: "Тельняшка Мугонатора" },
  { id: "anchor-mugo", section: "clothing", give: { item: "anchor-mugo", qty: 1 }, price: { currency: "RUB", amount: 2_600 }, title: "Якорь" },
  { id: "gloves-botsman", section: "clothing", give: { item: "gloves-botsman", qty: 1 }, price: { currency: "RUB", amount: 3_200 }, title: "Перчатки Боцмана" },
  { id: "cap-captain", section: "clothing", give: { item: "cap-captain", qty: 1 }, price: { currency: "RUB", amount: 2_400 }, title: "Капитанская фуражка" },
  { id: "mask-diver", section: "clothing", give: { item: "mask-diver", qty: 1 }, price: { currency: "RUB", amount: 1_900 }, title: "Маска для ныряния" },
  { id: "teeth-necklace", section: "clothing", give: { item: "teeth-necklace", qty: 1 }, price: { currency: "RUB", amount: 2_200 }, title: "Ожерелье из акульих зубов" },
  { id: "tee-actclose", section: "clothing", give: { item: "tee-actclose", qty: 1 }, price: { currency: "RUB", amount: 1_600 }, title: "Футболка ActClose" },
  { id: "shorts-actclose", section: "clothing", give: { item: "shorts-actclose", qty: 1 }, price: { currency: "RUB", amount: 1_800 }, title: "Шорты ActClose" },
  { id: "badge-actclose", section: "clothing", give: { item: "badge-actclose", qty: 1 }, price: { currency: "RUB", amount: 2_400 }, title: "Бейдж ActClose" },
  { id: "sweater-vostok", section: "clothing", give: { item: "sweater-vostok", qty: 1 }, price: { currency: "RUB", amount: 2_600 }, title: "Кофта Лудомана" },
  { id: "pants-vostok", section: "clothing", give: { item: "pants-vostok", qty: 1 }, price: { currency: "RUB", amount: 2_600 }, title: "Штаны Лудомана" },
  { id: "headphones-vostok", section: "clothing", give: { item: "headphones-vostok", qty: 1 }, price: { currency: "RUB", amount: 2_100 }, title: "Наушники Лудомана" },
  { id: "sneakers-black", section: "clothing", give: { item: "sneakers-black", qty: 1 }, price: { currency: "RUB", amount: 3000 }, title: "Кроссовки Лудомана" },
  { id: "jacket-vadim", section: "clothing", give: { item: "jacket-vadim", qty: 1 }, price: { currency: "RUB", amount: 3_400 }, title: "Пиджак Вадима" },
  { id: "pants-vadim", section: "clothing", give: { item: "pants-vadim", qty: 1 }, price: { currency: "RUB", amount: 3_000 }, title: "Брюки Вадима" },
  { id: "shoes-vadim", section: "clothing", give: { item: "shoes-vadim", qty: 1 }, price: { currency: "RUB", amount: 3_200 }, title: "Туфли Вадима" },
  { id: "tie-vadim", section: "clothing", give: { item: "tie-vadim", qty: 1 }, price: { currency: "RUB", amount: 2_600 }, title: "Галстук Вадима" },
  { id: "shorts-remote", section: "clothing", give: { item: "shorts-remote", qty: 1 }, price: { currency: "RUB", amount: 1800 }, title: "Шорты «на удалёнке»" },
  { id: "cap-moon", section: "clothing", give: { item: "cap-moon", qty: 1 }, price: { currency: "RUB", amount: 1_300 }, title: "Чёрная кепка" },
  { id: "hoodie-hodl", section: "clothing", give: { item: "hoodie-hodl", qty: 1 }, price: { currency: "RUB", amount: 3_000 }, title: "Худи HODL" },
  { id: "gold-chain", section: "clothing", give: { item: "gold-chain", qty: 1 }, price: { currency: "RUB", amount: 1_900 }, title: "Серебряная цепь" },
  { id: "energy-drink", section: "misc", give: { item: "energy-drink", qty: 1 }, price: { currency: "RUB", amount: 180 }, title: "Энергетик" },
];
export const offerById = (id: string) => OFFERS.find((o) => o.id === id);
