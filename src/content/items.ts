import { BOSSES, keyId } from "./bosses.ts";

export type Category = "weapon" | "clothing" | "item" | "reward" | "event";
export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";
export type Slot = "BODY" | "PANTS" | "SHIRT" | "SHOES" | "HEAD" | "ACCESSORY" | "SPECIAL";
/** Drawing order of the character, bottom to top. */
export const SLOTS: Slot[] = ["BODY", "PANTS", "SHIRT", "SHOES", "HEAD", "ACCESSORY", "SPECIAL"];
export const WEARABLE_SLOTS: Slot[] = ["PANTS", "SHIRT", "SHOES", "HEAD", "ACCESSORY", "SPECIAL"];

export interface WeaponStats {
  damage: number;
  kind: "permanent" | "consumable";
  /** permanent weapons only: minutes until it can be used again */
  cooldownMin?: number;
  /** client animation id (see client/fx) */
  animation: "mouse" | "candle" | "keyboard" | "gpu" | "rugpull";
  /** button text on the boss screen */
  action: string;
}

export interface ItemDef {
  id: string;
  name: string;
  category: Category;
  rarity: Rarity;
  description: string;
  maxStack: number;
  /** where it comes from (shown on the item card) */
  sources: string[];
  weapon?: WeaponStats;
  /** wearable */
  slot?: Slot;
  /** using it from the inventory */
  use?: { energy?: number };
  /** wearable that hides other slots (a hoodie hides the shirt underneath) */
  hides?: Slot[];
  /** sale price in RUB from the inventory (things found in the yard) */
  sell?: number;
}

export const WEAPONS: ItemDef[] = [
  {
    id: "mouse", name: "Мышь", category: "weapon", rarity: "common", maxStack: 1,
    description: "Базовое оружие. Не ломается, но после броска надо сходить за ней — час.",
    sources: ["Есть у каждого с начала игры"],
    weapon: { damage: 10, kind: "permanent", cooldownMin: 60, animation: "mouse", action: "Кинуть мышку" },
  },
  {
    id: "red-candle", name: "Красная свеча", category: "weapon", rarity: "common", maxStack: 999,
    description: "Свеча графика, которая падает быстрее, чем ты успеваешь продать.",
    sources: ["Магазин", "Двор (редко)"],
    weapon: { damage: 50, kind: "consumable", animation: "candle", action: "Уронить капу" },
  },
  {
    id: "keyboard", name: "Клавиатура", category: "weapon", rarity: "rare", maxStack: 999,
    description: "Механическая, с синими свичами. Громкая в полёте.",
    sources: ["Магазин", "Двор (редко)"],
    weapon: { damage: 100, kind: "consumable", animation: "keyboard", action: "Пиздануть клавой" },
  },
  {
    id: "gpu", name: "Видеокарта", category: "weapon", rarity: "epic", maxStack: 999,
    description: "Три кулера, RGB и полное отсутствие сожалений.",
    sources: ["Магазин"],
    weapon: { damage: 250, kind: "consumable", animation: "gpu", action: "Снять видюху и кинуть в босса" },
  },
  {
    id: "rug-pull-gun", name: "Rug Pull Gun", category: "weapon", rarity: "legendary", maxStack: 999,
    description: "Один выстрел — и под ногами босса исчезает ликвидность.",
    sources: ["Магазин"],
    weapon: { damage: 500, kind: "consumable", animation: "rugpull", action: "Выдернуть ковёр" },
  },
];

const WEARABLES: ItemDef[] = ([
  { id: "tee-white", name: "Белая майка", slot: "SHIRT", rarity: "common", description: "Классика: майка-алкоголичка, в которой начинают все.", sources: ["Стартовая"] },
  { id: "tee-pump", name: "Майка PUMP", slot: "SHIRT", rarity: "rare", description: "Зелёная, как график в мечтах.", sources: ["Награда за локацию 1"] },
  { id: "hoodie-hodl", name: "Худи HODL", slot: "SHIRT", rarity: "epic", description: "Держит тепло и позицию.", sources: ["Награда за локацию 4"] },
  { id: "jeans", name: "Джинсы", slot: "PANTS", rarity: "common", description: "Синие. Просто синие.", sources: ["Стартовые"] },
  { id: "shorts-remote", name: "Шорты «на удалёнке»", slot: "PANTS", rarity: "rare", description: "Ниже камеры можно всё.", sources: ["Награда за локацию 2"] },
  { id: "sneakers", name: "Кеды", slot: "SHOES", rarity: "common", description: "Белые, пока не вышел во двор.", sources: ["Стартовые"] },
  { id: "slippers", name: "Тапки", slot: "SHOES", rarity: "rare", description: "Офисный дресс-код, версия 2.0.", sources: ["Награда за локацию 3"] },
  { id: "cap-moon", name: "Кепка TO THE MOON", slot: "HEAD", rarity: "rare", description: "Указывает направление.", sources: ["Награда за локацию 2"] },
  { id: "santa-hat", name: "Новогодний колпак", slot: "HEAD", rarity: "epic", description: "Сезонный предмет.", sources: ["Новогодний ивент"] },
  { id: "laser-eyes", name: "Лазерные глаза", slot: "ACCESSORY", rarity: "legendary", description: "Обязательный аксессуар биткоин-максималиста.", sources: ["Награда за локацию 5"] },
  { id: "gold-chain", name: "Цепь из блокчейна", slot: "ACCESSORY", rarity: "epic", description: "Каждое звено — подтверждённый блок.", sources: ["Награда за локацию 3"] },
] as Omit<ItemDef, "category" | "maxStack">[]).map((w) => ({ ...w, category: "clothing" as const, maxStack: 1 }));

