/*
 * Таланты.
 * Даются за урон по боссам за всё время игры: счётчик не сгорает после боя — следующий бой продолжает набивать
 * его с того места, где остановился прошлый. 1-й талант — за 100 урона, 100-й — за 1 000 000; пороги между ними
 * идут примерно как 100·k², но не ровно (где-то чуть раньше, где-то позже). После 100-го — ровно 100·k².
 * Тратятся в окне талантов (счётчик в бою, профиль, инвентарь): у каждого оружия, даже у кулака, две ветки — урон и сила крита.
 */
import { WEAPONS } from "./items.ts";

/** total damage needed for the k-th talent, k = 1…100 (generated once: 100·k² with a smooth ±7% wobble) */
export const TALENT_THRESHOLDS: readonly number[] = [
  100, 401, 905, 1_613, 2_519, 3_626, 4_909, 6_403, 8_074, 9_878,
  11_893, 14_047, 16_267, 18_923, 21_512, 24_338, 27_833, 31_194, 35_158, 38_929,
  43_668, 48_163, 53_591, 58_901, 65_158, 70_027, 76_085, 82_394, 88_859, 96_784,
  101_946, 108_629, 113_829, 120_336, 125_743, 131_291, 137_774, 143_456, 150_605, 155_661,
  163_137, 169_501, 177_399, 183_326, 188_521, 201_611, 211_856, 221_677, 230_105, 242_527,
  250_538, 267_851, 278_602, 289_322, 300_806, 321_807, 337_203, 342_633, 363_893, 379_168,
  384_124, 402_344, 415_882, 425_893, 444_256, 458_485, 465_897, 479_603, 489_867, 504_457,
  509_142, 524_451, 525_346, 531_825, 547_737, 551_129, 564_198, 578_874, 594_733, 604_543,
  630_407, 641_516, 661_536, 680_438, 710_031, 728_365, 756_467, 775_739, 802_998, 824_003,
  845_103, 867_526, 883_933, 902_517, 920_587, 934_589, 949_849, 965_897, 982_441, 1_000_000,
];

/** total damage needed for the k-th talent (k ≥ 1) */
export function talentThreshold(k: number): number {
  if (k <= 0) return 0;
  return k <= TALENT_THRESHOLDS.length ? TALENT_THRESHOLDS[k - 1] : 100 * k * k;
}

/** talents earned by `damage` dealt to bosses in total */
export function talentsForDamage(damage: number): number {
  let lo = 0, hi = TALENT_THRESHOLDS.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (TALENT_THRESHOLDS[mid - 1] <= damage) lo = mid;
    else hi = mid - 1;
  }
  if (lo < TALENT_THRESHOLDS.length) return lo;
  let k = Math.max(lo, Math.floor(Math.sqrt(damage / 100)));
  while (talentThreshold(k + 1) <= damage) k++;
  while (k > lo && talentThreshold(k) > damage) k--;
  return k;
}

/* ---------------- дорожка талантов ---------------- */
/*
 * Одна общая дорожка: остановки идут одна за другой, следующая открывается, когда предыдущая прокачана до конца.
 * Нарисована блоками (TALENT_BLOCKS): сначала три главных оружия (клавиатура, видеокарта, Rug Pull Gun) — урон и крит,
 * потом понемногу всё остальное — бицуха, лимит энергии, часы, кулак, свеча, мышь; в конце — Сила крита II у всех.
 * Бицуха +1 за уровень (всего 100), лимит энергии +1 (всего 50), Часы +1 минута к бою с боссом (всего 45),
 * Крит +1% шанса крита этому оружию (всего 15% на оружие); общий шанс крита — не больше 51%.
 * Урон: +N за уровень (N — шаг этого оружия), Сила крита: +5% (I) и +7,5% (II).
 * Сброс всех талантов — за 5 USD: потраченные таланты возвращаются.
 */
