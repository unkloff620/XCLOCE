import { STASH_LOCATION_NAMES, STASH_SETS, stashLevel } from "./stashes.ts";
import { BOSSES, CARD_TIERS, bossById, isFirstWinItem, keyId, passLook, unlockBossOf } from "./bosses.ts";
import { TATTOO_MODE_NAME, TATTOO_SETS } from "./tattoos.ts";
import { CRAFT_ALL, CRAFT_PARTS } from "./craft.ts";
import { PART_SELL } from "./craft-drops.ts";

/** "tattoo": inked on a part of the body in the hero editor («Наколки», content/tattoos.ts) */
export type Category = "weapon" | "clothing" | "item" | "reward" | "stash" | "event" | "tattoo" | "craft";
export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";
/** FACE: worn on the face (laser eyes) — its own tab in the hero editor */
export type Slot = "BODY" | "PANTS" | "SHIRT" | "SHOES" | "HEAD" | "FACE" | "MOUTH" | "TEETH" | "ACCESSORY" | "SPECIAL" | "HAND";
/** Drawing order of the character, bottom to top. */
export const SLOTS: Slot[] = ["BODY", "PANTS", "SHIRT", "SHOES", "HEAD", "FACE", "MOUTH", "TEETH", "ACCESSORY", "SPECIAL", "HAND"];
export const WEARABLE_SLOTS: Slot[] = ["PANTS", "SHIRT", "SHOES", "HEAD", "FACE", "MOUTH", "TEETH", "ACCESSORY", "SPECIAL", "HAND"];

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

/** a free weapon still reloading can hit at once for this (the player agrees in a window first); then it reloads again */
export const RUSH_PRICE = { currency: "USD" as const, amount: 2 };

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
    id: "keyboard", name: "Клавиатура", category: "weapon", rarity: "rare", maxStack: 99_999_999,
    description: "Механическая, с синими свичами. Громкая в полёте.",
    sources: ["Магазин", "Двор (редко)"],
    weapon: { damage: 30, kind: "consumable", animation: "keyboard", action: "Пиздануть клавой" },
  },
  {
    id: "gpu", name: "Видеокарта", category: "weapon", rarity: "epic", maxStack: 99_999_999,
    description: "Три кулера, RGB и полное отсутствие сожалений.",
    sources: ["Магазин"],
    weapon: { damage: 60, kind: "consumable", animation: "gpu", action: "Снять видюху и кинуть в босса" },
  },
  {
    id: "rug-pull-gun", name: "Rug Pull Gun", category: "weapon", rarity: "legendary", maxStack: 99_999_999,
    description: "Один выстрел — и под ногами босса исчезает ликвидность.",
    sources: ["Магазин"],
    weapon: { damage: 250, kind: "consumable", animation: "rugpull", action: "Выдернуть ковёр" },
  },
];

