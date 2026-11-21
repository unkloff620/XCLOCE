import type { Reward } from "./rewards.ts";
import { BOSSES, EVENT_FIGHTS } from "./bosses.ts";
/** the chain bosses and the event bosses (Пепе): «Боссы» and «Время» count them all */
const FIGHT_BOSSES = [...BOSSES, ...EVENT_FIGHTS];
import { STASH_SETS_ORDERED } from "./stashes.ts";
import { LOCATIONS } from "./locations.ts";
import { POKER_HANDS } from "./games.ts";
import { CRAFT_ITEMS, CRAFT_ITEMS_2, CRAFT_ITEMS_3 } from "./craft.ts";
import { RAID_YARDS } from "./raids.ts";
/** «Нычки»: a collection gathered once and ten times — 5 and 20 points */
export const STASH_MEDAL_TARGETS = [1, 10] as const;
const STASH_POINTS = [5, 20];

/*
 * Достижения (четвёртая редакция, the user 2026-11-21): вкладки Боевые, Экономика, Азартные, Локации, Нычки, Комбо,
 * Крафт, Мастерская, Прочее, Кланы, События («Комбо», «Мастерская» и «События» — пока «Скоро»). Каждая позиция —
 * картинка с числом, название, что сделать, полоска прогресса и очки достижений (солнце) за неё: других наград нет,
 * очки копятся и открывают «Ящик ништяков». Прогресс считается сервером из того, что игра уже хранит
 * (systems/achievements.ts → statsFor), отдельные счётчики — systems/counters.ts.
 */

/** what a position measures (the server's stats); strings like "win:<boss>", "got:<item>", "loc:<location>" */
export type AchStat = string;

/** 1 bronze · 2 silver · 3 gold · 4 platinum · 5 diamond — the colour of a position by how far in its list it is */
export type AchTier = 1 | 2 | 3 | 4 | 5;
export const TIER_NAMES: Record<AchTier, string> = { 1: "Бронза", 2: "Серебро", 3: "Золото", 4: "Платина", 5: "Бриллиант" };
export const TIER_COLORS: Record<AchTier, string> = { 1: "#d0803f", 2: "#c3cdde", 3: "#ffcc33", 4: "#5ff0dc", 5: "#c07bff" };

export type AchSection = "boss" | "eco" | "games" | "loc" | "stash" | "combo" | "craft" | "workshop" | "misc" | "clan" | "events";
/** `soon`: the tab is there, with «Скоро» instead of a list */
export const ACH_SECTIONS: { id: AchSection; name: string; soon?: boolean }[] = [
  { id: "boss", name: "Боевые" }, { id: "eco", name: "Экономика" }, { id: "games", name: "Азартные" }, { id: "loc", name: "Локации" },
  { id: "stash", name: "Нычки" }, { id: "combo", name: "Комбо", soon: true }, { id: "craft", name: "Крафт" },
  { id: "workshop", name: "Мастерская", soon: true }, { id: "misc", name: "Прочее" }, { id: "clan", name: "Кланы" },
  { id: "events", name: "События", soon: true },
];

export interface AchievementDef {
  id: string;
  /** the list it belongs to (AchCategory.id) */
  category: string;
  name: string;
  hint: string;
  stat: AchStat;
  target: number;
  tier: AchTier;
  /** the picture: an icon name, or a boss («boss» categories show his face) */
  icon: string;
  /** the number on the picture (1K, 50, …) */
  label: string;
  /** a per-boss position: shown only while the boss is in the game */
  boss?: string;
  /** achievement points it gives (the only reward) */
  points: number;
  reward: Reward;
}

export interface AchCategory {
  id: string;
  section: AchSection;
  name: string;
  icon: string;
  /** a picture instead of the icon (a нычки set) */
  img?: string;
  /** «boss»: one line per boss with his face (Соло, Боссы, Время) */
  kind: "list" | "boss";
  lines: AchievementDef[];
}

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/ /g, " ");
/** 1000 → 1K, 2 500 000 → 2.5M, 70 000 000 000 → 70B */
export const shortNum = (n: number) => (n >= 1e9 ? `${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${+(n / 1e3).toFixed(1)}K` : String(n));

