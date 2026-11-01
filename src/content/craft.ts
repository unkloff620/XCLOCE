/*
 * «Крафт» (screens/craft.tsx, server/systems/craft.ts): детали собираются в вещи, вещи — в вещи посильнее.
 * Детали и собранные вещи кладутся в ЗАНЫК — 12 ячеек; бонус даёт только то, что лежит в занык (по штуке на ячейку).
 * Уровни: детали → вещь 1 ур. (5 разных деталей × 5) → вещь 2 ур. (3× вещь 1 ур. + 4 других) → вещь 3 ур. (полноценный
 * предмет, берётся в руку). Сейчас в игре детали и вещи 1 ур.; откуда падают детали — решаем дальше (план в памяти).
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
}

/** cells in the stash */
export const CRAFT_BOXES = 12;

const part = (id: string, name: string, rarity: Rarity, bonus: CraftBonus, description: string): CraftDef =>
  ({ id: `part-${id}`, name, level: 0, rarity, bonus, power: rarity === "common" ? 1 : rarity === "rare" ? 2 : 4, description });

export const CRAFT_PARTS: CraftDef[] = [
  // обычные
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
  // редкие
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
  // очень редкие
  part("motor", "Электромотор", "epic", { energy: 4 }, "Сердце любой самоделки."),
  part("solder", "Паяльник", "epic", { dmg: { gpu: 4 } }, "Горячий. Главный инструмент умельца."),
  part("sulfur", "Сера", "epic", { dmg: { "rug-pull-gun": 5 } }, "Пахнет преисподней и химией."),
  part("saltpeter", "Селитра", "epic", { dmg: { "rug-pull-gun": 5 } }, "Белая, рассыпчатая, опасная."),
];

const item1 = (id: string, name: string, parts: string[], bonus: CraftBonus, description: string): CraftDef =>
  ({ id: `craft-${id}`, name, level: 1, rarity: "rare", bonus, power: 25, description, recipe: parts.map((p) => ({ id: `part-${p}`, qty: 5 })) });

export const CRAFT_ITEMS: CraftDef[] = [
  item1("flamethrower", "Огнемёт", ["metal", "gasoline", "tape", "pipe", "lighter"], { dmg: { gpu: 15 } }, "Труба, бензин и изолента. Что может пойти не так?"),
  item1("nail-bat", "Палка с гвоздями", ["board", "nails", "scotch", "rope", "sandpaper"], { dmg: { fist: 8 }, biceps: 50 }, "Классика дворовой дипломатии."),
  item1("molotov", "Коктейль", ["bottle", "gasoline", "rag", "fuse", "matches"], { dmg: { "red-candle": 10 } }, "Не для питья. Для красных свечей."),
  item1("fan", "Вентилятор", ["battery", "motor", "button", "plastic", "solder"], { energy: 5 }, "Обдувает, бодрит, шумит."),
  item1("knuckles", "Кастет", ["metal", "bolt", "nut", "blade", "chain"], { dmg: { fist: 6 }, biceps: 80 }, "Кулак, но с аргументами."),
  item1("samopal", "Самопал", ["pipe", "sulfur", "saltpeter", "foil", "string"], { dmg: { keyboard: 10 } }, "Стреляет криво, но громко."),
  item1("keychain", "Брелок", ["chain", "thread", "stone", "screw", "screwdriver"], { clock: 5 }, "На удачу. +5 минут к бою с боссом."),
];

export const CRAFT_ALL: CraftDef[] = [...CRAFT_PARTS, ...CRAFT_ITEMS];
export const craftById = (id: string) => CRAFT_ALL.find((c) => c.id === id);
export const CRAFT_LEVEL_NAME = ["Деталь", "Вещь 1 ур.", "Вещь 2 ур.", "Вещь 3 ур."];

/** what the stash gives in all: the sum of every thing in it (null cells skipped) */
export function craftBonusOf(boxes: (string | null)[]): { energy: number; biceps: number; clock: number; dmg: Record<string, number>; power: number } {
  const out = { energy: 0, biceps: 0, clock: 0, dmg: {} as Record<string, number>, power: 0 };
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
