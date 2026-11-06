/*
 * «Крафт» (screens/craft.tsx, server/systems/craft.ts): детали собираются в вещи, вещи — в вещи посильнее.
 * Детали и собранные вещи кладутся в ЗАНЫК — 12 ячеек; бонус даёт только то, что лежит в занык (по штуке на ячейку).
 * Уровни: 85 деталей → 24 вещи 1 ур. (5 разных деталей × 5) → 6 вещей 2 ур. (3× вещь 1 ур. + 4 других) → 3 вещи 3 ур.
 * (оружие: новые удары по боссам). В одном рецепте ингредиенты не повторяются; между рецептами — могут.
 * Ячейки становятся доступны по талантам (CRAFT_BOX_TALENTS) и покупаются за рубли по порядку (CRAFT_BOX_PRICES); полный левый блок — +15 к энергии, полный правый — +100 к бицухе.
 * Откуда падают детали — решаем дальше.
 * «Крутизна» — очки за всё, что лежит в заныке.
 */
import type { Rarity } from "./items.ts";

/** what a thing in the stash gives: the energy limit, biceps, minutes to a boss fight, damage to a weapon */
export interface CraftBonus { energy?: number; biceps?: number; clock?: number; dmg?: Partial<Record<string, number>> }
export interface CraftDef {
  id: string;
  name: string;
  /** 0 — деталь; 1–3 — собранная вещь */
  level: 0 | 1 | 2 | 3;
  rarity: Rarity;
  description: string;
  bonus: CraftBonus;
  /** крутизна: очки в заныке */
  power: number;
  /** what it is made of (собранные вещи) */
  recipe?: { id: string; qty: number }[];
  /** вещь 3 ур.: оружие (permanent, its own reload) */
  weapon?: { damage: number; cooldownMin: number; animation: "fist" | "mouse" | "candle" | "keyboard" | "gpu" | "rugpull"; action: string };
}

/** cells in the stash */
export const CRAFT_BOXES = 12;
/** a cell opens when the player has earned this many talents (cell 0 — the first; the cells go down the columns:
 * the left block 0–5 — top/bottom of column 1, then 2, then 3 — then the right block 6–11) */
export const CRAFT_BOX_TALENTS = [1, 5, 10, 20, 30, 45, 60, 75, 90, 110, 130, 150];
export const craftBoxesOpen = (talents: number) => CRAFT_BOX_TALENTS.filter((t) => talents >= t).length;
/** …and then is bought for roubles, in order: the first — 1 000 ₽, the last — 30 000 ₽ */
export const CRAFT_BOX_PRICES = [1_000, 1_500, 2_000, 3_000, 4_000, 5_500, 7_500, 10_000, 13_000, 17_000, 23_000, 30_000];
/** all six cells of a block full: a bonus on top (the left block — energy, the right one — biceps) */
export const CRAFT_BLOCK_BONUS: CraftBonus[] = [{ energy: 15 }, { biceps: 100 }];

const part = (id: string, name: string, rarity: Rarity, bonus: CraftBonus, description: string): CraftDef =>
  ({ id: `part-${id}`, name, level: 0, rarity, bonus, power: rarity === "common" ? 1 : rarity === "rare" ? 2 : 4, description });