/** a round number near v: 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8 × a power of ten */
function nice(v: number): number {
  if (v < 10) return Math.max(1, Math.round(v));
  const m = 10 ** Math.floor(Math.log10(v));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
  const k = steps.reduce((best, x) => (Math.abs(x * m - v) < Math.abs(best * m - v) ? x : best), 1);
  return k * m;
}
/** n round thresholds from `from` to `to` (both exact), evenly on a log scale, every next one bigger */
export function steps(from: number, to: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = i === 0 ? from : i === n - 1 ? to : nice(from * (to / from) ** (i / (n - 1)));
    out.push(Math.max(v, (out[i - 1] ?? 0) + 1));
  }
  return out;
}
/** n points from `from` to `to` (both exact), growing on a log scale, never falling */
export function pointsRange(from: number, to: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = n === 1 ? to : i === n - 1 ? to : Math.round(from * (to / from) ** (i / (n - 1)));
    out.push(Math.max(v, out[i - 1] ?? 0));
  }
  return out;
}
const linear = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => Math.round(from + ((to - from) * i) / (n - 1)));
const tierOf = (n: number, i: number) => Math.min(5, 1 + Math.floor((5 * i) / n)) as AchTier;
const line = (cat: string, i: number, n: number, a: Omit<AchievementDef, "category" | "tier" | "reward" | "id"> & { id?: string; tier?: AchTier }): AchievementDef =>
  ({ ...a, id: a.id ?? `${cat}-${i + 1}`, category: cat, tier: a.tier ?? tierOf(n, i), reward: { achPoints: a.points } });

/** a list of thresholds of one stat, with its points */
function series(id: string, section: AchSection, name: string, icon: string, stat: AchStat, targets: number[], points: number[], hint: (n: string) => string): AchCategory {
  const n = targets.length;
  return { id, section, name, icon, kind: "list", lines: targets.map((t, i) => line(id, i, n, { name: `${name} · ${shortNum(t)}`, hint: hint(fmt(t)), stat, target: t, icon, label: shortNum(t), points: points[i] })) };
}

/** a boss's points for killing him solo, in a crew, or within the hour: 2 for the first … 60 for Солнце (by his number);
 *  stronger bosses to come get more. An event boss (Пепе) — EVENT_POINTS. */
export const BOSS_POINTS: Record<number, number> = Object.fromEntries(pointsRange(2, 60, BOSSES.length).map((p, i) => [i + 1, p]));
const EVENT_POINTS = 30;
const bossPoints = (b: (typeof FIGHT_BOSSES)[number]) => (b.event ? EVENT_POINTS : BOSS_POINTS[b.order] ?? 60);
/** «Боссы» medals on the boss cards: wins over each boss for the bronze, silver and gold one (not achievements any more) */
export const BOSS_KILL_TARGETS = [10, 50, 100] as const;
export const FAST_KILL_MS = 3_600_000;

/** «Локации», «Кланы → захват»: 1 … 50 (or 100) runs, 1 … 20 points */
const RUN_POINTS = [1, 3, 6, 12, 20];
/** a poker hand's points (royal flush 100, straight flush 80, four of a kind 60) */
const POKER_POINTS: Record<string, number> = { royal: 100, sflush: 80, quads: 60, full: 40, flush: 30, straight: 20, trips: 10, twopair: 5, pair: 1 };
/** a 777 combination's points: 10 … 50 for three sevens */
const SLOT_COMBOS: [string, string, number, string][] = [
  ["jackpot", "Три семёрки", 50, "seven"], ["bar", "Три BAR", 35, "bar"], ["bell", "Три колокола", 25, "bell"], ["melon", "Три арбуза", 20, "melon"],
  ["grape", "Три грозди", 15, "grape"], ["lemon", "Три лимона", 15, "lemon"], ["cherry", "Три вишни", 10, "cherry"], ["pair", "Пара", 10, "cherry"],
];
/** zonk combinations: 10 points each, the straight 20 */
const ZONK_COMBOS: [string, string, number][] = [
  ["x3", "Три одинаковых", 10], ["ones3", "Три единицы", 10], ["pairs3", "Три пары", 10], ["x4", "Четыре одинаковых", 10],
  ["straight", "Стрит 1–6", 20], ["x5", "Пять одинаковых", 10], ["x6", "Шесть одинаковых", 10],
];
/** «Крафт»: every thing made, by its level */
const CRAFT_POINTS = { 1: 5, 2: 10, 3: 20 } as const;

const perBoss = (id: string, section: AchSection, name: string, icon: string, stat: (b: string) => string, label: string, hint: (b: string) => string, bosses = FIGHT_BOSSES, idOf = (b: string) => `${id}-${b}`): AchCategory => ({
  id, section, name, icon, kind: "boss",
  lines: bosses.map((b, i) => line(id, i, bosses.length, { id: idOf(b.id), name: b.name, hint: hint(b.name), stat: stat(b.id), target: 1, icon: b.id, label, boss: b.id, points: bossPoints(b) })),
});

