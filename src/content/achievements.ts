import type { Reward } from "./rewards.ts";
import { BOSSES } from "./bosses.ts";
import { STASH_MEDAL_TARGETS, STASH_SETS_ORDERED } from "./stashes.ts";
import { LOCATIONS } from "./locations.ts";
import { POKER_HANDS } from "./games.ts";

/*
 * Достижения (третья редакция): списки позиций по разделам — Боевые, Экономика, Азартные, Задания, Нычки, Прочее.
 * Каждая позиция — картинка с числом, название, что сделать, полоска прогресса и очки достижений (солнце) за неё:
 * других наград нет, очки копятся и открывают «Ящик ништяков». Прогресс считается сервером из того, что игра уже
 * хранит (systems/achievements.ts → statsFor), отдельные счётчики — systems/counters.ts.
 */

/** what a position measures (the server's stats); strings like "win:<boss>", "got:<item>", "loc:<location>" */
export type AchStat = string;

/** 1 bronze · 2 silver · 3 gold · 4 platinum · 5 diamond — the colour of a position by how far in its list it is */
export type AchTier = 1 | 2 | 3 | 4 | 5;
export const TIER_NAMES: Record<AchTier, string> = { 1: "Бронза", 2: "Серебро", 3: "Золото", 4: "Платина", 5: "Бриллиант" };
export const TIER_COLORS: Record<AchTier, string> = { 1: "#d0803f", 2: "#c3cdde", 3: "#ffcc33", 4: "#5ff0dc", 5: "#c07bff" };

export type AchSection = "boss" | "eco" | "games" | "tasks" | "stash" | "misc";
export const ACH_SECTIONS: { id: AchSection; name: string }[] = [
  { id: "boss", name: "Боевые" }, { id: "eco", name: "Экономика" }, { id: "games", name: "Азартные" },
  { id: "tasks", name: "Задания" }, { id: "stash", name: "Нычки" }, { id: "misc", name: "Прочее" },
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

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/\u00a0/g, " ");
/** 1000 → 1K, 2 500 000 → 2.5M */
export const shortNum = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
/** the points of the positions of a list of n: small first, the last ones are worth a lot */
const POINTS: Record<number, number[]> = {
  1: [10], 3: [3, 10, 25], 5: [2, 5, 10, 20, 40], 10: [1, 2, 3, 5, 8, 10, 15, 20, 30, 50],
  15: [1, 2, 3, 5, 5, 8, 10, 10, 15, 20, 25, 30, 40, 50, 75], 20: [1, 1, 2, 2, 3, 3, 5, 5, 5, 8, 8, 10, 10, 15, 15, 20, 25, 30, 40, 50],
};
const pointsOf = (n: number, i: number) => (POINTS[n] ?? POINTS[10])[Math.min(i, (POINTS[n] ?? POINTS[10]).length - 1)];
const tierOf = (n: number, i: number) => Math.min(5, 1 + Math.floor((5 * i) / n)) as AchTier;
const line = (cat: string, i: number, n: number, a: Omit<AchievementDef, "category" | "tier" | "points" | "reward" | "id"> & { id?: string; points?: number; tier?: AchTier }): AchievementDef => {
  const points = a.points ?? pointsOf(n, i);
  return { ...a, id: a.id ?? `${cat}-${i + 1}`, category: cat, tier: a.tier ?? tierOf(n, i), points, reward: { achPoints: points } };
};

/** a list of thresholds of one stat */
function series(id: string, section: AchSection, name: string, icon: string, stat: AchStat, targets: number[], hint: (n: string) => string, names?: string[]): AchCategory {
  const n = targets.length;
  return {
    id, section, name, icon, kind: "list",
    lines: targets.map((t, i) => line(id, i, n, { name: names?.[i] ?? `${name} · ${shortNum(t)}`, hint: hint(fmt(t)), stat, target: t, icon, label: shortNum(t) })),
  };
}

/** achievement points for killing a boss solo (and for killing him within an hour), by his number: Дацкоу 1 … Солнце 100 */
export const SOLO_POINTS: Record<number, number> = { 1: 1, 2: 5, 3: 10, 4: 15, 5: 20, 6: 25, 7: 30, 8: 40, 9: 50, 10: 60, 11: 70, 12: 85, 13: 100 };
/** «Боссы»: wins over each boss for the bronze, silver and gold medal */
export const BOSS_KILL_TARGETS = [10, 50, 100] as const;
export const FAST_KILL_MS = 3_600_000;