export const CRAFT_PARTS: CraftDef[] = [
  // обычные (35)
  part("nails", "Гвозди", "common", { dmg: { fist: 1 } }, "Ржавые, гнутые, но ещё злые."),
  part("screw", "Шуруп", "common", { biceps: 5 }, "Крутится туже, чем ты."),
  part("nut", "Гайка", "common", { dmg: { fist: 1 } }, "Без болта — просто гайка. С болтом — сила."),
  part("bolt", "Болт", "common", { biceps: 5 }, "На него можно положить. Многие так и делают."),
  part("thread", "Нитка", "common", { energy: 1 }, "Тонкая, как надежда на памп."),
  part("rag", "Тряпка", "common", { energy: 1 }, "Вытирала всё: от стола до репутации."),
  part("matches", "Спички", "common", { dmg: { "red-candle": 1 } }, "Детям не игрушка. Тебе — деталь."),
  part("rope", "Верёвка", "common", { biceps: 5 }, "Крепкая. Проверено на ликвидациях."),
  part("scotch", "Скотч", "common", { dmg: { mouse: 1 } }, "Держит всё, кроме курса."),
  part("tape", "Изолента", "common", { dmg: { mouse: 1 } }, "Синяя. Чинит что угодно, даже душу."),
  part("board", "Доска", "common", { biceps: 5 }, "Обычная доска. Почти как дно рынка."),
  part("bottle", "Бутылка", "common", { energy: 1 }, "Пустая. Содержимое ушло на мотивацию."),
  part("plastic", "Пластик", "common", { dmg: { mouse: 1 } }, "Кусок чего-то, что раньше было важным."),
  part("spring", "Пружина", "common", { dmg: { mouse: 1 } }, "Сжимается, как депозит на просадке."),
  part("wire", "Проволока", "common", { biceps: 5 }, "Гнётся, но не ломается. Как холдер."),
  part("clip", "Скрепка", "common", { energy: 1 }, "Скрепляет бумаги и сделки."),
  part("glue", "Клей", "common", { dmg: { fist: 1 } }, "Склеит всё, кроме разбитого портфеля."),
  part("sock", "Носок", "common", { energy: 1 }, "Без пары. Пару забрал ликвидатор."),
  part("can", "Жестянка", "common", { biceps: 5 }, "Банка из-под энергетика. Пустая, как обещания."),
  part("cork", "Пробка", "common", { dmg: { "red-candle": 1 } }, "Выстрелила один раз. Больше не будет."),
  part("sponge", "Губка", "common", { energy: 1 }, "Впитывает всё. Даже FUD."),
  part("rubber-band", "Резинка", "common", { dmg: { mouse: 1 } }, "Тянется. Щёлкает больно."),
  part("cardboard", "Картон", "common", { biceps: 5 }, "Из коробки от видеокарты. Видеокарту продали."),
  part("stub", "Огарок", "common", { dmg: { "red-candle": 1 } }, "Остаток красной свечи. Помнит обвал."),
  part("pencil", "Карандаш", "common", { energy: 1 }, "Чертить схемы и считать убытки."),
  part("chalk", "Мел", "common", { dmg: { fist: 1 } }, "Рисует линии поддержки на асфальте."),
  part("staples", "Скобы", "common", { biceps: 5 }, "Для степлера, которого нет."),
  part("bag", "Пакет", "common", { energy: 1 }, "Пакет с пакетами. Классика."),
  part("hose", "Шланг", "common", { dmg: { "red-candle": 1 } }, "Поливает всё вокруг."),
  part("zipper", "Молния", "common", { dmg: { mouse: 1 } }, "От старой куртки. Заедает."),
  part("needle", "Игла", "common", { dmg: { fist: 1 } }, "Острая. Аккуратнее с пузырями."),
  part("cup", "Стаканчик", "common", { energy: 1 }, "Из-под кофе. На донышке ещё бодрость."),
  part("washer", "Шайба", "common", { biceps: 5 }, "Подкладывается под всё. Скромная."),
  part("clothespin", "Прищепка", "common", { dmg: { mouse: 1 } }, "Держит крепко. Проверено на носу."),
  part("straw", "Трубочка", "common", { energy: 1 }, "Чтобы тянуть энергетик до последней капли."),
  // редкие (35)
  part("battery", "Батарейка", "rare", { energy: 2 }, "Заряд на один хороший рывок."),
  part("gasoline", "Бензин", "rare", { dmg: { gpu: 2 } }, "Пахнет скоростью и плохими решениями."),
  part("lighter", "Зажигалка", "rare", { dmg: { "red-candle": 2 } }, "Поджигает и сигареты, и свечи."),
  part("blade", "Лезвие", "rare", { dmg: { fist: 2 } }, "Острое, как комментарии в чате."),
  part("chain", "Цепь", "rare", { biceps: 10 }, "Не золотая, но тяжёлая."),
  part("sandpaper", "Наждачка", "rare", { dmg: { keyboard: 2 } }, "Шлифует всё, даже характер."),
  part("button", "Кнопка", "rare", { dmg: { keyboard: 2 } }, "Красная. Нажимать нельзя. Нажмёшь."),
  part("string", "Струна", "rare", { dmg: { mouse: 2 } }, "Звенит, когда её тянут. Как нервы."),
  part("foil", "Фольга", "rare", { energy: 2 }, "Защищает от сигналов. Говорят."),
  part("metal", "Металл", "rare", { biceps: 10 }, "Кусок железа. Основа основ."),
  part("pipe", "Труба", "rare", { dmg: { gpu: 2 } }, "Кому-то — водопровод, тебе — ствол."),
  part("stone", "Камень", "rare", { biceps: 10 }, "Тяжёлый аргумент в любом споре."),
  part("screwdriver", "Отвёртка", "rare", { dmg: { keyboard: 2 } }, "Откручивает всё, что плохо лежит."),
  part("fuse", "Фитиль", "rare", { dmg: { "red-candle": 2 } }, "Горит медленно. До поры."),
  part("magnet", "Магнит", "rare", { energy: 2 }, "Притягивает железо и неприятности."),
  part("paint", "Краска", "rare", { biceps: 10 }, "Баллончик. Подпиши гараж."),
  part("hammer", "Молоток", "rare", { dmg: { fist: 2 } }, "Всё — гвоздь, если у тебя молоток."),
  part("pliers", "Плоскогубцы", "rare", { dmg: { keyboard: 2 } }, "Хватают крепче, чем маржин-колл."),
  part("wrench", "Гаечный ключ", "rare", { biceps: 10 }, "На 17. Всегда нужен на 17."),
  part("hacksaw", "Ножовка", "rare", { dmg: { fist: 2 } }, "Пилит медленно, но верно."),
  part("file", "Напильник", "rare", { dmg: { mouse: 2 } }, "Доводит до ума. И до ручки."),
  part("bulb", "Лампочка", "rare", { energy: 2 }, "Идея пришла — лампочка загорелась."),
  part("cable", "Кабель", "rare", { dmg: { gpu: 2 } }, "Питание от майнинг-фермы."),
  part("gear", "Шестерёнка", "rare", { dmg: { keyboard: 2 } }, "Крутится в системе. Как ты."),
  part("bearing", "Подшипник", "rare", { energy: 2 }, "Катится по жизни без трения."),
  part("glass", "Стекло", "rare", { dmg: { "red-candle": 2 } }, "Осколок витрины. Не спрашивай."),
  part("mirror", "Зеркальце", "rare", { energy: 2 }, "Посмотри на холдера. Красавчик."),
  part("lens", "Линза", "rare", { dmg: { "rug-pull-gun": 3 } }, "Фокусирует лучи и внимание."),
  part("wheel", "Колёсико", "rare", { energy: 2 }, "От тележки из супермаркета."),
  part("speaker", "Динамик", "rare", { dmg: { keyboard: 2 } }, "Орёт басами на весь двор."),
  part("copper", "Медь", "rare", { dmg: { gpu: 2 } }, "Проводит ток и деньги."),
  part("tire", "Кусок шины", "rare", { biceps: 10 }, "Жёсткая резина. Пахнет гаражом."),
  part("clamp", "Струбцина", "rare", { biceps: 10 }, "Зажимает намертво."),
  part("drill", "Сверло", "rare", { dmg: { "rug-pull-gun": 3 } }, "Сверлит дно. Глубже, ещё глубже."),
  part("funnel", "Воронка", "rare", { dmg: { "red-candle": 2 } }, "Всё стекает в одну точку. Как ликвидность."),
  // очень редкие (15)
  part("motor", "Электромотор", "epic", { energy: 4 }, "Сердце любой самоделки."),
  part("solder", "Паяльник", "epic", { dmg: { gpu: 4 } }, "Горячий. Главный инструмент умельца."),
  part("sulfur", "Сера", "epic", { dmg: { "rug-pull-gun": 5 } }, "Пахнет преисподней и химией."),
  part("saltpeter", "Селитра", "epic", { dmg: { "rug-pull-gun": 5 } }, "Белая, рассыпчатая, опасная."),
  part("chip", "Микросхема", "epic", { dmg: { keyboard: 4 } }, "Мозг из старого роутера."),
  part("cooler", "Кулер от видюхи", "epic", { dmg: { gpu: 4 } }, "Охлаждает и майнеров, и эмоции."),
  part("tesla", "Катушка Теслы", "epic", { dmg: { keyboard: 4 } }, "Искрит. Не трогай голыми руками."),
  part("quartz", "Кварц", "epic", { clock: 1 }, "Кристалл, который держит время."),
  part("accu", "Аккумулятор", "epic", { energy: 4 }, "Заряжен под завязку."),
  part("pump", "Насос", "epic", { dmg: { "red-candle": 4 } }, "Качает. Как памп на хаях."),
  part("laser", "Лазерная указка", "epic", { dmg: { "rug-pull-gun": 5 } }, "Красная точка. Котики в восторге."),
  part("gyro", "Гироскоп", "epic", { energy: 4 }, "Держит равновесие на любом рынке."),
  part("titanium", "Титан", "epic", { biceps: 25 }, "Лёгкий и прочный. Как твои нервы."),
  part("neodym", "Неодимовый магнит", "epic", { dmg: { gpu: 4 } }, "Тянет так, что не оторвать."),
  part("carbon", "Карбон", "epic", { biceps: 25 }, "Чёрное волокно. Для серьёзных самоделок."),
];

