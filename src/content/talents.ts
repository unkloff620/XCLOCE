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
 * Одна общая дорожка, нарисованная блоками (TALENT_BLOCKS) сверху вниз: следующий блок открывается, когда закрыт весь
 * предыдущий; внутри блока ячейка открывается, когда закрыта та, от которой к ней идёт стрелка.
 * Блоки и числа — таблица пользователя (2026-11-20):
 *  «Специализация в оружии»: нож +1 урона ×10 и +1% крита ×10; пистолет +1 ×20 и +1% ×10; автомат +1 ×10 и +1% ×10.
 *  «Основа»: бицуха +50 ×200; +1% крита кулаку, тычку в глаза, пинку — по 10.
 *  «Сила удара»: кулак, тычок в глаза, пинок — по +1 урона ×10 и −10 минут перезарядки ×10.
 *  «Новый удар»: удар битой (открывает биту) ×1, бите +1 урона ×10, +1% крита ×20, −10 минут перезарядки ×30.
 *  «Супер таланты»: +1 минута боя с боссом ×45, +1 к лимиту энергии ×40, автомату +10 урона ×10.
 *  «Увеличение урона»: ножу +1% крита ×10 и +1 урона ×100; пистолету +1% крита ×20 и +1 урона ×150.
 *  «Сила автомата»: +1% крита ×10, +10 урона ×10.   «Энергия»: +1 к лимиту энергии ×70.
 *  «Оружейник»: автомату +10 урона ×10 и +1% крита ×6, пистолету +10 урона ×10.
 *  «Тактика»: +1 минута боя ×48, +1 бой в день с каждым боссом ×2.
 *  «Военный»: пистолету +10 ×10, автомату +50 ×10, ножу +50 ×10, +2 минуты боя ×19.
 *  «Ярость»: +1 к лимиту энергии ×14, +2 минуты боя ×14, +0,3% крита всему оружию ×15.
 * Общий шанс крита — не больше 51%. Сброс всех талантов — за 5 ₽: потраченные таланты возвращаются.
 */