export const ACH_CATEGORIES: AchCategory[] = [
  // ---------------- Боевые ----------------
  series("fight-damage", "boss", "Урон", "ach-damage", "bestFight",
    [1_000, 5_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000], (n) => `Нанеси боссу ${n} урона за один бой`,
    ["Первая кровь", "Опасный тип", "Раздающий боль", "Мясорубка", "Гроза офиса", "Бульдозер", "Машина урона", "Терминатор", "Апокалипсис", "Царь урона"]),
  series("got-rpg", "boss", "Rug Pull Gun", "rug-pull-gun", "got:rug-pull-gun",
    [10, 25, 50, 100, 200, 300, 500, 750, 1_000, 1_500, 2_000, 3_000, 5_000, 7_500, 10_000], (n) => `Собери ${n} Rug Pull Gun`),
  series("got-gpu", "boss", "Видеокарты", "gpu", "got:gpu",
    [10, 25, 50, 100, 250, 500, 1_000, 1_500, 2_500, 4_000, 6_000, 8_000, 12_000, 18_000, 25_000], (n) => `Собери ${n} видеокарт`),
  series("got-keyboard", "boss", "Клавиатуры", "keyboard", "got:keyboard",
    [10, 25, 50, 100, 250, 500, 1_000, 2_000, 3_500, 5_000, 8_000, 12_000, 20_000, 35_000, 50_000], (n) => `Собери ${n} клавиатур`),
  {
    id: "solo", section: "boss", name: "Соло", icon: "ach-solo", kind: "boss",
    lines: BOSSES.map((b, i) => line("solo", i, BOSSES.length, {
      id: `soloboss-${b.id}`, name: b.name, hint: `Убей босса ${b.name} в одиночку (бой «Соло»)`, stat: `solo:${b.id}`, target: 1,
      icon: b.id, label: "соло", boss: b.id, points: SOLO_POINTS[b.order] ?? 5,
    })),
  },
  {
    id: "bosses", section: "boss", name: "Боссы", icon: "ach-wins", kind: "boss",
    lines: BOSSES.flatMap((b) => BOSS_KILL_TARGETS.map((t, k) => line("bosses", k, 3, {
      id: `bosskill-${b.id}-${k + 1}`, name: `${b.name}: ${TIER_NAMES[(k + 1) as AchTier]}`, hint: `Победи босса ${b.name} ${t} раз`, stat: `win:${b.id}`, target: t,
      icon: b.id, label: String(t), boss: b.id, tier: (k + 1) as AchTier,
    }))),
  },
  {
    id: "fast", section: "boss", name: "Время", icon: "clock", kind: "boss",
    lines: BOSSES.map((b, i) => line("fast", i, BOSSES.length, {
      id: `fast-${b.id}`, name: b.name, hint: `Убей босса ${b.name} меньше чем за час после начала боя`, stat: `fast:${b.id}`, target: 1,
      icon: b.id, label: "1 ч", boss: b.id, points: SOLO_POINTS[b.order] ?? 5,
    })),
  },
  series("talents", "boss", "Таланты", "talent", "talents",
    [10, 20, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 650, 700, 800], (n) => `Набери ${n} талантов`),
  series("raids", "boss", "Наехать", "ach-raid", "raids", [1, 5, 10, 25, 50, 100, 250, 500, 750, 1_000], (n) => `Наедь на других игроков ${n} раз`),
  series("spits", "boss", "Харкнуть", "ach-spit", "spits", [1, 5, 10, 25, 50, 100, 250, 500, 750, 1_000], (n) => `Харкни в других игроков ${n} раз`),
  // ---------------- Экономика (what lies on the balance now) ----------------
  series("authority", "eco", "Авторитет", "xp", "authority",
    [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 7_500_000, 10_000_000], (n) => `Набери ${n} авторитета`),
  series("save-rub", "eco", "Рубли", "RUB", "haveRUB",
    [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 7_500_000, 10_000_000], (n) => `Накопи ${n} ₽`),
  series("save-usd", "eco", "Доллары", "USD", "haveUSD", [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000], (n) => `Накопи ${n} $`),
  series("save-sol", "eco", "Солана", "SOL", "haveSOL", [1, 3, 5, 10, 25, 50, 100, 250, 500, 1_000], (n) => `Накопи ${n} SOL`),
  series("save-btc", "eco", "Биткоин", "BTC", "haveBTC", [1, 2, 3, 4, 5, 7, 10, 15, 20, 25], (n) => `Накопи ${n} BTC`),
  series("got-chips", "eco", "Фишки для покера", "poker-chip", "got:poker-chip", [1, 5, 10, 25, 50, 100, 250, 500, 750, 1_000], (n) => `Собери ${n} фишек для покера`),
  series("got-hodl", "eco", "Стикер HODL", "sticker-hodl", "got:sticker-hodl", [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000], (n) => `Собери ${n} стикеров HODL`),
  // ---------------- Азартные ----------------
  series("poker-level", "games", "Покер", "ach-poker", "pokerLevel", [5, 10, 20, 30, 40, 50, 60, 75, 90, 100], (n) => `Получи ${n} уровень в покере`,
    ["Новичок за столом", "Азартный старт", "Сегодня везёт", "Картёжник", "Любимец карт", "Шулер со стажем", "Покерфейс", "Акула стола", "Легенда притона", "Король покера"]),
  {
    id: "poker-hands", section: "games", name: "Комбинатор", icon: "ach-poker", kind: "list",
    lines: POKER_HANDS.filter((h) => h.id !== "high").reverse().map((h, i, arr) => line("poker-hands", i, arr.length, {
      id: `poker-${h.id}`, name: h.id === "royal" || h.id === "sflush" || h.id === "quads" ? `Поймал ${h.name}` : h.name, hint: `Собери ${h.name}, играя в покер`,
      stat: `poker:${h.id}`, target: 1, icon: "ach-poker", label: "1",
      points: ({ pair: 1, twopair: 2, trips: 3, straight: 5, flush: 8, full: 10, quads: 20, sflush: 40, royal: 60 } as Record<string, number>)[h.id] ?? 5,
      tier: ({ pair: 1, twopair: 1, trips: 2, straight: 2, flush: 3, full: 3, quads: 4, sflush: 5, royal: 5 } as Record<string, AchTier>)[h.id] ?? 1,
    })),
  },
  series("bj-bet", "games", "Блэкджек", "ach-bj", "bjBestBet", [5, 10, 25, 50, 75, 100, 150, 250, 350, 500], (n) => `Выиграй ставку ${n} $ в блэкджек`),
  {
    id: "zonk-combos", section: "games", name: "Зонк: комбинации", icon: "ach-zonk", kind: "list",
    lines: ([
      ["x3", "Три одинаковых", 1], ["ones3", "Три единицы", 2], ["pairs3", "Три пары", 3], ["x4", "Четыре одинаковых", 5],
      ["straight", "Стрит 1–6", 8], ["x5", "Пять одинаковых", 15], ["x6", "Шесть одинаковых", 40],
    ] as const).map(([c, nm, pts], i) => line("zonk-combos", i, 7, { id: `zonk-${c}`, name: nm, hint: `Выброси в зонке: ${nm.toLowerCase()}`, stat: `zonk:${c}`, target: 1, icon: "ach-zonk", label: "1", points: pts })),
  },
  series("zonk-best", "games", "Зонк: очки", "ach-zonk", "zonkBest", [2_000, 4_000, 6_000, 8_000, 10_000], (n) => `Набери ${n} очков за одну партию зонка`),
  // ---------------- Задания: every location by day, by night, and its business ----------------
  ...LOCATIONS.map((l): AchCategory => {
    const runs = [10, 25, 50, 75, 100];
    return {
      id: `loc-${l.id}`, section: "tasks", name: l.name, icon: "map", kind: "list",
      lines: [
        ...runs.map((t, i) => line(`loc-${l.id}`, i, 5, { id: `loc-${l.id}-d${t}`, name: `Днём · ${t}`, hint: `Вынеси «${l.name}» днём ${t} раз`, stat: `loc:${l.id}`, target: t, icon: "map", label: String(t) })),
        ...runs.map((t, i) => line(`loc-${l.id}`, i, 5, { id: `loc-${l.id}-n${t}`, name: `Ночью · ${t}`, hint: `Вынеси «${l.name}» ночью ${t} раз`, stat: `locn:${l.id}`, target: t, icon: "map", label: String(t), points: pointsOf(5, i) + 1 })),
        line(`loc-${l.id}`, 4, 5, { id: `biz-${l.id}`, name: "Свой бизнес", hint: `Открой бизнес в «${l.name}»`, stat: `biz:${l.id}`, target: 1, icon: "coins", label: "биз", points: 10 }),
      ],
    };
  }),
  // ---------------- Нычки: the sets ----------------
  ...STASH_SETS_ORDERED.map((st): AchCategory => ({
    id: `stash-${st.n}`, section: "stash", name: st.name, icon: "chest", img: `/assets/stash/set-${st.n}.webp`, kind: "list",
    lines: STASH_MEDAL_TARGETS.map((t, k) => line(`stash-${st.n}`, k, 3, {
      id: `stashset-${st.n}-${k + 1}`, name: `${st.name}: ${TIER_NAMES[(k + 1) as AchTier]}`, hint: `Собери набор «${st.name}» ${t} раз`, stat: `stashsets:${st.n}`, target: t,
      icon: "chest", label: String(t), tier: (k + 1) as AchTier,
    })),
  })),
  // ---------------- Прочее ----------------
  series("streak", "misc", "Серия входов", "gift", "bestStreak", [3, 7, 14, 30, 60], (n) => `Заходи ${n} дней подряд`),
  series("chests", "misc", "Сундуки дня", "ach-chests", "chests", [1, 7, 30, 100, 365], (n) => `Открой ${n} сундуков за задания дня`),
  series("yard", "misc", "Барахольщик", "ach-yard", "yard", [10, 100, 500, 2_000, 5_000], (n) => `Подбери во дворе ${n} находок`),
  series("weekly", "misc", "Топ недели", "ach-weekly", "weeklyTop", [1, 3, 10, 25, 50], (n) => `Попади в топ-10 недели по урону ${n} раз`),
  series("slots-spins", "misc", "Лудоман", "ach-slots", "slotSpins", [10, 100, 500, 2_000, 5_000], (n) => `Прокрути автомат 777 ${n} раз`),
  series("upg-wins", "misc", "Апгрейдер", "ach-upgrader", "upgWins", [1, 10, 50, 200, 1_000], (n) => `Прокачай вещь в апгрейдере ${n} раз`),
  series("clan-days", "misc", "Клановый", "ach-clan", "clanDays", [1, 7, 30, 90, 365], (n) => `Пробудь в клане ${n} дней подряд`),
  series("clan-bosses", "misc", "Клановый босс", "ach-clan", "clanBosses", [1, 3, 10, 25, 50], (n) => `Победи с кланом ${n} клановых боссов (бей сам)`),
  series("clan-leader", "misc", "Лидер", "ach-leader", "clanCreated", [1], () => "Создай свой клан"),
  series("nishtyaks", "misc", "Ништяк!", "ach-nishtyak", "nishtyaks", [1, 10, 50, 200, 1_000], (n) => `Получи ${n} «ништяков» от других игроков`),
];