const item1 = (id: string, name: string, parts: string[], bonus: CraftBonus, description: string): CraftDef =>
  ({ id: `craft-${id}`, name, level: 1, rarity: "rare", bonus, power: 25, description, recipe: parts.map((p) => ({ id: `part-${p}`, qty: 5 })) });

/** вещи 1 уровня (24): 5 разных деталей × 5 */
export const CRAFT_ITEMS: CraftDef[] = [
  item1("flamethrower", "Огнемёт", ["metal", "gasoline", "tape", "pipe", "lighter"], { dmg: { gpu: 15 } }, "Труба, бензин и изолента. Что может пойти не так?"),
  item1("nail-bat", "Палка с гвоздями", ["board", "nails", "scotch", "rope", "sandpaper"], { dmg: { fist: 3 }, biceps: 50 }, "Классика дворовой дипломатии."),
  item1("molotov", "Коктейль", ["bottle", "gasoline", "rag", "fuse", "matches"], { dmg: { "red-candle": 10 } }, "Не для питья. Для красных свечей."),
  item1("fan", "Вентилятор", ["battery", "motor", "button", "plastic", "solder"], { energy: 5 }, "Обдувает, бодрит, шумит."),
  item1("knuckles", "Кастет", ["metal", "bolt", "nut", "blade", "chain"], { dmg: { fist: 3 }, biceps: 80 }, "Кулак, но с аргументами."),
  item1("samopal", "Самопал", ["pipe", "sulfur", "saltpeter", "foil", "string"], { dmg: { keyboard: 10 } }, "Стреляет криво, но громко."),
  item1("keychain", "Брелок", ["chain", "thread", "stone", "screw", "screwdriver"], { clock: 5 }, "На удачу. +5 минут к бою с боссом."),
  item1("scooter", "Самокат-самоделка", ["wheel", "board", "bolt", "spring", "bag"], { energy: 5 }, "Едет. Иногда даже вперёд."),
  item1("flashlight", "Фонарик", ["bulb", "battery", "wire", "can", "button"], { energy: 4, clock: 2 }, "Светит в самые тёмные графики."),
  item1("radio", "Радиоприёмник", ["speaker", "cable", "chip", "pliers", "solder"], { clock: 5 }, "Ловит только новости о дампах."),
  item1("slingshot", "Рогатка", ["rubber-band", "board", "stone", "rope", "clothespin"], { dmg: { mouse: 10 } }, "Дворовое ПВО."),
  item1("trap", "Капкан", ["spring", "chain", "metal", "clamp", "hammer"], { dmg: { fist: 2 }, biceps: 40 }, "Для медведей. Рыночных."),
  item1("boombox", "Бумбокс", ["speaker", "accu", "cardboard", "funnel", "gear"], { energy: 6 }, "Качает весь двор."),
  item1("drone", "Дрон", ["motor", "cooler", "chip", "plastic", "gyro"], { dmg: { gpu: 12 } }, "Летает над боссом и бесит его."),
  item1("miner", "Майнер на коленке", ["chip", "cooler", "cable", "copper", "glue"], { dmg: { gpu: 10 }, energy: 3 }, "Майнит три сатоши в год. Зато свои."),
  item1("whip", "Кнут из провода", ["cable", "rubber-band", "zipper", "wire", "staples"], { dmg: { mouse: 12 } }, "Щёлкает по нервам."),
  item1("torch", "Факел", ["stub", "sock", "board", "matches", "glue"], { dmg: { "red-candle": 8 } }, "Освещает путь и поджигает свечи."),
  item1("helmet", "Каска", ["can", "sponge", "tire", "clip", "paint"], { biceps: 70 }, "Защищает голову от плохих решений."),
  item1("shield", "Щит из знака", ["metal", "paint", "bolt", "washer", "clamp"], { biceps: 60, energy: 2 }, "Знак «Стоп». Остановит кого угодно."),
  item1("taser", "Шокер", ["accu", "wire", "button", "plastic", "tesla"], { dmg: { keyboard: 12 } }, "Бодрит лучше энергетика."),
  item1("laser-gun", "Лазер", ["laser", "lens", "battery", "mirror", "pipe"], { dmg: { "rug-pull-gun": 12 } }, "Красный луч прямо в график."),
  item1("hook", "Кошка на верёвке", ["rope", "metal", "file", "wrench", "drill"], { biceps: 50, dmg: { fist: 2 } }, "Цепляется за любую соломинку."),
  item1("water-gun", "Водомёт", ["pump", "hose", "straw", "cork", "cup"], { dmg: { "red-candle": 10 } }, "Тушит свечи. Красные."),
  item1("compass", "Компас удачи", ["magnet", "needle", "chalk", "glass", "pencil"], { clock: 6 }, "Всегда показывает на луну."),
];