export type TalentKind = "dmg" | "crit" | "chance" | "biceps" | "energy" | "clock";
export interface TalentStop {
  /** unique key: `${target}:${branch}` */
  key: string;
  /** a weapon id, or "_biceps" / "_energy" / "_clock" */
  target: string;
  branch: string;
  kind: TalentKind;
  name: string;
  per: number;
  max: number;
  cost: number;
}
/** damage added by one level of the damage upgrades of each weapon */
export const TALENT_DMG_STEP: Record<string, number> = { fist: 1, mouse: 2, "red-candle": 3, keyboard: 3, gpu: 5, "rug-pull-gun": 20 };
/** every weapon is on the path, the fist too (in this order) */
export const TALENT_WEAPONS = WEAPONS.map((w) => w.id);
/** the crit chance never goes above this, whatever gives it */
export const CRIT_CHANCE_CAP = 0.51;
export const EXTRA_NAMES: Record<string, string> = { _biceps: "Бицуха", _energy: "Лимит энергии", _clock: "Часы" };

const stop = (target: string, branch: string, kind: TalentKind, name: string, per: number, max: number, cost: number): TalentStop =>
  ({ key: `${target}:${branch}`, target, branch, kind, name, per, max, cost });
const extras = (n: 1 | 2 | 3, biceps: number, energy: number, clock: number) => {
  const r = ["", "I", "II", "III"][n];
  return [
    stop("_biceps", `s${n}`, "biceps", `Бицуха ${r}`, 1, biceps, 1),
    stop("_energy", `s${n}`, "energy", `Лимит энергии ${r}`, 1, energy, 1),
    stop("_clock", `s${n}`, "clock", `Часы ${r}`, 1, clock, 1),
  ];
};
const each = (f: (w: string) => TalentStop) => TALENT_WEAPONS.map(f);
const dmg = (b: "n1" | "n3", name: string, max: number, cost: number) => each((w) => stop(w, b, "dmg", name, TALENT_DMG_STEP[w] ?? 1, max, cost));
const power = (b: "n2" | "n4", name: string, per: number, max: number, cost: number) => each((w) => stop(w, b, "crit", name, per, max, cost));
const chance = (n: 1 | 2 | 3) => each((w) => stop(w, `c${n}`, "chance", `Крит ${["", "I", "II", "III"][n]}`, 0.01, 5, 1));

/** every stop of the path (the order is the blocks' below) */
const ALL_STOPS: TalentStop[] = [
  ...extras(1, 30, 15, 15),
  ...dmg("n1", "Урон", 10, 1),
  ...chance(1),
  ...power("n2", "Сила крита", 0.05, 10, 1),
  ...extras(2, 30, 15, 15),
  ...chance(2),
  ...dmg("n3", "Урон II", 20, 2),
  ...extras(3, 40, 20, 15),
  ...chance(3),
  ...power("n4", "Сила крита II", 0.075, 20, 2),
];

/*
 * The path drawn as blocks, top to bottom (screens/talents.tsx): panels with a meme hero on the right and the stops in
 * a grid on the left (arrows from one to the next), rows of single stops between them. The three main weapons go first
 * (keyboard, GPU, Rug Pull Gun), then a little of everything: biceps, energy, the clock, the fist, the candle, the mouse.
 */
export interface TalentCell { key: string; col: number; row: number }
export interface TalentBlock { id: string; title: string; hero?: string; skin: "paper" | "metal" | "none"; cells: TalentCell[] }
const MAIN = ["keyboard", "gpu", "rug-pull-gun"];
const MINOR = ["fist", "red-candle", "mouse"];
const columns = (ws: string[], top: string, bottom: string): TalentCell[] =>
  ws.flatMap((w, i) => [{ key: `${w}:${top}`, col: i, row: 0 }, { key: `${w}:${bottom}`, col: i, row: 1 }]);