const MISC: ItemDef[] = [
  { id: "energy-drink", name: "Энергетик", category: "item", rarity: "common", maxStack: 999, description: "+10 энергии. Сверх лимита тоже работает.", sources: ["Двор", "Боссы"], use: { energy: 10 } },
  { id: "energy-pack", name: "Пачка энергетиков", category: "item", rarity: "rare", maxStack: 999, description: "+50 энергии разом.", sources: ["Награды локаций"], use: { energy: 50 } },
  { id: "sticker-hodl", name: "Стикер HODL", category: "item", rarity: "common", maxStack: 999, description: "Клеится на ноутбук и на мораль.", sources: ["Двор"] },
  { id: "bottle-cap", name: "Крышка от энергетика", category: "item", rarity: "common", maxStack: 999, description: "Собери 1000 и… ничего не будет.", sources: ["Двор"] },
  { id: "spinner", name: "Спиннер из 2017", category: "item", rarity: "common", maxStack: 999, description: "Крутится. Это всё.", sources: ["Двор"] },
  { id: "flyer-passive", name: "Листовка «Пассивный доход»", category: "item", rarity: "common", maxStack: 999, description: "Звоните прямо сейчас!", sources: ["Двор"] },
  { id: "lost-wallet", name: "Забытый кошелёк", category: "item", rarity: "rare", maxStack: 999, description: "Внутри немного долларов и чек из шаурмы.", sources: ["Двор"] },
];

const KEYS: ItemDef[] = BOSSES.filter((b) => !b.final).map((b) => ({
  id: keyId(b.id), name: `Ключ: ${b.name}`, category: "reward" as const, rarity: "rare" as const, maxStack: 999,
  description: `Выдаётся за победу над боссом ${b.name}. 3 ключа открывают следующего босса.`, sources: [`Победа: ${b.name}`],
}));
const TROPHY: ItemDef = {
  id: "trophy-sun", name: "Осколок Солнца", category: "reward", rarity: "mythic", maxStack: 999,
  description: "Доказательство, что ты дошёл до конца.", sources: ["Победа: Солнце"],
};

export const ITEMS: ItemDef[] = [...WEAPONS, ...WEARABLES, ...MISC, ...KEYS, TROPHY];
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemById = (id: string) => BY_ID.get(id);
export const weaponById = (id: string) => {
  const i = BY_ID.get(id);
  return i?.weapon ? (i as ItemDef & { weapon: WeaponStats }) : undefined;
};

/** Starting outfit: given and equipped on first login. */
export const STARTER_OUTFIT: Partial<Record<Slot, string>> = { SHIRT: "tee-white", PANTS: "jeans", SHOES: "sneakers" };
export const RARITY_NAME: Record<Rarity, string> = { common: "Обычный", rare: "Редкий", epic: "Эпический", legendary: "Легендарный", mythic: "Мифический" };
export const CATEGORY_NAME: Record<Category, string> = { weapon: "Оружие", clothing: "Одежда", item: "Предметы", reward: "Награды", event: "Ивентовые" };

/** Everything that drops in the yard can be sold back for RUB (about half of the shop price). Overridable via config "sell". */
export const SELL_PRICES: Record<string, number> = {
  "bottle-cap": 15,
  "flyer-passive": 25,
  "sticker-hodl": 40,
  "spinner": 60,
  "energy-drink": 90,
  "lost-wallet": 150,
  "red-candle": 50,
  "keyboard": 95,
};
for (const [id, price] of Object.entries(SELL_PRICES)) {
  const it = ITEMS.find((i) => i.id === id);
  if (it) it.sell = price;
}