/** вещи 2 уровня (6): 3× главная вещь 1 ур. + ещё четыре ингредиента */
const item2 = (id: string, name: string, recipe: [string, number][], bonus: CraftBonus, description: string): CraftDef =>
  ({ id: `craft2-${id}`, name, level: 2, rarity: "epic", bonus, power: 150, description, recipe: recipe.map(([rid, qty]) => ({ id: rid, qty })) });
export const CRAFT_ITEMS_2: CraftDef[] = [
  item2("fuel-crossbow", "Арбалет на топливе", [["craft-flamethrower", 3], ["craft-slingshot", 1], ["craft-trap", 1], ["part-titanium", 10], ["part-gear", 10]], { dmg: { gpu: 60 } }, "Стреляет огненными болтами. Наверное."),
  item2("chainsaw", "Бензопила «Ликвидация»", [["craft-nail-bat", 3], ["craft-knuckles", 1], ["craft-scooter", 1], ["part-motor", 10], ["part-hacksaw", 10]], { dmg: { fist: 10 }, biceps: 300 }, "Пилит позиции под ноль."),
  item2("exoskeleton", "Экзоскелет из мусора", [["craft-helmet", 3], ["craft-shield", 1], ["craft-hook", 1], ["part-gyro", 10], ["part-bearing", 10]], { biceps: 500, energy: 10 }, "Скрипит, но держит."),
  item2("tesla-glove", "Перчатка Теслы", [["craft-taser", 3], ["craft-flashlight", 1], ["craft-whip", 1], ["part-tesla", 10], ["part-copper", 10]], { dmg: { keyboard: 60 } }, "Каждый щелчок — молния."),
  item2("mining-rig", "Ферма в гараже", [["craft-miner", 3], ["craft-drone", 1], ["craft-radio", 1], ["part-chip", 10], ["part-cable", 10]], { dmg: { gpu: 50 }, energy: 10 }, "Шумит, греется и иногда майнит."),
  item2("fire-show", "Огненное шоу", [["craft-molotov", 3], ["craft-torch", 1], ["craft-water-gun", 1], ["part-sulfur", 10], ["part-pump", 10]], { dmg: { "red-candle": 50 } }, "Свечи горят красиво. Красные."),
];

