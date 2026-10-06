/*
 * Таланты.
 * Даются за урон по боссам за всё время игры: счётчик не сгорает после боя — следующий бой продолжает набивать
 * его с того места, где остановился прошлый. 1-й талант — за 100 урона, 100-й — за 1 000 000; пороги между ними
 * идут примерно как 100·k², но не ровно (где-то чуть раньше, где-то позже). После 100-го — ровно 100·k².
 * Тратятся в окне талантов (системник в комнате): у каждого оружия, даже у кулака, две ветки — урон и сила крита.
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

/* ---------------- ветки оружия ---------------- */

export type TalentBranch = "dmg" | "crit";
export interface BranchDef { id: TalentBranch; name: string; short: string; perLevel: number; maxLevel: number }
/** +6% damage of that weapon per level; +12% crit power of that weapon per level (crit chance comes from the room) */
export const TALENT_BRANCHES: BranchDef[] = [
  { id: "dmg", name: "Урон", short: "урон", perLevel: 0.06, maxLevel: 10 },
  { id: "crit", name: "Сила крита", short: "крит", perLevel: 0.12, maxLevel: 10 },
];
export const branchById = (id: string) => TALENT_BRANCHES.find((b) => b.id === id);
/** talents for level `level` (1-based) of a branch: 1,1,1,2,2,2,3,3,3,4 — 22 for a whole branch */
export const talentCost = (level: number) => Math.min(4, Math.ceil(level / 3));
/** every weapon has its own tree, the fist too */
export const TALENT_WEAPONS = WEAPONS.map((w) => w.id);

/** levels of the player's weapon talents: weapon → branch → level */
export type WeaponTalents = Record<string, Partial<Record<TalentBranch, number>>>;
/** the bonus the talents give one weapon */
export function weaponTalentBonus(t: WeaponTalents, weapon: string): { damage: number; critDamage: number } {
  const w = t[weapon] ?? {};
  const lv = (b: TalentBranch) => Math.min(w[b] ?? 0, branchById(b)!.maxLevel);
  return { damage: lv("dmg") * branchById("dmg")!.perLevel, critDamage: lv("crit") * branchById("crit")!.perLevel };
}
