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

/* ---------------- дерево талантов оружия ---------------- */
/*
 * У каждого оружия, даже у кулака, своя ветка из четырёх улучшений, одно под другим. Следующее открывается,
 * когда предыдущее прокачано до конца:
 *   1. Урон +N за уровень, 10 уровней, по 1 таланту
 *   2. Сила крита +5% за уровень, 10 уровней, по 1 таланту
 *   3. Урон +N за уровень, 20 уровней, по 2 таланта
 *   4. Сила крита +7,5% за уровень, 20 уровней, по 2 таланта
 * Итого на оружие: +30·N урона и +200% к силе крита за 100 талантов. N — шаг урона этого оружия (≈ 1/12 базового урона).
 * Сброс всех талантов — за 5 USD: потраченные таланты возвращаются.
 */
export type TalentBranch = "n1" | "n2" | "n3" | "n4";
export interface TalentNode { id: TalentBranch; kind: "dmg" | "crit"; name: string; per: number; max: number; cost: number }
/** damage added by one level of the damage upgrades of each weapon */
export const TALENT_DMG_STEP: Record<string, number> = { fist: 1, mouse: 2, "red-candle": 3, keyboard: 3, gpu: 5, "rug-pull-gun": 20 };
export function talentTree(weapon: string): TalentNode[] {
  const step = TALENT_DMG_STEP[weapon] ?? 1;
  return [
    { id: "n1", kind: "dmg", name: "Урон", per: step, max: 10, cost: 1 },
    { id: "n2", kind: "crit", name: "Сила крита", per: 0.05, max: 10, cost: 1 },
    { id: "n3", kind: "dmg", name: "Урон II", per: step, max: 20, cost: 2 },
    { id: "n4", kind: "crit", name: "Сила крита II", per: 0.075, max: 20, cost: 2 },
  ];
}
export const TALENT_NODE_IDS: TalentBranch[] = ["n1", "n2", "n3", "n4"];
/** every weapon has its own tree, the fist too */
export const TALENT_WEAPONS = WEAPONS.map((w) => w.id);
/** resetting all talents (they all come back) */
export const TALENT_RESET_PRICE = { currency: "USD" as const, amount: 5 };

/** levels of the player's weapon talents: weapon → upgrade → level */
export type WeaponTalents = Record<string, Partial<Record<TalentBranch, number>>>;
/** an upgrade can be bought once the one above it is full */
export function nodeOpen(levels: Partial<Record<TalentBranch, number>>, weapon: string, node: TalentBranch): boolean {
  const tree = talentTree(weapon);
  const i = tree.findIndex((n) => n.id === node);
  if (i <= 0) return i === 0;
  return (levels[tree[i - 1].id] ?? 0) >= tree[i - 1].max;
}
/** talents spent on all the upgrades (what a reset gives back) */
export function talentsSpent(t: WeaponTalents): number {
  let sum = 0;
  for (const [w, lv] of Object.entries(t)) for (const n of talentTree(w)) sum += Math.min(lv[n.id] ?? 0, n.max) * n.cost;
  return sum;
}
/** the bonus the talents give one weapon: flat damage added to the base, and crit power */
export function weaponTalentBonus(t: WeaponTalents, weapon: string): { flat: number; critDamage: number } {
  const lv = t[weapon] ?? {};
  let flat = 0, critDamage = 0;
  for (const n of talentTree(weapon)) {
    const l = Math.min(lv[n.id] ?? 0, n.max);
    if (n.kind === "dmg") flat += l * n.per;
    else critDamage += l * n.per;
  }
  return { flat, critDamage: Math.round(critDamage * 1000) / 1000 };
}
