import { STASH_LOCATION_NAMES, STASH_SETS, stashLevel } from "./stashes.ts";
import { BOSSES, CARD_TIERS, isFirstWinItem, keyId, unlockBossOf } from "./bosses.ts";

export type Category = "weapon" | "clothing" | "item" | "reward" | "stash" | "event";
export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";
export type Slot = "BODY" | "PANTS" | "SHIRT" | "SHOES" | "HEAD" | "ACCESSORY" | "SPECIAL" | "HAND";
/** Drawing order of the character, bottom to top. */
export const SLOTS: Slot[] = ["BODY", "PANTS", "SHIRT", "SHOES", "HEAD", "ACCESSORY", "SPECIAL", "HAND"];
export const WEARABLE_SLOTS: Slot[] = ["PANTS", "SHIRT", "SHOES", "HEAD", "ACCESSORY", "SPECIAL", "HAND"];

export interface WeaponStats {
  damage: number;
  kind: "permanent" | "consumable";
  /** permanent weapons only: minutes until it can be used again */
  cooldownMin?: number;
  /** client animation id (see client/fx) */
  animation: "fist" | "mouse" | "candle" | "keyboard" | "gpu" | "rugpull";
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
    id: "fist", name: "Кулак", category: "weapon", rarity: "common", maxStack: 1,
    description: "Базовое оружие. Всегда с тобой: после удара руке нужно 5 часов отдыха, но в каждом новом бою кулак снова готов.",
    sources: ["Есть у каждого с начала игры"],
    weapon: { damage: 12, kind: "permanent", cooldownMin: 300, animation: "fist", action: "Втащить кулаком" },
  },
  {
    id: "mouse", name: "Мышь", category: "weapon", rarity: "common", maxStack: 1,
    description: "Перемотана скотчем, провод держится на честном слове. Бесплатная: после броска её надо 5 часов искать под столом, а в новом бою она снова под рукой.",
    sources: ["Есть у каждого с начала игры"],
    weapon: { damage: 20, kind: "permanent", cooldownMin: 300, animation: "mouse", action: "Кинуть мышку" },
  },
  {
    id: "red-candle", name: "Красная свеча", category: "weapon", rarity: "common", maxStack: 1,
    description: "Свеча графика, которая падает быстрее, чем ты успеваешь продать. Бесплатная: после удара 5 часов ждёт нового дна, но новый бой начинается с ней наготове.",
    sources: ["Есть у каждого с начала игры"],
    weapon: { damage: 30, kind: "permanent", cooldownMin: 300, animation: "candle", action: "Уронить капу" },
  },
  {
    id: "keyboard", name: "Клавиатура", category: "weapon", rarity: "rare", maxStack: 9999,
    description: "Механическая, с синими свичами. Громкая в полёте.",
    sources: ["Магазин", "Двор (редко)"],
    weapon: { damage: 30, kind: "consumable", animation: "keyboard", action: "Пиздануть клавой" },
  },
  {
    id: "gpu", name: "Видеокарта", category: "weapon", rarity: "epic", maxStack: 9999,
    description: "Три кулера, RGB и полное отсутствие сожалений.",
    sources: ["Магазин"],
    weapon: { damage: 60, kind: "consumable", animation: "gpu", action: "Снять видюху и кинуть в босса" },
  },
  {
    id: "rug-pull-gun", name: "Rug Pull Gun", category: "weapon", rarity: "legendary", maxStack: 9999,
    description: "Один выстрел — и под ногами босса исчезает ликвидность.",
    sources: ["Магазин"],
    weapon: { damage: 250, kind: "consumable", animation: "rugpull", action: "Выдернуть ковёр" },
  },
];

