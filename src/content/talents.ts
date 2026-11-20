/*
 * Таланты.
 * Даются за урон по боссам за всё время игры: счётчик не сгорает после боя — следующий бой продолжает набивать
 * его с того места, где остановился прошлый.
 * Кривая — таблица пользователя (2026-11-20), урон между отметками: до 1-го таланта 30, до 10-го всего 579, с 10-го
 * до 100-го 129 633, со 100-го до 250-го 2 012 331, с 250-го до 500-го 16 340 244, с 500-го до 750-го 478 079 531,
 * с 750-го до 1000-го 16 848 730 110 (с 0 до 1000 — 17 345 292 428). Внутри отрезка каждый следующий талант дороже
 * предыдущего в одно и то же число раз (оно подобрано так, чтобы отрезок сходился ровно); после 1000-го — с тем же шагом.
 * Тратятся в окне талантов (счётчик в бою, профиль, инвентарь): у каждого оружия, даже у кулака, две ветки — урон и сила крита.
 */
import { WEAPONS } from "./items.ts";

/** the user's marks: [talent, total damage for it] */
export const TALENT_MARKS: readonly [number, number][] = [
  [0, 0], [1, 30], [10, 579], [100, 130_212], [250, 2_142_543], [500, 18_482_787], [750, 496_562_318], [1000, 17_345_292_428],
];
/** after the 1000th talent: every next one dearer by the last stretch's rate (filled below) */
const TALENT_AFTER: { rate: number; last: number } = { rate: 1, last: 0 };
/** total damage for the k-th talent, k = 1…1000: the step costs grow geometrically inside each stretch, each stretch
 *  goes on from the last step of the one before and lands on its mark exactly */
export const TALENT_THRESHOLDS: readonly number[] = (() => {
  const cum = [0, TALENT_MARKS[1][1]];
  let last = TALENT_MARKS[1][1];
  let rate = 1;
  for (let i = 1; i + 1 < TALENT_MARKS.length; i++) {
    const [a, da] = TALENT_MARKS[i], [b, db] = TALENT_MARKS[i + 1];
    const n = b - a, S = db - da;
    const sum = (r: number) => { let t = 0, p = 1; for (let k = 1; k <= n; k++) { p *= r; t += p; } return last * t; };
    let lo = 0.5, hi = 3;
    for (let it = 0; it < 200; it++) { const m = (lo + hi) / 2; if (sum(m) > S) hi = m; else lo = m; }
    rate = (lo + hi) / 2;
    let c = last;
    for (let k = 0; k < n; k++) { c *= rate; cum.push(cum[cum.length - 1] + c); }
    cum[cum.length - 1] = db;
    last = c;
  }
  TALENT_AFTER.rate = rate;
  TALENT_AFTER.last = last;
  return cum.slice(1).map((v) => Math.round(v));
})();

/** total damage needed for the k-th talent (k ≥ 1) */
export function talentThreshold(k: number): number {
  if (k <= 0) return 0;
  const n = TALENT_THRESHOLDS.length;
  if (k <= n) return TALENT_THRESHOLDS[k - 1];
  const { rate, last } = TALENT_AFTER;
  const m = k - n;
  return Math.round(TALENT_THRESHOLDS[n - 1] + (last * rate * (Math.pow(rate, m) - 1)) / (rate - 1));
}