export const ACHIEVEMENTS: AchievementDef[] = ACH_CATEGORIES.flatMap((c) => c.lines);
export const categoryOf = (id: string) => ACH_CATEGORIES.find((c) => c.lines.some((a) => a.id === id));
/** kept for older imports: the boss lists */
export const SOLO_BOSS_ACHIEVEMENTS = ACH_CATEGORIES.find((c) => c.id === "solo")!.lines;
export const BOSS_KILL_ACHIEVEMENTS = ACH_CATEGORIES.find((c) => c.id === "bosses")!.lines;
export const MEDAL_ACHIEVEMENTS: AchievementDef[] = [];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);

/* ---------------- weekly rating ---------------- */

/** Prizes for the weekly damage top-10, by place (index 0 = 1st place). */
export const WEEKLY_PRIZES: Reward[] = [
  { currencies: { USD: 48 }, xp: 300_000, items: [{ id: "rug-pull-gun", qty: 2 }] },
  { currencies: { USD: 31 }, xp: 200_000, items: [{ id: "rug-pull-gun", qty: 1 }] },
  { currencies: { USD: 22 }, xp: 150_000, items: [{ id: "gpu", qty: 2 }] },
  ...Array.from({ length: 7 }, () => ({ currencies: { USD: 10 }, xp: 50_000, items: [{ id: "gpu", qty: 1 }] }) as Reward),
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