const WEARABLES: ItemDef[] = ([
  { id: "tee-white", name: "Белая футболка", slot: "SHIRT", rarity: "common", description: "Классика офиса. Выбивается из Дацкоу.", sources: ["Победа: Дацкоу (10%)"] },
  { id: "tee-pump", name: "Футболка pump.fun", slot: "SHIRT", rarity: "rare", description: "Зелёная, как график в мечтах.", sources: ["Магазин", "Награда за локацию 1"] },
  { id: "hoodie-hodl", name: "Худи HODL", slot: "SHIRT", rarity: "epic", description: "Держит тепло и позицию.", sources: ["Магазин", "Награда за локацию 4"] },
  { id: "jeans", name: "Джинсы", slot: "PANTS", rarity: "common", description: "Синие. Просто синие.", sources: ["Магазин"] },
  { id: "shorts-remote", name: "Шорты «на удалёнке»", slot: "PANTS", rarity: "rare", description: "Ниже камеры можно всё.", sources: ["Магазин", "Награда за локацию 2"] },
  { id: "sneakers", name: "Кеды", slot: "SHOES", rarity: "common", description: "Белые, пока не вышел во двор.", sources: ["Магазин"] },
  { id: "slippers", name: "Тапки", slot: "SHOES", rarity: "rare", description: "Офисный дресс-код, версия 2.0.", sources: ["Награда за локацию 3", "Победа: Дацкоу (10%)"] },
  { id: "cap-moon", name: "Чёрная кепка", slot: "HEAD", rarity: "rare", description: "Козырёк вперёд — курс на луну.", sources: ["Магазин", "Награда за локацию 2"] },
  { id: "santa-hat", name: "Новогодний колпак", slot: "HEAD", rarity: "epic", description: "Сезонный предмет.", sources: ["Новогодний ивент", "Награда за локацию 8"] },
  { id: "laser-eyes", name: "Лазерные глаза", slot: "ACCESSORY", rarity: "legendary", description: "Обязательный аксессуар биткоин-максималиста.", sources: ["Награда за локацию 5"] },
  // held in the left hand (slot «Кисть»): the boss's own weapon, worn for the look
  { id: "bottle-komandate", name: "Бутылка Командате", slot: "HAND", rarity: "epic", description: "Оружие Командате: горит, но не гаснет. Герой держит её в руке.", sources: ["Победа: Командате"] },
  { id: "hand-drum", name: "Нервные пальцы", slot: "HAND", rarity: "rare", description: "Пальцы сами отбивают ритм по колену, пока график грузится.", sources: ["Победа: Кедр"] },
  { id: "gold-chain", name: "Серебряная цепь", slot: "ACCESSORY", rarity: "epic", description: "Каждое звено — подтверждённый блок.", sources: ["Магазин", "Награда за локацию 3"] },
] as Omit<ItemDef, "category" | "maxStack">[]).map((w) => {
  // clothes a boss unlocks: the drop opens them in the shop, then they are bought there
  const boss = unlockBossOf(w.id);
  return { ...w, category: "clothing" as const, maxStack: 1, sources: boss ? [isFirstWinItem(w.id) ? `Первая победа над боссом ${boss.name}, потом — магазин` : `Выпадает с босса ${boss.name}, потом — магазин`, ...w.sources.filter((x) => !x.startsWith("Магазин") && !x.startsWith("Победа"))] : w.sources };
});

const MISC: ItemDef[] = [
  { id: "energy-drink", name: "Энергетик", category: "item", rarity: "common", maxStack: 999, description: "+10 энергии. Сверх лимита тоже работает.", sources: ["Двор", "Боссы"], use: { energy: 10 } },
  { id: "energy-pack", name: "Пачка энергетиков", category: "item", rarity: "rare", maxStack: 999, description: "+50 энергии разом.", sources: ["Награды локаций"], use: { energy: 50 } },
  { id: "sticker-hodl", name: "Стикер HODL", category: "item", rarity: "common", maxStack: 999, description: "Клеится на ноутбук и на мораль.", sources: ["Двор"] },
  { id: "bottle-cap", name: "Крышка от энергетика", category: "item", rarity: "common", maxStack: 999, description: "Собери 1000 и… ничего не будет.", sources: ["Двор"] },
  { id: "spinner", name: "Спиннер из 2017", category: "item", rarity: "common", maxStack: 999, description: "Крутится. Это всё.", sources: ["Двор"] },
  { id: "flyer-passive", name: "Листовка «Пассивный доход»", category: "item", rarity: "common", maxStack: 999, description: "Звоните прямо сейчас!", sources: ["Двор"] },
  { id: "lost-wallet", name: "Забытый кошелёк", category: "item", rarity: "rare", maxStack: 999, description: "Внутри немного долларов и чек из шаурмы.", sources: ["Двор"] },
];