/** talents earned by `damage` dealt to bosses in total */
export function talentsForDamage(damage: number): number {
  const n = TALENT_THRESHOLDS.length;
  if (damage >= TALENT_THRESHOLDS[n - 1]) {
    let k = n;
    while (talentThreshold(k + 1) <= damage) k++;
    return k;
  }
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (TALENT_THRESHOLDS[mid - 1] <= damage) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/* ---------------- дорожка талантов ---------------- */
/*
 * Одна общая дорожка: остановки идут одна за другой, следующая открывается, когда предыдущая прокачана до конца.
 * Нарисована блоками (TALENT_BLOCKS): сначала три главных оружия (нож, пистолет, Rug Pull Gun) — урон и крит,
 * потом понемногу всё остальное — бицуха, лимит энергии, часы, кулак, свеча, мышь; в конце — Сила крита II у всех.
 * Бицуха +10 за уровень (только в «Основе», всего 1000), лимит энергии +1 (всего 50), Часы +1 минута к бою с боссом (I–III, всего 45),
 * Часы IV +3 минуты (15 уровней, ещё 45), Лимит боссов +1 бой в день с каждым боссом (всего +3), Урон III — остаток до 800 талантов,
 * Крит +1% шанса крита этому оружию (всего 15% на оружие); общий шанс крита — не больше 51%.
 * Урон: +N за уровень (N — шаг этого оружия), Сила крита: +2% (I) и +1,5% (II) за уровень — с ×1,5 до ×2 на максимуме.
 * Сброс всех талантов — за 5 ₽: потраченные таланты возвращаются.
 */
export type TalentKind = "dmg" | "crit" | "chance" | "biceps" | "energy" | "clock" | "bosses";
export interface TalentStop {
  /** unique key: `${target}:${branch}` */
  key: string;
  /** a weapon id, or "_biceps" / "_energy" / "_clock" / "_bosses" */
  target: string;
  branch: string;
  kind: TalentKind;
  name: string;
  per: number;
  max: number;
  /** levels that close the stop: the next ones open from here (the rest up to max is the player's own choice) */
  need: number;
  cost: number;
}
/** damage added by one level of the damage upgrades of each weapon */
export const TALENT_DMG_STEP: Record<string, number> = { fist: 1, mouse: 2, "red-candle": 3, keyboard: 3, gpu: 5, "rug-pull-gun": 20 };
/** every weapon is on the path, the fist too (in this order) */
export const TALENT_WEAPONS = WEAPONS.map((w) => w.id);
/** the crit hits ×1.5 at first; «Сила крита» I (+0.2) and II (+0.3) take it to ×2 at most — nothing else adds to it */
export const CRIT_MULT_MAX = 2;
/** the crit chance never goes above this, whatever gives it */
export const CRIT_CHANCE_CAP = 0.51;
export const EXTRA_NAMES: Record<string, string> = { _biceps: "Бицуха", _energy: "Лимит энергии", _clock: "Часы", _bosses: "Лимит боссов" };

const stop = (target: string, branch: string, kind: TalentKind, name: string, per: number, max: number, cost: number, need = max): TalentStop =>
  ({ key: `${target}:${branch}`, target, branch, kind, name, per, max, need: Math.min(need, max), cost });
/** biceps per talent: only in «Основа» (one stop, +10 a level) */
export const BICEPS_PER_TALENT = 10;
const extras = (n: 1 | 2 | 3, energy: number, clock: number) => {
  const r = ["", "I", "II", "III"][n];
  return [
    stop("_energy", `s${n}`, "energy", `Лимит энергии ${r}`, 1, energy, 1),
    stop("_clock", `s${n}`, "clock", `Часы ${r}`, 1, clock, 1),
  ];
};
/** «Урон III»: the rest of the 800 talents — the three main weapons 25 levels, the candle and the mouse 21, the fist 20 */
const DMG3_MAX: Record<string, number> = { keyboard: 25, gpu: 25, "rug-pull-gun": 25, "red-candle": 21, mouse: 21, fist: 20 };
const each = (f: (w: string) => TalentStop) => TALENT_WEAPONS.map(f);
const dmg = (b: "n1" | "n3", name: string, max: number, cost: number) => each((w) => stop(w, b, "dmg", name, TALENT_DMG_STEP[w] ?? 1, max, cost));
const power = (b: "n2" | "n4", name: string, per: number, max: number, cost: number) => each((w) => stop(w, b, "crit", name, per, max, cost));
const chance = (n: 1 | 2 | 3) => each((w) => stop(w, `c${n}`, "chance", `Крит ${["", "I", "II", "III"][n]}`, 0.01, 5, 1));

/** every stop of the path (the order is the blocks' below) */
const ALL_STOPS: TalentStop[] = [
  // «Бицуха»: +10 a level, up to 100 levels, but 10 are enough to go on — the rest is up to the player
  stop("_biceps", "s1", "biceps", "Бицуха", BICEPS_PER_TALENT, 100, 1, 10),
  ...extras(1, 15, 15),
  ...dmg("n1", "Урон", 10, 1),
  ...chance(1),
  ...power("n2", "Сила крита", 0.02, 10, 1),
  ...extras(2, 15, 15),
  // one more fight a day with every boss, up to +3
  stop("_bosses", "s1", "bosses", "Лимит боссов", 1, 3, 1),
  ...chance(2),
  ...dmg("n3", "Урон II", 20, 1),
  ...extras(3, 20, 15),
  // «Часы IV»: +3 minutes to a boss fight a level, 15 levels
  stop("_clock", "s4", "clock", "Часы IV", 3, 15, 1),
  ...chance(3),
  ...power("n4", "Сила крита II", 0.015, 20, 1),
  ...each((w) => stop(w, "n5", "dmg", "Урон III", TALENT_DMG_STEP[w] ?? 1, DMG3_MAX[w] ?? 20, 1)),
];

/*
 * The path drawn as blocks, top to bottom (screens/talents.tsx): panels with a meme hero on the right and the stops in
 * a grid on the left (arrows from one to the next), rows of single stops between them. The three main weapons go first
 * (keyboard, GPU, Rug Pull Gun), then a little of everything: biceps, energy, the clock, the fist, the candle, the mouse.
 */
export interface TalentCell { key: string; col: number; row: number }
export interface TalentBlock { id: string; title: string; hero?: string; skin: "paper" | "metal" | "none" | "fire"; cells: TalentCell[] }
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
  { id: "stamina", title: "Выносливость", hero: "hero-wojak", skin: "paper", cells: [{ key: "_energy:s2", col: 0, row: 0 }, { key: "_clock:s2", col: 0, row: 1 }] },
  { id: "bosses", title: "Лимит боссов", skin: "none", cells: [{ key: "_bosses:s1", col: 0, row: 0 }] },
  { id: "aim", title: "Меткость", hero: "hero-pepe-sniper", skin: "metal", cells: columns(MAIN, "c2", "c3") },
  { id: "finish", title: "Добивание", skin: "none", cells: rows(of(MINOR, "n3"), of(MINOR, "c2")) },
  { id: "last", title: "Последний рубеж", hero: "hero-doge", skin: "paper", cells: loop(["_clock:s4", ...of(["_energy", "_clock"], "s3"), ...of(MINOR, "c3")]) },
  { id: "master", title: "Мастер крита", hero: "hero-chad-gold", skin: "metal", cells: loop(of(["fist", "mouse", "red-candle", "keyboard", "gpu", "rug-pull-gun"], "n4")) },
  { id: "rage", title: "Ярость", hero: "hero-berserk", skin: "fire", cells: loop(of(["keyboard", "gpu", "rug-pull-gun", "mouse", "red-candle", "fist"], "n5")) },
];
const BY_KEY = new Map(ALL_STOPS.map((x) => [x.key, x]));
export const TALENT_PATH: TalentStop[] = TALENT_BLOCKS.flatMap((b) => b.cells.map((c) => BY_KEY.get(c.key)!));
/** the picture of a stop (public/assets/talents/<name>.webp): the weapon's damage / crit chance / crit power, or biceps, energy, clock */
export function talentArt(x: TalentStop): string {
  if (x.key === "_clock:s4") return "clock-big";
  if (x.target.startsWith("_")) return x.target.slice(1);
  return `${x.target}-${x.kind === "dmg" ? "dmg" : x.kind === "chance" ? "chance" : "crit"}`;
}
export const talentStop = (target: string, branch: string) => TALENT_PATH.find((s) => s.target === target && s.branch === branch);
/** resetting all talents (they all come back) */
export const TALENT_RESET_PRICE = { currency: "RUB" as const, amount: 5 };