export type TalentKind = "dmg" | "crit" | "chance" | "chanceAll" | "cooldown" | "unlock" | "biceps" | "energy" | "clock" | "bosses";
export interface TalentStop {
  /** unique key: `${target}:${branch}` */
  key: string;
  /** a weapon id, or "_biceps" / "_energy" / "_clock" / "_bosses" / "_all" (every weapon) */
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
/** the crit hits ×1.5 (nothing in the talents adds to it now) — ×2 at most */
export const CRIT_MULT_MAX = 2;
/** the crit chance never goes above this, whatever gives it */
export const CRIT_CHANCE_CAP = 0.51;
export const EXTRA_NAMES: Record<string, string> = { _biceps: "Бицуха", _energy: "Лимит энергии", _clock: "Часы", _bosses: "Лимит боссов", _all: "Всё оружие" };
/** the weapon the «Удар битой» talent opens (content/items.ts BAT) */
export const BAT_ID = "bat";

const stop = (target: string, branch: string, kind: TalentKind, name: string, per: number, max: number, need = max): TalentStop =>
  ({ key: `${target}:${branch}`, target, branch, kind, name, per, max, need: Math.min(need, max), cost: 1 });
/** biceps per talent (only in «Основа») */
export const BICEPS_PER_TALENT = 50;
const dmg = (w: string, b: string, per: number, max: number, name = "Урон") => stop(w, b, "dmg", name, per, max);
const crit = (w: string, b: string, max: number, name = "Крит") => stop(w, b, "chance", name, 0.01, max);
const cd = (w: string, b: string, max: number) => stop(w, b, "cooldown", "Перезарядка", 10, max);

/** every stop of the path (the order is the blocks' below) */
const ALL_STOPS: TalentStop[] = [
  // «Специализация в оружии»
  dmg("keyboard", "n1", 1, 10), crit("keyboard", "c1", 10), dmg("gpu", "n1", 1, 20), crit("gpu", "c1", 10), dmg("rug-pull-gun", "n1", 1, 10), crit("rug-pull-gun", "c1", 10),
  // «Основа»: the biceps up to 200 levels, 10 are enough to go on — the rest is up to the player
  stop("_biceps", "s1", "biceps", "Бицуха", BICEPS_PER_TALENT, 200, 10), crit("fist", "c1", 10), crit("mouse", "c1", 10), crit("red-candle", "c1", 10),
  // «Сила удара»
  dmg("fist", "n1", 1, 10), cd("fist", "r1", 10), dmg("mouse", "n1", 1, 10), cd("mouse", "r1", 10), dmg("red-candle", "n1", 1, 10), cd("red-candle", "r1", 10),
  // «Новый удар»: the bat
  stop(BAT_ID, "u1", "unlock", "Удар битой", 1, 1), dmg(BAT_ID, "n1", 1, 10), crit(BAT_ID, "c1", 20), cd(BAT_ID, "r1", 30),
  // «Супер таланты»
  stop("_clock", "s1", "clock", "Часы", 1, 45), stop("_energy", "s1", "energy", "Лимит энергии", 1, 40), dmg("rug-pull-gun", "n2", 10, 10, "Урон II"),
  // «Увеличение урона»
  crit("keyboard", "c2", 10, "Крит II"), dmg("keyboard", "n2", 1, 100, "Урон II"), crit("gpu", "c2", 20, "Крит II"), dmg("gpu", "n2", 1, 150, "Урон II"),
  // «Сила автомата»
  crit("rug-pull-gun", "c2", 10, "Крит II"), dmg("rug-pull-gun", "n3", 10, 10, "Урон III"),
  // «Энергия»
  stop("_energy", "s2", "energy", "Лимит энергии II", 1, 70),
  // «Оружейник»
  dmg("rug-pull-gun", "n4", 10, 10, "Урон IV"), crit("rug-pull-gun", "c3", 6, "Крит III"), dmg("gpu", "n3", 10, 10, "Урон III"),
  // «Тактика»
  stop("_clock", "s2", "clock", "Часы II", 1, 48), stop("_bosses", "s1", "bosses", "Лимит боссов", 1, 2),
  // «Военный»
  dmg("gpu", "n4", 10, 10, "Урон IV"), dmg("rug-pull-gun", "n5", 50, 10, "Урон V"), dmg("keyboard", "n3", 50, 10, "Урон III"), stop("_clock", "s3", "clock", "Часы III", 2, 19),
  // «Ярость»
  stop("_energy", "s3", "energy", "Лимит энергии III", 1, 14), stop("_clock", "s4", "clock", "Часы IV", 2, 14), stop("_all", "c1", "chanceAll", "Крит всему оружию", 0.003, 15),
];

/*
 * The path drawn as blocks, top to bottom (screens/talents.tsx): panels with a meme hero on the right and the stops in
 * a grid on the left (arrows from one to the next), rows of single stops between them.
 */
/** `solo`: no arrow comes to it — it opens with its block */
export interface TalentCell { key: string; col: number; row: number; solo?: boolean }
export interface TalentBlock { id: string; title: string; hero?: string; skin: "paper" | "metal" | "none" | "fire"; cells: TalentCell[] }
const MAIN = ["keyboard", "gpu", "rug-pull-gun"];
const MINOR = ["fist", "mouse", "red-candle"];
const columns = (ws: string[], top: string, bottom: string): TalentCell[] =>
  ws.flatMap((w, i) => [{ key: `${w}:${top}`, col: i, row: 0 }, { key: `${w}:${bottom}`, col: i, row: 1 }]);
/** cells in a row, each its own (no arrows between them: every one opens with its block) */
const line = (keys: string[], row = 0): TalentCell[] => keys.map((key, col) => ({ key, col, row, solo: true }));
/** cells one after another along a row (an arrow from each to the next) */
const chain = (keys: string[]): TalentCell[] => keys.map((key, c) => ({ key, col: c, row: 0 }));
export const TALENT_BLOCKS: TalentBlock[] = [
  { id: "spec", title: "Специализация в оружии", hero: "hero-pepe-hacker", skin: "paper", cells: columns(MAIN, "n1", "c1") },
  { id: "base", title: "Основа", skin: "none", cells: [{ key: "_biceps:s1", col: 1, row: 0 }, ...line(MINOR.map((w) => `${w}:c1`), 1)] },
  { id: "power", title: "Сила удара", hero: "hero-chad", skin: "metal", cells: columns(MINOR, "n1", "r1") },
  { id: "bat", title: "Новый удар", hero: "hero-wojak", skin: "paper", cells: [{ key: "bat:u1", col: 0, row: 0 }, { key: "bat:n1", col: 1, row: 0 }, { key: "bat:c1", col: 1, row: 1 }, { key: "bat:r1", col: 0, row: 1 }] },
  { id: "super", title: "Супер таланты", hero: "hero-doge", skin: "metal", cells: line(["_clock:s1", "_energy:s1", "rug-pull-gun:n2"]) },
  { id: "dmg", title: "Увеличение урона", hero: "hero-pepe-sniper", skin: "paper", cells: columns(["keyboard", "gpu"], "c2", "n2") },
  { id: "rpg", title: "Сила автомата", skin: "none", cells: chain(["rug-pull-gun:c2", "rug-pull-gun:n3"]) },
  { id: "energy", title: "Энергия", skin: "none", cells: [{ key: "_energy:s2", col: 0, row: 0 }] },
  { id: "gunsmith", title: "Оружейник", hero: "hero-chad-gold", skin: "metal", cells: [{ key: "rug-pull-gun:n4", col: 0, row: 0 }, { key: "rug-pull-gun:c3", col: 0, row: 1 }, { key: "gpu:n3", col: 1, row: 0, solo: true }] },
  { id: "tactics", title: "Тактика", skin: "none", cells: line(["_clock:s2", "_bosses:s1"]) },
  { id: "military", title: "Военный", hero: "hero-chad", skin: "paper", cells: [...line(["gpu:n4", "rug-pull-gun:n5", "keyboard:n3"]), { key: "_clock:s3", col: 1, row: 1, solo: true }] },
  { id: "rage", title: "Ярость", hero: "hero-berserk", skin: "fire", cells: line(["_energy:s3", "_clock:s4", "_all:c1"]) },
];
const BY_KEY = new Map(ALL_STOPS.map((x) => [x.key, x]));
export const TALENT_PATH: TalentStop[] = TALENT_BLOCKS.flatMap((b) => b.cells.map((c) => BY_KEY.get(c.key)!));
/** the picture of a stop (public/assets/talents/<name>.webp): the weapon's damage / crit chance / crit power, or biceps, energy, clock */
export function talentArt(x: TalentStop): string {
  if (x.kind === "clock" && x.per > 1) return "clock-big";
  if (x.kind === "unlock") return "bat-unlock";
  if (x.kind === "cooldown") return x.target === BAT_ID ? "bat-cd" : "clock";
  if (x.kind === "chanceAll") return "crit-all";
  if (x.target.startsWith("_")) return x.target.slice(1);
  return `${x.target}-${x.kind === "dmg" ? "dmg" : "chance"}`;
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
  if (c.solo) return null;
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
/** what the talents give one weapon: flat damage added to the base, crit chance (its own and «всему оружию»), minutes
 *  off its reload (the free weapons); crit power stays 0 (no talent adds to it now) */
export function weaponTalentBonus(t: WeaponTalents, weapon: string): { flat: number; critDamage: number; critChance: number; cooldownMin: number } {
  let flat = 0, critChance = 0, cooldownMin = 0;
  for (const s of TALENT_PATH) {
    if (s.target !== weapon && s.target !== "_all") continue;
    const l = stopLevel(t, s);
    if (s.kind === "dmg") flat += l * s.per;
    else if (s.kind === "chance" || s.kind === "chanceAll") critChance += l * s.per;
    else if (s.kind === "cooldown") cooldownMin += l * s.per;
  }
  return { flat, critDamage: 0, critChance: Math.round(critChance * 10000) / 10000, cooldownMin };
}
/** a free weapon's reload after its talents: never shorter than 10 minutes */
export const reloadMin = (base: number, talentsOff: number) => Math.max(10, base - talentsOff);
/** the player's own talents: biceps, energy limit, minutes added to a boss fight */
export function talentExtras(t: WeaponTalents): { biceps: number; energy: number; clockMin: number; bossFights: number } {
  const sum = (k: TalentKind) => TALENT_PATH.filter((s) => s.kind === k).reduce((n, s) => n + stopLevel(t, s) * s.per, 0);
  return { biceps: sum("biceps"), energy: sum("energy"), clockMin: sum("clock"), bossFights: sum("bosses") };
}
/** the whole crit chance of a weapon: the home's plus its talents, never above CRIT_CHANCE_CAP */
export const critChanceOf = (home: number, talent: number) => Math.min(CRIT_CHANCE_CAP, home + talent);
