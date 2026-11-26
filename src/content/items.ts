import { STASH_LOCATION_NAMES, STASH_SETS, stashLevel } from "./stashes.ts";
import { BOSSES, EVENT_FIGHTS, CARD_TIERS, MODE_SHORT, bossById, isFirstWinItem, keyId, nextInClass, passLook, thingsFrom, thingsModeName, unlockBossOf } from "./bosses.ts";
import { TATTOO_SETS, setBonusText } from "./tattoos.ts";
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
  animation: "fist" | "mouse" | "candle" | "keyboard" | "gpu" | "rugpull" | "flame" | "bat";
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
  /** energy: +N on top; energyFull: up to the player's limit (nothing above it) */
  use?: { energy?: number; energyFull?: boolean };
  /** wearable that hides other slots (a hoodie hides the shirt underneath) */
  hides?: Slot[];
  /** sale price in RUB from the inventory (things found in the yard) */
  sell?: number;
}

/** a free weapon still reloading can hit at once for this (the player agrees in a window first); then it reloads again */
/** «Ударить сейчас» for the three free weapons (fist, mouse, candle): 3 roubles */
export const RUSH_PRICE = { currency: "RUB" as const, amount: 3 };
/** «ударить сейчас» for the craft weapons (вещи 3 ур.: рельсотрон, огнемёт, кулак экзоскелета) */
export const RUSH_PRICE_CRAFT = { currency: "TOKEN" as const, amount: 5 };
export const rushPrice = (id: string) => (id.startsWith("craft3-") ? RUSH_PRICE_CRAFT : RUSH_PRICE);