const WEARABLES: ItemDef[] = ([
  { id: "tee-white", name: "Белая футболка", slot: "SHIRT", rarity: "common", description: "Классика офиса. Выбивается из Дацкоу.", sources: ["Победа: Дацкоу (Блатной, 70%)"] },
  { id: "tee-pump", name: "Футболка pump.fun", slot: "SHIRT", rarity: "rare", description: "Зелёная, как график в мечтах.", sources: ["Магазин", "Награда за локацию 1"] },
  { id: "hoodie-hodl", name: "Худи HODL", slot: "SHIRT", rarity: "epic", description: "Держит тепло и позицию.", sources: ["Магазин", "Награда за локацию 4"] },
  { id: "jeans", name: "Джинсы", slot: "PANTS", rarity: "common", description: "Синие. Просто синие.", sources: ["Магазин"] },
  { id: "shorts-remote", name: "Шорты «на удалёнке»", slot: "PANTS", rarity: "rare", description: "Ниже камеры можно всё.", sources: ["Магазин", "Награда за локацию 2"] },
  { id: "sneakers", name: "Кеды", slot: "SHOES", rarity: "common", description: "Белые, пока не вышел во двор.", sources: ["Магазин"] },
  { id: "slippers", name: "Тапки", slot: "SHOES", rarity: "rare", description: "Офисный дресс-код, версия 2.0.", sources: ["Магазин", "Награда за локацию 3"] },
  { id: "cap-moon", name: "Чёрная кепка", slot: "HEAD", rarity: "rare", description: "Козырёк вперёд — курс на луну.", sources: ["Магазин", "Награда за локацию 2"] },
  { id: "santa-hat", name: "Новогодний колпак", slot: "HEAD", rarity: "epic", description: "Сезонный предмет.", sources: ["Новогодний ивент", "Награда за локацию 8"] },
  { id: "laser-eyes", name: "Лазерные глаза", slot: "FACE", rarity: "legendary", description: "Обязательный аксессуар биткоин-максималиста.", sources: ["Награда за локацию 5"] },
  // «Рот» (slot MOUTH): drop from «Ящик ништяков» (content/ach-box.ts MOUTH_ITEMS)
  { id: "cigarette", name: "Сигарета", slot: "MOUTH", rarity: "rare", description: "Дымится, пока ждёшь босса.", sources: ["Ящик ништяков"] },
  { id: "toothpick", name: "Зубочистка", slot: "MOUTH", rarity: "rare", description: "Для тех, кто уже всё съел.", sources: ["Ящик ништяков"] },
  // only from «Ящик ништяков» (content/ach-box.ts CASE_THINGS)
  { id: "shades-gold", name: "Очки «Кит»", slot: "FACE", rarity: "epic", description: "Чёрные стёкла, золотая оправа. Графики через них всегда зелёные.", sources: ["Ящик ништяков"] },
  { id: "mask-anon", name: "Маска Анонимуса", slot: "FACE", rarity: "epic", description: "Хакер, который слил биржу. Никто не знает, кто под маской.", sources: ["Ящик ништяков"] },
  { id: "monocle-whale", name: "Монокль и усы", slot: "FACE", rarity: "epic", description: "Кит старой школы: держит биток с 2011-го.", sources: ["Ящик ништяков"] },
  { id: "bruise-liq", name: "Фингал и пластырь", slot: "FACE", rarity: "rare", description: "Так выглядят после ликвидации на сотом плече.", sources: ["Ящик ништяков"] },
  { id: "crown-cash", name: "Корона из купюр", slot: "HEAD", rarity: "legendary", description: "Король памп-дампа. Сложена из настоящих бумажных долларов.", sources: ["Ящик ништяков"] },
  { id: "ushanka-star", name: "Ушанка со звездой", slot: "HEAD", rarity: "rare", description: "Тепло, мех и красная звезда. Зима близко.", sources: ["Ящик ништяков"] },
  { id: "helmet-miner", name: "Каска майнера", slot: "HEAD", rarity: "epic", description: "С фонарём — копать биток в любой темноте.", sources: ["Ящик ништяков"] },
  { id: "bandana-hodl", name: "Бандана HODL", slot: "HEAD", rarity: "rare", description: "Повязал — и держишь. Что бы ни случилось.", sources: ["Ящик ништяков"] },
  { id: "cigar", name: "Сигара", slot: "MOUTH", rarity: "epic", description: "Кубинская. Для тех, у кого всё в плюсе.", sources: ["Ящик ништяков"] },
  { id: "teeth-grin", name: "Оскал", slot: "TEETH", rarity: "epic", description: "Зубы напоказ: челюсть ходит, герой скалится. Можно держать в них сигарету, сигару или зубочистку.", sources: ["Ящик ништяков"] },
  { id: "grillz-diamond", name: "Бриллиантовые зубы", slot: "TEETH", rarity: "legendary", description: "Улыбнулся — и весь двор ослеп. Можно держать в них сигарету, сигару или зубочистку.", sources: ["Ящик ништяков"] },
  { id: "chain-cuban", name: "Золотая цепь", slot: "ACCESSORY", rarity: "legendary", description: "Толстая, как профит после халвинга. Звенит на весь двор.", sources: ["Ящик ништяков"] },
  // held in the left hand (slot «Кисть»): the boss's own weapon, worn for the look
  { id: "bottle-komandate", name: "Бутылка Командате", slot: "HAND", rarity: "epic", description: "Оружие Командате: горит, но не гаснет. Герой держит её в руке.", sources: ["Победа: Командате"] },
  { id: "hand-drum", name: "Нервные пальцы", slot: "HAND", rarity: "rare", description: "Пальцы сами отбивают ритм по колену, пока график грузится.", sources: ["Победа: Кедр"] },
  // Гаркуша's set: all in black (cut from the hero on tools/rig/source/wear); the jacket is worn open over the bare chest
  { id: "jacket-puffer", name: "Пуховик Гаркуши", slot: "SHIRT", rarity: "epic", description: "Чёрный, дутый, нараспашку — чтобы наколки было видно. Карманы под пачки.", sources: ["Победа: Гаркуша (Блатной)"] },
  { id: "pants-black", name: "Чёрные штаны Гаркуши", slot: "PANTS", rarity: "rare", description: "Плотные, прямые. В них удобно стоять у кассы.", sources: ["Победа: Гаркуша (Блатной)"] },
  { id: "sneakers-chunky", name: "Кроссовки Гаркуши", slot: "SHOES", rarity: "rare", description: "Чёрные, на толстой подошве. Шаг тяжёлый, как пачка пятитысячных.", sources: ["Победа: Гаркуша (Блатной)"] },
  // Мугонатор's set: the sea captain (cut from the hero on tools/rig/source/wear)
  { id: "tee-sailor", name: "Тельняшка Мугонатора", slot: "SHIRT", rarity: "rare", description: "Полоски — чтобы акула видела, кого не трогать. Край уже кто-то откусил.", sources: ["Победа: Мугонатор (Блатной)"] },
  { id: "anchor-mugo", name: "Якорь", slot: "HAND", rarity: "epic", description: "Мугонатор качает его на верёвке и ждёт, когда Вадим скажет «бросай». Герой держит его в руке.", sources: ["Победа: Мугонатор (Блатной)"] },
  // Боцман's set: the gloves; the left hand plays with his crowbar (tools/rig/build-gloves.py)
  { id: "coat-botsman", name: "Плащ Боцмана", slot: "SHIRT", rarity: "legendary", description: "Длинный, кожаный, нараспашку. Полы ложатся на пол, как у того, кто знает, где выход из матрицы.", sources: ["Победа: Боцман (Блатной)"] },
  { id: "pants-botsman", name: "Штаны Боцмана", slot: "PANTS", rarity: "epic", description: "Чёрные, широкие, с ремнями на бёдрах. Карманов нет — всё нужное у него в руке.", sources: ["Победа: Боцман (Блатной)"] },
  { id: "boots-botsman", name: "Берцы Боцмана", slot: "SHOES", rarity: "epic", description: "Шнуровка до верха, подошва — протектор. Год пылились до Нового года.", sources: ["Победа: Боцман (Блатной)"] },
  { id: "gloves-botsman", name: "Перчатки Боцмана", slot: "HAND", rarity: "epic", description: "Чёрные, кожаные. В левой — монтировка: качает, подкидывает, ловит. Ни разу не уронил.", sources: ["Победа: Боцман (Блатной)"] },
  { id: "cap-captain", name: "Капитанская фуражка", slot: "HEAD", rarity: "epic", description: "Белая, с якорем. Вадим сказал — Мугонатор надел.", sources: ["Победа: Мугонатор (Блатной)"] },
  { id: "mask-diver", name: "Маска для ныряния", slot: "FACE", rarity: "rare", description: "Ныряет на самое дно графика и дышит через трубку.", sources: ["Победа: Мугонатор (Блатной)"] },
  { id: "teeth-necklace", name: "Ожерелье из акульих зубов", slot: "ACCESSORY", rarity: "epic", description: "Зубы свои, выпавшие. Растут новые.", sources: ["Победа: Мугонатор (Блатной)"] },
  // Кедр's set (cut from the hero on tools/rig/source/wear)
  { id: "tee-actclose", name: "Футболка ActClose", slot: "SHIRT", rarity: "rare", description: "Чёрная, с красным actclose на груди. Сайт лежит — футболка стоит.", sources: ["Победа: Кедр (Блатной)"] },
  { id: "shorts-actclose", name: "Шорты ActClose", slot: "PANTS", rarity: "rare", description: "Чёрные, с белыми шнурками. Дежурить по сайту можно и в шортах.", sources: ["Победа: Кедр (Блатной)"] },
  { id: "badge-actclose", name: "Бейдж ActClose", slot: "ACCESSORY", rarity: "epic", description: "ACTCLOSE · ADMIN. Пускает в серверную и в любую очередь без очереди.", sources: ["Победа: Кедр (Блатной)"] },
  // Командате's tracksuit: the drawn set (tools/rig/source/wear, icons in tools/items/source)
  { id: "jacket-komandate", name: "Олимпийка Командате", slot: "SHIRT", rarity: "epic", description: "Молния до горла — так командуют с района.", sources: ["Победа: Командате"] },
  { id: "pants-komandate", name: "Спортивки Командате", slot: "PANTS", rarity: "rare", description: "Широкие, с завязками. Для приседа у подъезда.", sources: ["Победа: Командате"] },
  { id: "sneakers-komandate", name: "Кроссовки Командате", slot: "SHOES", rarity: "rare", description: "Зелёные, как свечи в его отчётах.", sources: ["Победа: Командате"] },
  // Восток's sweatshirt (tools/rig/make-sweater-vostok.py): the first piece of his set
  { id: "sweater-vostok", name: "Кофта Лудомана", slot: "SHIRT", rarity: "epic", description: "Ремни застёгнуты, ставки сделаны. Снял с Востока.", sources: ["Победа: Восток"] },
  { id: "pants-vostok", name: "Штаны Лудомана", slot: "PANTS", rarity: "epic", description: "Ремни на коленях, чтобы не убежать от автомата. Снял с Востока.", sources: ["Победа: Восток"] },
  { id: "headphones-vostok", name: "Наушники Лудомана", slot: "HEAD", rarity: "epic", description: "Чтобы не слышать, сколько уже проиграно. Снял с Востока.", sources: ["Победа: Восток"] },
  { id: "sneakers-black", name: "Кроссовки Лудомана", slot: "SHOES", rarity: "epic", description: "Чёрные, на толстой подошве — чтобы до автомата и обратно. Снял с Востока.", sources: ["Победа: Восток"] },
  // Вадим's suit (the jacket, the trousers and the shoes keep the cut of Гаркуша's things; the tie is his own)
  { id: "jacket-vadim", name: "Пиджак Вадима", slot: "SHIRT", rarity: "epic", description: "Тёмно-синий, нараспашку — пуговицы застёгивают только подчинённые. Снял с Вадима.", sources: ["Победа: Вадим (Блатной)"] },
  { id: "pants-vadim", name: "Брюки Вадима", slot: "PANTS", rarity: "epic", description: "Стрелки острее кухонного ножа. Снял с Вадима.", sources: ["Победа: Вадим (Блатной)"] },
  { id: "shoes-vadim", name: "Туфли Вадима", slot: "SHOES", rarity: "epic", description: "Коричневые лоферы с золотой пряжкой — в них заходят в кабинет без стука. Снял с Вадима.", sources: ["Победа: Вадим (Блатной)"] },
  { id: "tie-vadim", name: "Галстук Вадима", slot: "ACCESSORY", rarity: "epic", description: "Красный, в косую полоску. Можно носить и без рубашки — Вадим разрешил. Снял с Вадима.", sources: ["Победа: Вадим (Блатной)"] },
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
  { id: "poker-chip", name: "Фишка", category: "item", rarity: "rare", maxStack: 999, description: "Одна бесплатная раздача в покере.", sources: ["Двор"] },
  { id: "lost-wallet", name: "Забытый кошелёк", category: "item", rarity: "rare", maxStack: 999, description: "Внутри немного долларов и чек из шаурмы.", sources: ["Двор"] },
  // «Колесо удачи» (content/fortune.ts): the ticket is one spin; the keycaps open the boxes of the bag
  { id: "fortune-ticket", name: "Билет колеса", category: "item", rarity: "rare", maxStack: 99_999, description: "Одна прокрутка «Колеса удачи» на заднем дворе. Каждая прокрутка растит общий джекпот.", sources: ["Ящик ништяков в магазине", "Колесо удачи: купить за 10 $", "Колесо удачи"] },
  // «Ходки» (content/raids.ts): a taken yard's flag, 1…5 stars — the bags of tattoo sets are opened for them
  ...[1, 2, 3, 4, 5].map((n) => ({ id: `raid-flag-${n}`, name: `Флаг двора ${"★".repeat(n)}`, category: "item" as const, rarity: (["common", "rare", "rare", "epic", "legendary"] as const)[n - 1], maxStack: 99_999, description: `Флаг захваченного двора №${n}. За флаги открываются сумки с сетами наколок.`, sources: ["Захват: взятие двора"] })),
  { id: "keycap", name: "Кнопка клавиатуры", category: "item", rarity: "common", maxStack: 99_999_999, description: "Кнопки, выбитые на «Колесе удачи». За них открываются коробки с наколками в сумке колеса.", sources: ["Колесо удачи"] },
];

/** Boss passes (ids key-<boss>): the key to the next boss, or for the last five bosses a pass card (passLook). */
const KEYS: ItemDef[] = BOSSES.filter((b) => !b.final).map((b) => {
  const t = CARD_TIERS[b.card ?? "bronze"];
  const look = passLook(b.id);
  const key = look.kind === "key";
  const next = BOSSES.find((x) => x.order === b.order + 1);
  const need = next?.keysToUnlock ?? 3;
  const one = key ? "Один ключ — вход" : "Один пропуск — вход";
  const many = key ? `${need} ключа — вход` : `${need} пропуска — вход`;
  return {
    id: keyId(b.id), name: key ? `Ключ: ${next?.name ?? b.name}` : `${CARD_TIERS[look.tier].name}: ${next?.name ?? b.name}`, category: "reward" as const, rarity: t.rarity, maxStack: 999,
    description: `Выдаётся за победу над боссом ${b.name}. ${need === 1 ? one : many} в бой с боссом ${next?.name ?? ""}: тратятся на старте боя, а если босс ушёл или ты сбежал — возвращаются.`.trim(),
    sources: [`Победа: ${b.name}`],
  };
});
/** Trophies stand in the room by themselves and give a bonus (TROPHIES in content/home.ts). */
const STATUE: ItemDef = {
  id: "statue-close", name: "Статуэтка CLOSE", category: "reward", rarity: "legendary", maxStack: 1,
  description: "Награда за Утилизатора. Сама встаёт на стол в комнате: +3% к урону всего оружия.", sources: ["Победа: Утилизатор"],
};
const TROPHY: ItemDef = {
  id: "trophy-sun", name: "Осколок Солнца", category: "reward", rarity: "mythic", maxStack: 999,
  description: "Доказательство, что ты дошёл до конца.", sources: ["Победа: Солнце"],
};

/** Нычки (content/stashes.ts): one of each, a set of four per location */
const STASH_RARITY: Rarity[] = ["rare", "epic", "legendary", "mythic", "mythic"];
const STASHES: ItemDef[] = STASH_SETS.flatMap((s) =>
  s.items.map((it) => ({
    id: it.id, name: it.name, category: "stash" as const, rarity: STASH_RARITY[Math.min(stashLevel(s), STASH_RARITY.length) - 1] ?? "rare", maxStack: 999,
    description: `${it.description} Набор «${s.name}».`, sources: [`Локация «${STASH_LOCATION_NAMES[s.location]}»: задания и закрытие локации`],
  })),
);
/** Наколки (content/tattoos.ts): one of each, inked on in the hero editor */
const TATTOOS: ItemDef[] = TATTOO_SETS.flatMap((s) =>
  s.pieces.map((p) => ({
    id: p.id, name: `Наколка: ${p.name}`, category: "tattoo" as const, rarity: "epic" as const, maxStack: 1,
    description: `Из сета «${s.name}». Набивается бесплатно в редакторе персонажа → «Наколки». Весь сет: +${s.bonus.damage} к урону «${WEAPONS.find((w) => w.id === s.bonus.weapon)?.name ?? s.bonus.weapon}».`,
    sources: [s.boss === "box" ? "Ящик ништяков: шанс 20% за открытие" : s.boss === "tosya" ? "Тося: одна наколка в каждом пирожке" : `${bossById(s.boss)?.name ?? s.boss}: по одной наколке за победу в «${TATTOO_MODE_NAME[s.mode]}»`],
  })),
);
/** «Крафт» (content/craft.ts): детали и собранные вещи — лежат на складе, бонус дают из заныка */
const CRAFT: ItemDef[] = CRAFT_ALL.map((c) => ({
  id: c.id, name: c.name, category: "craft" as const, rarity: c.rarity, maxStack: 99999, description: c.description,
  sources: [c.level ? "Собирается в «Крафте»" : "Скоро: откуда падают детали — решаем"],
  // вещь 3 ур. — оружие: бьёт боссов, как кулак, со своей перезарядкой
  ...(c.weapon ? { weapon: { ...c.weapon, kind: "permanent" as const } } : {}),
}));
export const ITEMS: ItemDef[] = [...WEAPONS, ...WEARABLES, ...MISC, ...KEYS, TROPHY, STATUE, ...STASHES, ...TATTOOS, ...CRAFT];
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemById = (id: string) => BY_ID.get(id);
export const weaponById = (id: string) => {
  const i = BY_ID.get(id);
  return i?.weapon ? (i as ItemDef & { weapon: WeaponStats }) : undefined;
};

/** Starting outfit: a new player starts with nothing on (clothes come from the shop and from bosses). */
export const STARTER_OUTFIT: Partial<Record<Slot, string>> = {};
export const RARITY_NAME: Record<Rarity, string> = { common: "Обычный", rare: "Редкий", epic: "Эпический", legendary: "Легендарный", mythic: "Мифический" };
export const CATEGORY_NAME: Record<Category, string> = { weapon: "Оружие", clothing: "Одежда", item: "Предметы", reward: "Награды", stash: "Нычки", event: "Ивентовые", tattoo: "Татуировки", craft: "Крафт" };

/** The yard finds the dealer buys for RUB (about half of the shop price). Overridable via config "sell".
 * Weapons (a keyboard from the yard) are not bought here — only an upgraded ★ one, in «Скупка» or the upgrader. */
export const SELL_PRICES: Record<string, number> = {
  "bottle-cap": 15,
  "flyer-passive": 25,
  "sticker-hodl": 40,
  "spinner": 60,
  "energy-drink": 90,
  "lost-wallet": 150,
  // «Крафт»: the dealer buys the parts too (content/craft-drops.ts PART_SELL)
  ...Object.fromEntries(CRAFT_PARTS.map((p) => [p.id, PART_SELL[p.rarity] ?? 50])),
};
for (const [id, price] of Object.entries(SELL_PRICES)) {
  const it = ITEMS.find((i) => i.id === id);
  if (it) it.sell = price;
}