/** вещи 3 уровня (3): оружие — новые удары по боссам (permanent, со своей перезарядкой); в заныке тоже дают бонус */
const item3 = (id: string, name: string, recipe: [string, number][], bonus: CraftBonus, description: string, weapon: CraftDef["weapon"]): CraftDef =>
  ({ id: `craft3-${id}`, name, level: 3, rarity: "legendary", bonus, power: 1000, description, weapon, recipe: recipe.map(([rid, qty]) => ({ id: rid, qty })) });
export const CRAFT_ITEMS_3: CraftDef[] = [
  item3("railgun", "Рельсотрон из майнинг-фермы", [["craft2-mining-rig", 3], ["craft2-tesla-glove", 1], ["craft-laser-gun", 3], ["part-neodym", 20], ["part-quartz", 20]], { dmg: { gpu: 150 } },
    "Разгоняет видеокарты до скорости света и швыряет в босса.", { damage: 1200, cooldownMin: 360, animation: "gpu", action: "Выстрелить из рельсотрона" }),
  item3("bear-market", "Огнемёт «Медвежий рынок»", [["craft2-fuel-crossbow", 3], ["craft2-fire-show", 1], ["craft-samopal", 3], ["part-carbon", 20], ["part-pump", 20]], { dmg: { "rug-pull-gun": 150 } },
    "Выжигает всё зелёное. Остаются только красные свечи.", { damage: 2000, cooldownMin: 480, animation: "rugpull", action: "Залить босса огнём" }),
  item3("mech-fist", "Кулак экзоскелета", [["craft2-exoskeleton", 3], ["craft2-chainsaw", 1], ["craft-knuckles", 3], ["part-titanium", 20], ["part-gyro", 20]], { dmg: { fist: 15 }, biceps: 1000 },
    "Гидравлика, титан и злость. Один удар — и босс в нокауте.", { damage: 3000, cooldownMin: 720, animation: "fist", action: "Врезать кулаком экзоскелета" }),
];