export const WEAPONS: ItemDef[] = [
  {
    id: "fist", name: "Кулак", category: "weapon", rarity: "common", maxStack: 1,
    description: "Базовое оружие. Всегда с тобой: после удара руке нужно 8 часов отдыха, но в каждом новом бою кулак снова готов.",
    sources: ["Есть у каждого с начала игры"],
    weapon: { damage: 20, kind: "permanent", cooldownMin: 480, animation: "fist", action: "Втащить кулаком" },
  },
  {
    id: "mouse", name: "Тычок в глаза", category: "weapon", rarity: "common", maxStack: 1,
    description: "Два пальца — и босс ничего не видит. Бесплатный: после тычка пальцы 8 часов отходят, а в новом бою снова наготове.",
    sources: ["Есть у каждого с начала игры"],
    weapon: { damage: 5, kind: "permanent", cooldownMin: 480, animation: "mouse", action: "Ткнуть в глаза" },
  },
  {
    id: "red-candle", name: "Пинок", category: "weapon", rarity: "common", maxStack: 1,
    description: "Берцем с разворота. Бесплатный: после пинка нога 8 часов отдыхает, а в новом бою снова готова.",
    sources: ["Есть у каждого с начала игры"],
    weapon: { damage: 12, kind: "permanent", cooldownMin: 480, animation: "candle", action: "Дать пинка" },
  },
  {
    id: "keyboard", name: "Нож", category: "weapon", rarity: "rare", maxStack: 99_999_999,
    description: "Ручка в изоленте, под лентой — заначка. Режет и врагов, и бюджет.",
    sources: ["Баул в магазине", "Покупка в бою", "Двор (редко)"],
    weapon: { damage: 30, kind: "consumable", animation: "keyboard", action: "Пырнуть ножом" },
  },
  {
    id: "gpu", name: "Ствол", category: "weapon", rarity: "epic", maxStack: 99_999_999,
    description: "Старый ствол в изоленте, у барабана — пачка купюр. Без лишних вопросов.",
    sources: ["Баул в магазине", "Покупка в бою"],
    weapon: { damage: 60, kind: "consumable", animation: "gpu", action: "Шмальнуть из ствола" },
  },
  {
    id: "rug-pull-gun", name: "Пушка", category: "weapon", rarity: "legendary", maxStack: 99_999_999,
    description: "Один выстрел — и под ногами босса исчезает ликвидность.",
    sources: ["Баул в магазине", "Покупка в бою"],
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
  { id: "mug-coin", name: "Кружка с монетой", slot: "HAND", rarity: "epic", description: "Горячий кофе с утра — и к графику. Герой болтает кружкой, а из неё идёт пар.", sources: ["Магазин"] },
  // the poker's straight flush prize: owned — fights with most bosses need no passes (content/bosses.ts KEY_RING); worn — the keys jingle in the hand
  { id: "keys-bundle", name: "Связка ключей", slot: "HAND", rarity: "legendary", description: "Подходит почти ко всем дверям: на боссов можно нападать без пропусков, они не тратятся. Кроме Вадима и Боцмана — к ним нужны пропуска. Герой держит связку и позвякивает ключами.", sources: ["Покер: стрит-флеш"] },
  { id: "hand-drum", name: "Нервные пальцы", slot: "HAND", rarity: "rare", description: "Пальцы сами отбивают ритм по колену, пока график грузится.", sources: ["Победа: Кедр"] },
  // Гаркуша's set: all in black (cut from the hero on tools/rig/source/wear); the jacket is worn open over the bare chest
  { id: "jacket-puffer", name: "Пуховик Гаркуши", slot: "SHIRT", rarity: "epic", description: "Чёрный, дутый, нараспашку — чтобы наколки было видно. Карманы под пачки.", sources: ["Победа: Гаркуша (Блатной)"] },
  { id: "pants-black", name: "Чёрные штаны Гаркуши", slot: "PANTS", rarity: "rare", description: "Плотные, прямые. В них удобно стоять у кассы.", sources: ["Победа: Гаркуша (Блатной)"] },
  { id: "sneakers-chunky", name: "Кроссовки Гаркуши", slot: "SHOES", rarity: "rare", description: "Чёрные, на толстой подошве. Шаг тяжёлый, как пачка пятитысячных.", sources: ["Победа: Гаркуша (Блатной)"] },
  // Мугонатор's set: the sea captain (cut from the hero on tools/rig/source/wear)
  { id: "tee-sailor", name: "Тельняшка Мугонатора", slot: "SHIRT", rarity: "rare", description: "Полоски — чтобы акула видела, кого не трогать. Край уже кто-то откусил.", sources: ["Победа: Мугонатор (Блатной)"] },
  { id: "jacket-sportik", name: "Олимпийка «Спортик»", slot: "SHIRT", rarity: "epic", description: "Чёрная, две полосы, нараспашку — чтобы наколки дышали. Сет «Спортик».", sources: ["Ящик ништяков"] },
  { id: "pants-sportik", name: "Треники «Спортик»", slot: "PANTS", rarity: "epic", description: "Чёрные треники с лампасами. На корточках сидят как влитые. Сет «Спортик».", sources: ["Ящик ништяков"] },
  { id: "sneakers-sportik", name: "Кроссы «Спортик»", slot: "SHOES", rarity: "epic", description: "Чёрные, с молнией на боку и белыми носками. Сет «Спортик».", sources: ["Ящик ништяков"] },
  { id: "tee-solntse", name: "Футболка Солнца", slot: "SHIRT", rarity: "legendary", description: "Чёрная, в лавовых трещинах, на груди горит солнце. Носится только теми, кто дошёл до конца Close.", sources: ["Победа: Солнце (Авторитетный)"] },
  { id: "pants-solntse", name: "Штаны Солнца", slot: "PANTS", rarity: "legendary", description: "Закопчённые рабочие штаны, по швам — солнечные лучи, по ткани тлеют трещины.", sources: ["Победа: Солнце (Авторитетный)"] },
  { id: "sneakers-solntse", name: "Кроссовки Солнца", slot: "SHOES", rarity: "legendary", description: "Подошва из живой лавы. После них на асфальте остаются следы.", sources: ["Победа: Солнце (Авторитетный)"] },
  { id: "apron-utilizator", name: "Фартук Утилизатора", slot: "SHIRT", rarity: "legendary", description: "Чёрная кожа, жёлтый знак и надпись «Утилизатор кислоты». Кислота прожгла пару дырок — но до тела не дошла.", sources: ["Победа: Утилизатор (Авторитетный)"] },
  { id: "mask-gas-utilizator", name: "Противогаз Утилизатора", slot: "FACE", rarity: "legendary", description: "Тот самый, что висит у него на фартуке. Фильтры жёлтые, взгляд сквозь стекло — тяжёлый. Кислотные пары не страшны.", sources: ["Победа: Утилизатор (Авторитетный)"] },
  { id: "flask-himik", name: "Колба Химика", slot: "HAND", rarity: "legendary", description: "Круглая колба с розовой дрянью. Химик держит её за горлышко двумя пальцами — и ни разу не пролил. Герой покачивает её в руке, жидкость плещется.", sources: ["Победа: Химик (Блатной)"] },
  { id: "vials-utilizator", name: "Колбы Утилизатора", slot: "HAND", rarity: "legendary", description: "Три колбы с кислотой на кольце. Утилизатор крутит их на пальце, пока решает, кого растворить. Герой крутит кольцо, колбы болтаются.", sources: ["Победа: Утилизатор (Авторитетный)"] },
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
  { id: "raven", name: "Ворон", slot: "SPECIAL", rarity: "legendary", description: "Чёрный ворон сидит на правом плече: машет крыльями и косится по сторонам. Только за роял-флеш в покере.", sources: ["Покер: роял-флеш"] },
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
  return { ...w, category: "clothing" as const, maxStack: 1, sources: boss ? [isFirstWinItem(w.id) ? `Первая победа над ${boss.name} (${thingsModeName(boss)}), потом — магазин` : `${thingsFrom(boss)}, потом — магазин`, ...w.sources.filter((x) => !x.startsWith("Магазин") && !x.startsWith("Победа"))] : w.sources };
});