/** levels the player has: target → branch → level */
export type WeaponTalents = Record<string, Partial<Record<string, number>>>;
export const stopLevel = (t: WeaponTalents, s: TalentStop) => Math.min(t[s.target]?.[s.branch] ?? 0, s.max);
/** a stop is closed when it has its `need` levels (its max for most) */
export const stopClosed = (t: WeaponTalents, s: TalentStop) => stopLevel(t, s) >= s.need;
const BLOCK_OF = new Map(TALENT_BLOCKS.flatMap((b, bi) => b.cells.map((c, k) => [c.key, { bi, k }] as const)));
/** the stop an arrow comes from inside its block (the cell before it, when it is the neighbour), or null */
export function stopBefore(s: TalentStop): TalentStop | null {
  const at = BLOCK_OF.get(s.key);
  if (!at || at.k === 0) return null;
  const cells = TALENT_BLOCKS[at.bi].cells, a = cells[at.k - 1], c = cells[at.k];
  const near = (a.col === c.col && a.row === c.row - 1) || (a.row === c.row && Math.abs(a.col - c.col) === 1);
  return near ? BY_KEY.get(a.key) ?? null : null;
}
/** a block is closed when every stop in it is */
export const blockClosed = (t: WeaponTalents, bi: number) => TALENT_BLOCKS[bi].cells.every((c) => stopClosed(t, BY_KEY.get(c.key)!));
/** a block opens when every block above it is closed */
export const blockOpen = (t: WeaponTalents, bi: number) => TALENT_BLOCKS.slice(0, bi).every((_, i) => blockClosed(t, i));
/** a stop can be levelled when its block is open and the stop its arrow comes from is closed (the tops of the columns — any order) */
export function stopOpen(t: WeaponTalents, s: TalentStop): boolean {
  const at = BLOCK_OF.get(s.key);
  if (!at || !blockOpen(t, at.bi)) return false;
  const before = stopBefore(s);
  return !before || stopClosed(t, before);
}
/** the stops that take a talent now (open and not full) */
export const openStops = (t: WeaponTalents) => TALENT_PATH.filter((s) => stopOpen(t, s) && stopLevel(t, s) < s.max);
/** the stop the path goes on with: the first open one that is not closed yet; then the first open one not full;
 * TALENT_PATH.length when there is none */