export const ACH_CATEGORIES: AchCategory[] = [
  // ---------------- Боевые ----------------
  series("damage", "boss", "Урон", "ach-damage", "damage", steps(1_000, 70_000_000_000, 36), pointsRange(1, 350, 36), (n) => `Нанеси боссам ${n} урона`),
  series("got-rifle", "boss", "Автоматы", "rug-pull-gun", "got:rug-pull-gun", steps(10, 500_000, 16), pointsRange(1, 50, 16), (n) => `Собери ${n} автоматов`),
  series("got-pistol", "boss", "Пистолеты", "gpu", "got:gpu", steps(10, 1_500_000, 16), pointsRange(1, 50, 16), (n) => `Собери ${n} пистолетов`),
  series("got-knife", "boss", "Ножи", "keyboard", "got:keyboard", steps(10, 1_500_000, 16), pointsRange(1, 50, 16), (n) => `Собери ${n} ножей`),
  perBoss("solo", "boss", "Соло", "ach-solo", (b) => `solo:${b}`, "соло", (n) => `Убей босса ${n} в одиночку (бой «Соло»)`, BOSSES, (b) => `soloboss-${b}`),
  perBoss("team", "boss", "Боссы", "ach-wins", (b) => `team:${b}`, "1", (n) => `Победи босса ${n} не в соло`),
  perBoss("fast", "boss", "Быстрое устранение", "clock", (b) => `fast:${b}`, "1 ч", (n) => `Убей босса ${n} меньше чем за час после начала боя`),
  series("talents", "boss", "Таланты", "talent", "talents", steps(10, 1_000, 17), pointsRange(1, 50, 17), (n) => `Прокачай ${n} талантов`),
  // ---------------- Экономика: what was collected (everything gained, spent or not) ----------------
  series("authority", "eco", "Авторитет", "xp", "authority", steps(10_000, 400_000_000, 17), pointsRange(1, 100, 17), (n) => `Подними ${n} авторитета`),
  series("earn-pap", "eco", "Папиросы", "PAP", "earn:PAP", steps(10_000, 20_000_000, 10), pointsRange(1, 20, 10), (n) => `Собери ${n} папирос`),
  series("earn-rub", "eco", "Рубли", "RUB", "earn:RUB", steps(5, 5_000_000, 15), pointsRange(1, 100, 15), (n) => `Собери ${n} ₽`),
  series("earn-token", "eco", "Жетоны", "TOKEN", "earn:TOKEN", steps(4, 5_000, 11), pointsRange(1, 30, 11), (n) => `Собери ${n} жетонов`),
  series("earn-tooth", "eco", "Зубы", "TOOTH", "earn:TOOTH", steps(5_000, 5_000_000, 10), pointsRange(1, 40, 10), (n) => `Собери ${n} зубов`),
  series("earn-gold", "eco", "Слитки", "GOLD", "earn:GOLD", steps(2, 5_000, 10), pointsRange(1, 30, 10), (n) => `Собери ${n} слитков`),
  // ---------------- Азартные ----------------
  series("poker-level", "games", "Покер: уровень", "ach-poker", "pokerLevel", steps(10, 300, 10), pointsRange(5, 30, 10), (n) => `Получи ${n} уровень в покере`),
  {
    id: "poker-hands", section: "games", name: "Покер: комбинации", icon: "ach-poker", kind: "list",
    lines: POKER_HANDS.filter((h) => h.id !== "high").map((h, i, arr) => line("poker-hands", i, arr.length, {
      id: `poker-${h.id}`, name: h.name, hint: `Собери ${h.name}, играя в покер`, stat: `poker:${h.id}`, target: 1, icon: "ach-poker", label: "1",
      points: POKER_POINTS[h.id] ?? 10, tier: POKER_POINTS[h.id] >= 60 ? 5 : POKER_POINTS[h.id] >= 30 ? 4 : POKER_POINTS[h.id] >= 20 ? 3 : POKER_POINTS[h.id] >= 10 ? 2 : 1,
    })).sort((x, y) => x.points - y.points),
  },
  series("poker-stickers", "games", "Покер: стикеры", "poker-sticker", "got:poker-sticker", linear(1_000, 10_000, 10), pointsRange(1, 50, 10), (n) => `Собери ${n} стикеров в покере`),
  // «Колесо удачи» (content/fortune.ts): shown once the wheel is in the yard (the client hides the «fortune-» lists)
  series("fortune-level", "games", "Колесо: уровень", "/assets/fortune/xp.webp", "fortuneLevel", steps(2, 300, 10), pointsRange(1, 100, 10), (n) => `Получи ${n} уровень «Колеса удачи»`),
  series("fortune-cups", "games", "Колесо: чашки", "/assets/fortune/cup.webp", "fortuneCups", steps(1, 300, 10), pointsRange(1, 100, 10), (n) => `Сыграй в чашки ${n} раз`),
  series("fortune-keycaps", "games", "Колесо: кнопки", "keycap", "got:keycap", linear(1_000, 10_000, 10), pointsRange(1, 50, 10), (n) => `Собери ${n} кнопок клавиатуры`),
  series("zonk-level", "games", "Зонк: уровень", "ach-zonk", "zonkLevel", steps(2, 300, 10), pointsRange(5, 100, 10), (n) => `Получи ${n} уровень в зонке`),
  {
    id: "zonk-combos", section: "games", name: "Зонк: комбинации", icon: "ach-zonk", kind: "list",
    lines: ZONK_COMBOS.map(([c, nm, pts], i) => line("zonk-combos", i, ZONK_COMBOS.length, { id: `zonk-${c}`, name: nm, hint: `Выброси в зонке: ${nm.toLowerCase()}`, stat: `zonk:${c}`, target: 1, icon: "ach-zonk", label: "1", points: pts, tier: pts > 10 ? 3 : 2 })),
  },
  {
    id: "slots-combos", section: "games", name: "Автомат 777", icon: "ach-slots", kind: "list",
    lines: [...SLOT_COMBOS].reverse().map(([o, nm, pts, sym], i) => line("slots-combos", i, SLOT_COMBOS.length, {
      id: `slot-${o}`, name: nm, hint: `Выбей в автомате 777: ${nm.toLowerCase()}`, stat: `slot:${o}`, target: 1, icon: `/assets/slots/${sym}.webp`, label: "1", points: pts,
      tier: pts >= 50 ? 5 : pts >= 35 ? 4 : pts >= 20 ? 3 : pts >= 15 ? 2 : 1,
    })),
  },
  // ---------------- Локации: every location by day and by night ----------------
  ...LOCATIONS.flatMap((l): AchCategory[] => (["day", "night"] as const).map((mode) => {
    const id = `loc-${l.id}${mode === "night" ? "-n" : ""}`;
    const runs = [1, 5, 10, 25, 50];
    return {
      id, section: "loc", name: `${l.short} · ${mode === "night" ? "ночь" : "день"}`, icon: "map", kind: "list",
      lines: runs.map((t, i) => line(id, i, runs.length, {
        id: `${id}-${t}`, name: `${mode === "night" ? "Ночью" : "Днём"} · ${t}`, hint: `Пройди ${mode === "night" ? "ночную" : "дневную"} локацию «${l.short}» ${t === 1 ? "" : `${t} раз`}`.trim(),
        stat: `${mode === "night" ? "locn" : "loc"}:${l.id}`, target: t, icon: "map", label: String(t), points: RUN_POINTS[i],
      })),
    };
  })),
  // ---------------- Нычки: every set collected once and ten times ----------------
  ...STASH_SETS_ORDERED.map((st): AchCategory => ({
    id: `stash-${st.n}`, section: "stash", name: st.name, icon: "chest", img: `/assets/stash/set-${st.n}.webp`, kind: "list",
    lines: STASH_MEDAL_TARGETS.map((t, k) => line(`stash-${st.n}`, k, STASH_MEDAL_TARGETS.length, {
      id: `stashset-${st.n}-${k + 1}`, name: `${st.name} · ${t}`, hint: t === 1 ? `Собери коллекцию «${st.name}»` : `Собери коллекцию «${st.name}» ${t} раз`, stat: `stashsets:${st.n}`, target: t,
      icon: "chest", label: String(t), tier: (k ? 3 : 1) as AchTier, points: STASH_POINTS[k],
    })),
  })),
  // ---------------- Крафт: every thing made, one by one ----------------
  ...([[1, CRAFT_ITEMS, "ach-craft1"], [2, CRAFT_ITEMS_2, "ach-craft2"], [3, CRAFT_ITEMS_3, "ach-craft3"]] as const).map(([lv, list, icon]): AchCategory => ({
    id: `craft${lv}`, section: "craft", name: `Вещи ${lv} уровня`, icon, kind: "list",
    lines: list.map((c, i) => line(`craft${lv}`, i, list.length, {
      id: `craft-${c.id}`, name: c.name, hint: `Собери в крафте «${c.name}»`, stat: `craft:${c.id}`, target: 1, icon: c.id, label: `${lv} ур`, points: CRAFT_POINTS[lv], tier: (lv * 2 - 1) as AchTier,
    })),
  })),
  // ---------------- Прочее ----------------
  series("pumps", "misc", "Качнуть бицуху", "ach-trainer", "pumps", steps(1, 1_000, 10), pointsRange(1, 50, 10), (n) => `Качни бицуху другим игрокам ${n} раз`),
  series("spits", "misc", "Харкнуть", "ach-spit", "spits", steps(1, 1_000, 10), pointsRange(1, 50, 10), (n) => `Харкни в других игроков ${n} раз`),
  series("unshaven", "misc", "Небритый", "ach-razor", "unshaven", [7, 14, 30, 60], [10, 20, 30, 40], (n) => `Не брей бороду ${n} дней`),
  series("gifts", "misc", "Отправить нычки или детали", "gift", "giftsSent", steps(1, 100, 10), pointsRange(1, 20, 10), (n) => `Отправь другим игрокам ${n} нычек или деталей`),
  // ---------------- Кланы ----------------
  {
    id: "clan-life", section: "clan", name: "Клан", icon: "ach-leader", kind: "list",
    lines: [
      line("clan-life", 0, 2, { id: "clan-create", name: "Создать клан", hint: "Создай свой клан", stat: "clanCreated", target: 1, icon: "ach-leader", label: "1", points: 20, tier: 3 }),
      line("clan-life", 1, 2, { id: "clan-leave", name: "Покинуть клан", hint: "Выйди из клана", stat: "clanLeft", target: 1, icon: "ach-clan", label: "1", points: 20, tier: 3 }),
    ],
  },
  series("clan-level", "clan", "Уровень клана", "ach-clan", "clanLevel", linear(5, 50, 10), pointsRange(5, 100, 10), (n) => `Будь в клане ${n} уровня`),
  ...RAID_YARDS.map((y): AchCategory => {
    const runs = [1, 5, 10, 50, 100];
    const id = `raid-${y.id}`;
    return {
      id, section: "clan", name: `Захват: ${y.name}`, icon: `raid-flag-${y.n}`, kind: "list",
      lines: runs.map((t, i) => line(id, i, runs.length, {
        id: `${id}-${t}`, name: `${y.name} · ${t}`, hint: t === 1 ? `Заверши захват двора «${y.name}»` : `Заверши захват двора «${y.name}» ${t} раз`,
        stat: `raidyard:${y.id}`, target: t, icon: `raid-flag-${y.n}`, label: String(t), points: RUN_POINTS[i],
      })),
    };
  }),
];