/** the only energy drink (the blue one): at most this many in the bag; «Пополнить» in the energy window fills them up for
 *  ENERGY_REFILL (the user 2026-11-22) — not sold anywhere else */
export const ENERGY_DRINKS_MAX = 20;
export const ENERGY_REFILL = { currency: "GOLD" as const, amount: 5 };
const MISC: ItemDef[] = [
  { id: "energy-drink", name: "Энергетик", category: "item", rarity: "common", maxStack: ENERGY_DRINKS_MAX, description: "Энергия сразу до полной (сверх лимита — нельзя).", sources: ["Двор"], use: { energyFull: true } },
  // the poker's prize (a pair of nothing — 100, three of a kind — 500): buys the poker's cases
  { id: "matches", name: "Спички", category: "item", rarity: "common", maxStack: 99_999_999, description: "Спички с чёрной головкой — награда за зонк. Скоро из них можно будет открывать ящик с наколками.", sources: ["Зонк"] },
  { id: "poker-sticker", name: "Стикер", category: "item", rarity: "common", maxStack: 99_999_999, description: "Липкий трофей покерного стола. За стикеры открываются чемоданы в покере.", sources: ["Покер"] },
  { id: "sticker-hodl", name: "Стикер HODL", category: "item", rarity: "common", maxStack: 999, description: "Клеится на ноутбук и на мораль.", sources: ["Двор"] },
  { id: "bottle-cap", name: "Крышка от энергетика", category: "item", rarity: "common", maxStack: 999, description: "Собери 1000 и… ничего не будет.", sources: ["Двор"] },
  { id: "spinner", name: "Спиннер из 2017", category: "item", rarity: "common", maxStack: 999, description: "Крутится. Это всё.", sources: ["Двор"] },
  { id: "flyer-passive", name: "Листовка «Пассивный доход»", category: "item", rarity: "common", maxStack: 999, description: "Звоните прямо сейчас!", sources: ["Двор"] },
  { id: "poker-chip", name: "Фишка", category: "item", rarity: "rare", maxStack: 999, description: "Одна бесплатная раздача в покере.", sources: ["Кейс у барыги", "Колесо удачи (чашки)", "Задания дня", "Серия входов", "Зонк", "Босс клана"] },
  // «Зарубы» (content/zarub.ts): the mode's currency and the nuggets that melt into it
  { id: "gold-ring", name: "Кольцо", category: "item", rarity: "epic", maxStack: 99_999_999, description: "Печатка. Валюта Заруб: за кольца открываются сумки с наколками.", sources: ["Зарубы"] },
  { id: "gold-nugget", name: "Самородок", category: "item", rarity: "rare", maxStack: 99_999_999, description: "15 самородков переплавляются в одно кольцо.", sources: ["Зарубы"] },
  { id: "lost-wallet", name: "Забытый кошелёк", category: "item", rarity: "rare", maxStack: 999, description: "Внутри немного долларов и чек из шаурмы.", sources: ["Двор"] },
  // «Колесо удачи» (content/fortune.ts): the ticket is one spin; the keycaps open the boxes of the bag
  { id: "fortune-ticket", name: "Билет колеса", category: "item", rarity: "rare", maxStack: 99_999, description: "Одна прокрутка «Колеса удачи» на заднем дворе. Каждая прокрутка растит общий джекпот.", sources: ["Ящик ништяков в магазине", "Колесо удачи: купить за 10 $", "Колесо удачи"] },
  // «Ходки» (content/raids.ts): a taken yard's flag, 1…5 stars — the bags of tattoo sets are opened for them
  // «Лагеря» (content/raids.ts): the armbands, one kind a camp — Меняла gives the pieces of tattoo sets for them
  ...[1, 2, 3, 4, 5].map((n) => ({ id: `raid-flag-${n}`, name: `Повязка «${["Тройка", "Копейка", "Красная однёрка", "Атлянка", "Белый медведь"][n - 1]}»`, category: "item" as const, rarity: (["common", "rare", "rare", "epic", "legendary"] as const)[n - 1], maxStack: [80, 165, 275, 390, 540][n - 1], description: "Повязка актива за захват зданий в лагерях. Меняла во дворе меняет повязки на наколки.", sources: ["Лагеря"] })),
  { id: "keycap", name: "Кнопка клавиатуры", category: "item", rarity: "common", maxStack: 99_999_999, description: "Кнопки, выбитые на «Колесе удачи». За них открываются коробки с наколками в сумке колеса.", sources: ["Колесо удачи"] },
];