export const CRAFT_ALL: CraftDef[] = [...CRAFT_PARTS, ...CRAFT_ITEMS, ...CRAFT_ITEMS_2, ...CRAFT_ITEMS_3];
/** the level-3 things are weapons: new hits in the boss fight (shown in the tray when you have one) */
export const CRAFT_WEAPONS = CRAFT_ITEMS_3;
export const craftById = (id: string) => CRAFT_ALL.find((c) => c.id === id);
export const CRAFT_LEVEL_NAME = ["Деталь", "Вещь 1 ур.", "Вещь 2 ур.", "Вещь 3 ур."];

/** what the stash gives in all: the sum of every thing in it (null cells skipped) */
export function craftBonusOf(boxes: (string | null)[]): { energy: number; biceps: number; clock: number; dmg: Record<string, number>; power: number } {
  const out = { energy: 0, biceps: 0, clock: 0, dmg: {} as Record<string, number>, power: 0 };
  const blocks = [0, 1].filter((b) => boxes.slice(b * 6, b * 6 + 6).filter(Boolean).length === 6).map((b) => CRAFT_BLOCK_BONUS[b]);
  for (const b of blocks) { out.energy += b.energy ?? 0; out.biceps += b.biceps ?? 0; }
  for (const id of boxes) {
    const d = id ? craftById(id) : null;
    if (!d) continue;
    out.energy += d.bonus.energy ?? 0;
    out.biceps += d.bonus.biceps ?? 0;
    out.clock += d.bonus.clock ?? 0;
    for (const [w, v] of Object.entries(d.bonus.dmg ?? {})) out.dmg[w] = (out.dmg[w] ?? 0) + (v ?? 0);
    out.power += d.power;
  }
  return out;
}
