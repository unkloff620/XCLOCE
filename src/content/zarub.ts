import type { Reward } from "./rewards.ts";

/*
 * «Зарубы» (the user 2026-11-22): a race of up to ZARUB_SEATS players in one difficulty — 8 tasks of the game, the same
 * for everybody in the race; whoever closes all 8 first is first. Every finisher gets the difficulty's reward (зарубный
 * опыт, кольца, самородки), the first three — a bonus of кольца on top. A task can be bought out for слитки.
 * The race runs ZARUB_RACE_MS; whoever is not done by then gets nothing. The empty seats are taken by bots.
 * Кольца open the difficulty's bags: 3 bags × 3 tattoo sets (21 pieces each), a random piece not owned yet per opening.
 * 15 самородков melt into 1 кольцо. Зарубный уровень grows from the опыт; it opens «Блатные» (30) and «Авторитетные» (60).
 */

export type ZarubMode = "pacan" | "blat" | "avtor";
export interface ZarubModeDef {
  id: ZarubMode;
  name: string;
  /** the zarub level it opens at */
  level: number;
  /** a finisher's reward */
  xp: number;
  rings: number;
  nuggets: number;
  /** how much bigger the tasks are than the «Пацанские» ones */
  scale: number;
}
export const ZARUB_MODES: ZarubModeDef[] = [
  { id: "pacan", name: "Пацанские", level: 0, xp: 120, rings: 26, nuggets: 21, scale: 1 },
  { id: "blat", name: "Блатные", level: 30, xp: 180, rings: 60, nuggets: 26, scale: 2 },
  { id: "avtor", name: "Авторитетные", level: 60, xp: 240, rings: 99, nuggets: 31, scale: 3 },
];
export const zarubMode = (id: string | null | undefined) => ZARUB_MODES.find((m) => m.id === id) ?? null;

/** the rings and nuggets (items, content/items.ts) */
export const RING = "gold-ring";
export const NUGGET = "gold-nugget";
/** 15 самородков = 1 кольцо */
export const NUGGETS_PER_RING = 15;

/** the first three finishers' bonus in кольца */
export const ZARUB_PLACE_RINGS = [20, 12, 6];
/** seats in a race */
export const ZARUB_SEATS = 5;
/** paid finishes a Moscow day in each difficulty */
export const ZARUB_DAILY = 15;
/** a race's time */
export const ZARUB_RACE_MS = 24 * 3_600_000;
/** a new race takes the players who start the same difficulty within this time (a bot's seat goes to each) */
export const ZARUB_JOIN_MS = 10 * 60_000;
/** a task bought out for this many слитки (GOLD) */
export const ZARUB_SKIP_GOLD = 4;
export const ZARUB_TASKS = 8;