/** Boss passes (ids key-<boss>): the key to the next boss, or for the last five bosses a pass card (passLook). */
const KEYS: ItemDef[] = [...BOSSES, ...EVENT_FIGHTS.filter((b) => b.mentor)].map((b) => {
  const t = CARD_TIERS[b.card ?? "bronze"];
  const look = passLook(b.id);
  const key = look.kind === "key";
  const next = nextInClass(b);
  const need = next?.keysToUnlock ?? 3;
  const one = key ? "Один ключ — вход" : "Один пропуск — вход";
  const many = key ? `${need} ключа — вход` : `${need} пропуска — вход`;
  // the last boss and the mentors: their passes open nothing yet — they pile up for the bosses still to come
  if (b.final || !next) return {
    id: keyId(b.id), name: `Пропуск: ${b.name}`, category: "reward" as const, rarity: b.final ? "legendary" as const : "common" as const, maxStack: 999,
    description: `Выдаётся за победу над ${b.final ? "боссом" : "ментором"} ${b.name}. Копится: откроет новых боссов, когда они придут.`,
    sources: [`Победа: ${b.name}`],
  };
  return {
    id: keyId(b.id), name: key ? `Ключ: ${next?.name ?? b.name}` : `${CARD_TIERS[look.tier].name}: ${next?.name ?? b.name}`, category: "reward" as const, rarity: t.rarity, maxStack: 999,
    description: `Выдаётся за победу над боссом ${b.name}. ${need === 1 ? one : many} в бой с боссом ${next?.name ?? ""}: тратятся на старте боя, а если босс ушёл или ты сбежал — возвращаются.`.trim(),
    sources: [`Победа: ${b.name}`],
  };
});
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
    description: `Из сета «${s.name}». Набивается бесплатно в редакторе персонажа → «Наколки». Весь сет: ${setBonusText(s, (id) => WEAPONS.find((w) => w.id === id)?.name)}.`,
    sources: [s.boss === "box" ? "Ящик ништяков: шанс 20% за открытие" : s.boss === "tosya" ? "Тося: одна наколка в каждом пирожке" : `Выпадает с ${bossById(s.boss)?.name ?? s.boss} (${MODE_SHORT[s.mode]}): по наколке за победу`],
  })),
);
/** «Крафт» (content/craft.ts): детали и собранные вещи — лежат на складе, бонус дают из заныка */
const CRAFT: ItemDef[] = CRAFT_ALL.map((c) => ({
  id: c.id, name: c.name, category: "craft" as const, rarity: c.rarity, maxStack: 99999, description: c.description,
  sources: [c.level ? "Собирается в «Крафте»" : "Скоро: откуда падают детали — решаем"],
  // вещь 3 ур. — оружие: бьёт боссов, как кулак, со своей перезарядкой
  ...(c.weapon ? { weapon: { ...c.weapon, kind: "permanent" as const } } : {}),
}));
/** «Бита»: a free weapon opened by the talent «Удар битой» (content/talents.ts «Новый удар»): the talent puts it in the
 *  inventory, a reset of the talents takes it away. Not one of the six main weapons (it is not in WEAPONS). */