export const ACHIEVEMENTS: AchievementDef[] = ACH_CATEGORIES.flatMap((c) => c.lines);
export const categoryOf = (id: string) => ACH_CATEGORIES.find((c) => c.lines.some((a) => a.id === id));
/** kept for an old migration: the solo list */
export const SOLO_BOSS_ACHIEVEMENTS = ACH_CATEGORIES.find((c) => c.id === "solo")!.lines;

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);

/* ---------------- weekly rating ---------------- */

/** Prizes for the weekly damage top-10, by place (index 0 = 1st place). */
export const WEEKLY_PRIZES: Reward[] = [
  { xp: 300_000, items: [{ id: "rug-pull-gun", qty: 2 }] },
  { xp: 200_000, items: [{ id: "rug-pull-gun", qty: 1 }] },
  { xp: 150_000, items: [{ id: "gpu", qty: 2 }] },
  ...Array.from({ length: 7 }, () => ({ xp: 50_000, items: [{ id: "gpu", qty: 1 }] }) as Reward),
];
/** Every member of the top-10 clans of the week (by the members' damage that week); places 4–10 get the same. */
export const CLAN_PRIZES: Reward[] = [
  { currencies: { RUB: 5000 }, xp: 10_000, items: [{ id: "rug-pull-gun", qty: 3 }] },
  { currencies: { RUB: 2500 }, xp: 5_000, items: [{ id: "rug-pull-gun", qty: 1 }] },
  { currencies: { RUB: 1250 }, xp: 2_500, items: [{ id: "gpu", qty: 1 }] },
  ...Array.from({ length: 7 }, () => ({ currencies: { RUB: 250 }, xp: 500, items: [{ id: "keyboard", qty: 1 }] }) as Reward),
];

/** frame on the player card for last week's place */
export type Frame = "gold" | "silver" | "bronze" | "top";
export function frameOf(place: number | null | undefined): Frame | null {
  if (!place) return null;
  return place === 1 ? "gold" : place === 2 ? "silver" : place === 3 ? "bronze" : place <= 10 ? "top" : null;
}