/** what a task counts (fed by the game's actions: server/systems/zarub.ts zarubTick) */
export type ZarubKind = "hits" | "damage" | "kill" | "steps" | "energy" | "yard" | "pap" | "xp" | "social" | "poker" | "slots" | "zonk" | "bj" | "upgrader" | "buy";
export interface ZarubTaskDef {
  kind: ZarubKind;
  /** the «Пацанские» target (× the mode's scale) */
  base: number;
  title: (n: number) => string;
  href: string;
  /** the picture of the task (an item id or a currency) */
  icon: string;
}
export const ZARUB_POOL: ZarubTaskDef[] = [
  { kind: "hits", base: 30, title: (n) => `Ударь босса ${n} раз`, href: "/bosses", icon: "fist" },
  { kind: "damage", base: 1_000, title: (n) => `Нанеси ${n.toLocaleString("ru-RU")} урона боссам`, href: "/bosses", icon: "gpu" },
  { kind: "kill", base: 1, title: (n) => (n === 1 ? "Убей любого босса" : `Убей ${n} боссов`), href: "/bosses", icon: "keyboard" },
  { kind: "steps", base: 6, title: (n) => `Выполни ${n} шагов в локациях`, href: "/locations", icon: "energy-drink" },
  { kind: "energy", base: 150, title: (n) => `Потрать ${n} энергии`, href: "/locations", icon: "energy-drink" },
  { kind: "yard", base: 4, title: (n) => `Подбери ${n} находок во дворе`, href: "/yard", icon: "part-nails" },
  { kind: "pap", base: 300, title: (n) => `Заработай ${n.toLocaleString("ru-RU")} папирос`, href: "/locations", icon: "PAP" },
  { kind: "xp", base: 2_000, title: (n) => `Набери ${n.toLocaleString("ru-RU")} авторитета`, href: "/locations", icon: "xp" },
  { kind: "social", base: 3, title: (n) => `Наедь, харкни или накачай бицуху ${n} раз`, href: "/rating", icon: "fist" },
  { kind: "poker", base: 3, title: (n) => `Сыграй ${n} раздачи в покер`, href: "/yard", icon: "poker-chip" },
  { kind: "slots", base: 5, title: (n) => `Крутани однорукого бандита ${n} раз`, href: "/yard", icon: "coins" },
  { kind: "zonk", base: 1, title: (n) => `Доиграй ${n} ${n === 1 ? "партию" : "партии"} в зонк`, href: "/yard", icon: "poker-chip" },
  { kind: "bj", base: 2, title: (n) => `Сыграй ${n} раунда в блэкджек`, href: "/yard", icon: "card-gold" },
  { kind: "upgrader", base: 2, title: (n) => `Крутани апгрейдер ${n} раза`, href: "/yard", icon: "keycap" },
  { kind: "buy", base: 1, title: (n) => (n === 1 ? "Купи что-нибудь в магазине" : `Купи ${n} раза что-нибудь в магазине`), href: "/shop", icon: "RUB" },
];
export interface ZarubTask { kind: ZarubKind; target: number }

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** a race's 8 tasks: different kinds, the targets by the mode */
export function zarubTasks(mode: ZarubMode, seed: string): ZarubTask[] {
  const m = zarubMode(mode)!;
  const rnd = seeded(hash(`zarub:${seed}`));
  const pool = ZARUB_POOL.slice();
  const out: ZarubTask[] = [];
  while (out.length < ZARUB_TASKS && pool.length) {
    const d = pool.splice(Math.floor(rnd() * pool.length) % pool.length, 1)[0];
    out.push({ kind: d.kind, target: Math.max(1, Math.round(d.base * m.scale)) });
  }
  return out;
}
export const zarubTaskDef = (kind: ZarubKind) => ZARUB_POOL.find((d) => d.kind === kind)!;

/** the bots in the empty seats */
export const ZARUB_BOT_NAMES = ["Винт", "Татарин", "Шнырь", "Сиплый", "Гвоздь", "Кабан", "Лысый", "Штырь", "Хмурый", "Седой", "Малой", "Борзый", "Косой", "Шрам", "Ржавый", "Тихий", "Дизель", "Батон", "Бурый", "Фикса"];
/** a bot's time to close the 8 tasks (ms): [min, max] by the mode */
export const ZARUB_BOT_TIME: Record<ZarubMode, [number, number]> = {
  pacan: [40 * 60_000, 6 * 3_600_000],
  blat: [60 * 60_000, 9 * 3_600_000],
  avtor: [90 * 60_000, 14 * 3_600_000],
};
/** a bot's share done at a moment (0…1): it speeds up and slows down a little on the way */
export function botShare(startAt: number, finishAt: number, now: number) {
  if (now >= finishAt) return 1;
  const t = Math.max(0, (now - startAt) / Math.max(1, finishAt - startAt));
  return Math.min(0.999, t - Math.sin(t * Math.PI * 2) * 0.06);
}

