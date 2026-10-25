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
 * Одна общая дорожка, как задания в локации: остановки идут одна за другой, следующая открывается, когда предыдущая
 * прокачана до конца. Так таланты расходятся понемногу на всё, а не на одно оружие сразу:
 *   начало    — Бицуха I, Лимит энергии I, Часы I
 *   ступень 1 — Урон у каждого оружия (кулак → мышь → свеча → клавиатура → видеокарта → Rug Pull Gun), потом Крит I
 *               (шанс крита) у каждого, потом Сила крита у каждого
 *   середина  — Бицуха II, Лимит энергии II, Часы II, Крит II у каждого оружия
 *   ступень 2 — Урон II у каждого
 *   конец     — Бицуха III, Лимит энергии III, Часы III, Крит III у каждого
 *   финал     — Сила крита II у каждого, последняя — у Rug Pull Gun
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

export const TALENT_PATH: TalentStop[] = [
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