const rows = (...lines: string[][]): TalentCell[] => lines.flatMap((l, r) => l.map((key, c) => ({ key, col: c, row: r })));
/** six stops in a loop: along the top row, then back along the bottom one */
const loop = (keys: string[]): TalentCell[] => keys.map((key, i) => ({ key, col: i < 3 ? i : 5 - i, row: i < 3 ? 0 : 1 }));
const of = (ws: string[], b: string) => ws.map((w) => `${w}:${b}`);
export const TALENT_BLOCKS: TalentBlock[] = [
  { id: "spec", title: "Специализация в оружии", hero: "hero-pepe-hacker", skin: "paper", cells: columns(MAIN, "n1", "c1") },
  { id: "base", title: "Основа", skin: "none", cells: rows(of(["_biceps", "_energy", "_clock"], "s1"), of(MINOR, "n1")) },
  { id: "power", title: "Сила удара", hero: "hero-chad", skin: "metal", cells: columns(MAIN, "n2", "n3") },
  { id: "minor", title: "Кулак, свеча и мышь", skin: "none", cells: rows(of(MINOR, "c1"), of(MINOR, "n2")) },
  { id: "stamina", title: "Выносливость", hero: "hero-wojak", skin: "paper", cells: [{ key: "_biceps:s2", col: 0, row: 0 }, { key: "_energy:s2", col: 1, row: 0 }, { key: "_clock:s2", col: 1, row: 1 }] },
  { id: "aim", title: "Меткость", hero: "hero-pepe-sniper", skin: "metal", cells: columns(MAIN, "c2", "c3") },
  { id: "finish", title: "Добивание", skin: "none", cells: rows(of(MINOR, "n3"), of(MINOR, "c2")) },
  { id: "last", title: "Последний рубеж", hero: "hero-doge", skin: "paper", cells: loop([...of(["_biceps", "_energy", "_clock"], "s3"), ...of(MINOR, "c3")]) },
  { id: "master", title: "Мастер крита", hero: "hero-chad-gold", skin: "metal", cells: loop(of(["fist", "mouse", "red-candle", "keyboard", "gpu", "rug-pull-gun"], "n4")) },
];
const BY_KEY = new Map(ALL_STOPS.map((x) => [x.key, x]));
export const TALENT_PATH: TalentStop[] = TALENT_BLOCKS.flatMap((b) => b.cells.map((c) => BY_KEY.get(c.key)!));
/** the picture of a stop (public/assets/talents/<name>.webp): the weapon's damage / crit chance / crit power, or biceps, energy, clock */
export function talentArt(x: TalentStop): string {
  if (x.target.startsWith("_")) return x.target.slice(1);
  return `${x.target}-${x.kind === "dmg" ? "dmg" : x.kind === "chance" ? "chance" : "crit"}`;
}
export const talentStop = (target: string, branch: string) => TALENT_PATH.find((s) => s.target === target && s.branch === branch);
/** resetting all talents (they all come back) */
export const TALENT_RESET_PRICE = { currency: "USD" as const, amount: 5 };

/** levels the player has: target → branch → level */
export type WeaponTalents = Record<string, Partial<Record<string, number>>>;
export const stopLevel = (t: WeaponTalents, s: TalentStop) => Math.min(t[s.target]?.[s.branch] ?? 0, s.max);
/** the index of the stop being filled now (the first not full one); TALENT_PATH.length when all are done */
export function currentStop(t: WeaponTalents): number {
  const i = TALENT_PATH.findIndex((s) => stopLevel(t, s) < s.max);
  return i < 0 ? TALENT_PATH.length : i;
}
/** a stop can be levelled once every stop before it is full */
export const stopOpen = (t: WeaponTalents, s: TalentStop) => TALENT_PATH.indexOf(s) <= currentStop(t);
/** talents spent (what a reset gives back) */
export function talentsSpent(t: WeaponTalents): number {
  return TALENT_PATH.reduce((sum, s) => sum + stopLevel(t, s) * s.cost, 0);
}
/** what the talents give one weapon: flat damage added to the base, crit power and crit chance */
export function weaponTalentBonus(t: WeaponTalents, weapon: string): { flat: number; critDamage: number; critChance: number } {
  let flat = 0, critDamage = 0, critChance = 0;
  for (const s of TALENT_PATH) {
    if (s.target !== weapon) continue;
    const l = stopLevel(t, s);
    if (s.kind === "dmg") flat += l * s.per;
    else if (s.kind === "crit") critDamage += l * s.per;
    else if (s.kind === "chance") critChance += l * s.per;
  }
  return { flat, critDamage: Math.round(critDamage * 1000) / 1000, critChance: Math.round(critChance * 1000) / 1000 };
}
/** the player's own talents: biceps, energy limit, minutes added to a boss fight */
export function talentExtras(t: WeaponTalents): { biceps: number; energy: number; clockMin: number } {
  const sum = (k: TalentKind) => TALENT_PATH.filter((s) => s.kind === k).reduce((n, s) => n + stopLevel(t, s) * s.per, 0);
  return { biceps: sum("biceps"), energy: sum("energy"), clockMin: sum("clock") };
}
/** the whole crit chance of a weapon: the home's plus its talents, never above CRIT_CHANCE_CAP */
export const critChanceOf = (home: number, talent: number) => Math.min(CRIT_CHANCE_CAP, home + talent);