/** Boss cards: ids stay key-<boss> (they used to be keys), the tier gives the look and the name. */
const KEYS: ItemDef[] = BOSSES.filter((b) => !b.final).map((b, i, list) => {
  const t = CARD_TIERS[b.card ?? "bronze"];
  const next = BOSSES.find((x) => x.order === b.order + 1);
  const need = next?.keysToUnlock ?? 3;
  return {
    id: keyId(b.id), name: `${t.name}: ${b.name}`, category: "reward" as const, rarity: t.rarity, maxStack: 999,
    description: `Выдаётся за победу над боссом ${b.name}. ${need === 1 ? "Один пропуск — вход" : `${need} пропуска — вход`} в бой с боссом ${next?.name ?? ""}: тратятся на старте боя, а если босс ушёл или ты сбежал — возвращаются.`.trim(),
    sources: [`Победа: ${b.name}`],
  };
});
/** Trophies stand in the room by themselves and give a bonus (TROPHIES in content/home.ts). */
const STATUE: ItemDef = {
  id: "statue-close", name: "Статуэтка CLOSE", category: "reward", rarity: "legendary", maxStack: 1,
  description: "Награда за Утилизатора. Сама встаёт на стол в комнате: +25% к силе крита.", sources: ["Победа: Утилизатор"],
};
const TROPHY: ItemDef = {
  id: "trophy-sun", name: "Осколок Солнца", category: "reward", rarity: "mythic", maxStack: 999,
  description: "Доказательство, что ты дошёл до конца.", sources: ["Победа: Солнце"],
};

/** Нычки (content/stashes.ts): one of each, a set of four per location */
const STASH_RARITY: Rarity[] = ["rare", "epic", "legendary", "mythic", "mythic"];
const STASHES: ItemDef[] = STASH_SETS.flatMap((s) =>
  s.items.map((it) => ({
    id: it.id, name: it.name, category: "stash" as const, rarity: STASH_RARITY[stashLevel(s) - 1] ?? "rare", maxStack: 999,
    description: `${it.description} Набор «${s.name}».`, sources: [`Локация «${STASH_LOCATION_NAMES[s.location]}»: задания и закрытие локации`],
  })),
);
export const ITEMS: ItemDef[] = [...WEAPONS, ...WEARABLES, ...MISC, ...KEYS, TROPHY, STATUE, ...STASHES];
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemById = (id: string) => BY_ID.get(id);
export const weaponById = (id: string) => {
  const i = BY_ID.get(id);
  return i?.weapon ? (i as ItemDef & { weapon: WeaponStats }) : undefined;
};

/** Starting outfit: a new player starts with nothing on (clothes come from the shop and from bosses). */
export const STARTER_OUTFIT: Partial<Record<Slot, string>> = {};
export const RARITY_NAME: Record<Rarity, string> = { common: "Обычный", rare: "Редкий", epic: "Эпический", legendary: "Легендарный", mythic: "Мифический" };
export const CATEGORY_NAME: Record<Category, string> = { weapon: "Оружие", clothing: "Одежда", item: "Предметы", reward: "Награды", stash: "Нычки", event: "Ивентовые" };

/** Everything that drops in the yard can be sold back for RUB (about half of the shop price). Overridable via config "sell". */
export const SELL_PRICES: Record<string, number> = {
  "bottle-cap": 15,
  "flyer-passive": 25,
  "sticker-hodl": 40,
  "spinner": 60,
  "energy-drink": 90,
  "lost-wallet": 150,
  "keyboard": 95,
};
for (const [id, price] of Object.entries(SELL_PRICES)) {
  const it = ITEMS.find((i) => i.id === id);
  if (it) it.sell = price;
}