export function currentStop(t: WeaponTalents): number {
  let i = TALENT_PATH.findIndex((s) => stopOpen(t, s) && !stopClosed(t, s));
  if (i < 0) i = TALENT_PATH.findIndex((s) => stopOpen(t, s) && stopLevel(t, s) < s.max);
  return i < 0 ? TALENT_PATH.length : i;
}
/** «Автопрокачка» opens once «Специализация в оружии» and «Основа» are closed */
export const autoTalentsOpen = (t: WeaponTalents) => blockClosed(t, 0) && blockClosed(t, 1);
/** what the auto levelling puts the next talent in: the next stop to close (it never goes past `need` on its own) */
export function autoStop(t: WeaponTalents): TalentStop | null {
  return TALENT_PATH.find((s) => stopOpen(t, s) && !stopClosed(t, s)) ?? null;
}
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
export function talentExtras(t: WeaponTalents): { biceps: number; energy: number; clockMin: number; bossFights: number } {
  const sum = (k: TalentKind) => TALENT_PATH.filter((s) => s.kind === k).reduce((n, s) => n + stopLevel(t, s) * s.per, 0);
  return { biceps: sum("biceps"), energy: sum("energy"), clockMin: sum("clock"), bossFights: sum("bosses") };
}
/** the whole crit chance of a weapon: the home's plus its talents, never above CRIT_CHANCE_CAP */
export const critChanceOf = (home: number, talent: number) => Math.min(CRIT_CHANCE_CAP, home + talent);