/** the zarub level: the опыт needed to reach level L, counted from zero (L1 50, L30 5 510, L60 20 060, L100 53 460) */
export function zarubXpFor(level: number) {
  if (level <= 0) return 0;
  return Math.round(-0.000295178554 * level ** 3 + 5.05608393 * level ** 2 + 31.8120716 * level + 13.1321396);
}
export function zarubLevel(xp: number) {
  let l = 0;
  while (zarubXpFor(l + 1) <= xp && l < 999) l++;
  return { level: l, from: zarubXpFor(l), to: zarubXpFor(l + 1) };
}

/*
 * The tattoo sets (content/tattoos.ts, boss "zarub"): 9 for each difficulty — «Пацанские» add to the автомат, «Блатные»
 * to the нож, «Авторитетные» to the пистолет (the bonuses from the user's example).
 */
export interface ZarubSetDef { id: string; name: string; damage: number }
export const ZARUB_SETS: Record<ZarubMode, { weapon: string; sets: ZarubSetDef[] }> = {
  pacan: {
    weapon: "rug-pull-gun",
    sets: [
      { id: "zr-barak", name: "Барак", damage: 60 }, { id: "zr-bones", name: "Кости", damage: 60 }, { id: "zr-ash", name: "Пепел", damage: 130 },
      { id: "zr-deep", name: "Глубина", damage: 70 }, { id: "zr-gasmask", name: "Противогаз", damage: 72 }, { id: "zr-gears", name: "Механизм", damage: 74 },
      { id: "zr-bratva", name: "Братва", damage: 150 }, { id: "zr-totem", name: "Тотем", damage: 94 }, { id: "zr-kush", name: "Куш", damage: 90 },
    ],
  },
  blat: {
    weapon: "keyboard",
    sets: [
      { id: "zr-sakura", name: "Сакура", damage: 62 }, { id: "zr-ghost", name: "Призрак", damage: 100 }, { id: "zr-wings", name: "Крылья", damage: 60 },
      { id: "zr-crest", name: "Герб", damage: 70 }, { id: "zr-katana", name: "Катана", damage: 72 }, { id: "zr-clock", name: "Часовщик", damage: 74 },
      { id: "zr-amphora", name: "Амфора", damage: 100 }, { id: "zr-abyss", name: "Бездна", damage: 94 }, { id: "zr-anchor", name: "Якорь", damage: 90 },
    ],
  },
  avtor: {
    weapon: "gpu",
    sets: [
      { id: "zr-plague", name: "Чума", damage: 60 }, { id: "zr-jaguar", name: "Ягуар", damage: 62 }, { id: "zr-peak", name: "Вершина", damage: 64 },
      { id: "zr-chronicle", name: "Летопись", damage: 72 }, { id: "zr-fog", name: "Туман", damage: 74 }, { id: "zr-corsair", name: "Корсар", damage: 76 },
      { id: "zr-heaven", name: "Небеса", damage: 130 }, { id: "zr-grin", name: "Оскал", damage: 92 }, { id: "zr-ball", name: "Бал", damage: 96 },
    ],
  },
};
/** a difficulty's bags: 3 sets each; an opening's price in кольца (all bags of a difficulty ≈ 4 840 / 13 950 / 29 340) */
export const ZARUB_BAG_PRICES: Record<ZarubMode, number[]> = { pacan: [20, 26, 31], blat: [60, 74, 88], avtor: [125, 155, 186] };
export const zarubBagSets = (mode: ZarubMode, bag: number) => ZARUB_SETS[mode].sets.slice(bag * 3, bag * 3 + 3);

/** a finisher's reward (the place bonus on top for the first three) */
export function zarubReward(mode: ZarubMode, place: number | null): Reward {
  const m = zarubMode(mode)!;
  const bonus = place !== null && place >= 1 && place <= ZARUB_PLACE_RINGS.length ? ZARUB_PLACE_RINGS[place - 1] : 0;
  return { items: [{ id: RING, qty: m.rings + bonus }, { id: NUGGET, qty: m.nuggets }] };
}