export const BAT: ItemDef = {
  id: "bat", name: "Бита", category: "weapon", rarity: "rare", maxStack: 1,
  description: "Бейсбольная, но в бейсбол ей ни разу не играли. Бесплатная: после удара 8 часов отдыхает, в новом бою снова в руке.",
  sources: ["Таланты: «Удар битой»"],
  weapon: { damage: 30, kind: "permanent", cooldownMin: 480, animation: "bat", action: "Втащить битой" },
};
export const ITEMS: ItemDef[] = [...WEAPONS, BAT, ...WEARABLES, ...MISC, ...KEYS, TROPHY, ...STASHES, ...TATTOOS, ...CRAFT];
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
/** what a thing sells for at «Скупка»: craft parts and the yard's caps, spinners and flyers — only for папиросы (the user 2026-11-20), the rest for roubles */
const SELL_FOR_PAP = new Set(["bottle-cap", "spinner", "flyer-passive"]);
export const sellCurrency = (id: string): "PAP" | "RUB" => (id.startsWith("part-") || SELL_FOR_PAP.has(id) ? "PAP" : "RUB");
/** the yard finds taken out of the game: hidden at «Скупка» (old stock stays in the bag) */
export const RETIRED_FINDS = new Set(["bottle-cap", "flyer-passive", "sticker-hodl", "spinner", "lost-wallet"]);
export const SELL_PRICES: Record<string, number> = {
  // the yard finds (caps, flyers, stickers, spinners, wallets) are out of the game (the user 2026-11-23): not bought any more
  // «Крафт»: the dealer buys the parts too (content/craft-drops.ts PART_SELL)
  ...Object.fromEntries(CRAFT_PARTS.map((p) => [p.id, PART_SELL[p.rarity] ?? 50])),
};
for (const [id, price] of Object.entries(SELL_PRICES)) {
  const it = ITEMS.find((i) => i.id === id);
  if (it) it.sell = price;
}
