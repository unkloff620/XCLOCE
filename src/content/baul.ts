/**
 * «Баул» (the user 2026-11-24): a progress of 30 levels fed by the points of boss wins (the stronger the boss and the mode,
 * the more points). The bag lies on the left of the shop's counter; one opening costs BAUL_PRICE слитков and gives a
 * random pack of rewards that grows with the level (keys from Князь's on), and maybe a tattoo:
 *  - sets 1–8: a chance from level 1 to 25 that grows with the level (mostly at 23–25), ≈ 8 040 слитков for all of them;
 *  - set 9 («Золото»): from level 26 on, on its own roll, ≈ 840 слитков for all of it.
 * Every new level gives one free opening (the «Красава!» window).
 */
import type { Reward } from "./rewards.ts";
import { BOSSES, keyId } from "./bosses.ts";
import { STASH_IDS } from "./stashes.ts";

export const BAUL_PRICE = 20;
export const BAUL_CUR = "GOLD" as const;

/** the points needed in all to reach level N (index N-1) — the user's table */
export const BAUL_TOTAL = [
  50, 150, 300, 500, 750, 1_050, 1_425, 1_925, 2_575, 3_375,
  4_375, 5_775, 7_575, 9_875, 12_875, 16_875, 22_375, 29_375, 38_375, 50_375,
  64_375, 81_375, 101_375, 123_375, 148_375, 176_375, 208_375, 245_375, 288_375, 338_375,
];
export const BAUL_MAX = BAUL_TOTAL.length;

export function baulLevel(points: number) {
  let level = 0;
  while (level < BAUL_MAX && points >= BAUL_TOTAL[level]) level++;
  const from = level ? BAUL_TOTAL[level - 1] : 0;
  const to = level < BAUL_MAX ? BAUL_TOTAL[level] : null;
  return { level, points, from, to };
}

/**
 * Points for a win (the user 2026-11-24): the boss's HP in the fight without its last five zeros, rounded, at least 1 —
 * Дацкоу 1 000 → 1, 150 000 → 2, Солнце 1 000 000 000 → 10 000 (the mode's HP: «Блатной» ×3, «Авторитетный» ×6).
 */
export const BAUL_HP_PER_POINT = 100_000;
export const baulPoints = (hp: number) => (hp > 0 ? Math.max(1, Math.round(hp / BAUL_HP_PER_POINT)) : 0);

/** the 9 tattoo sets of the bag (content/tattoos.ts, boss "baul"): the first 8 drop at levels 1–25, the 9th from 26 */
export const BAUL_SETS = ["baul-chelnok", "baul-etap", "baul-vokzal", "baul-tainik", "baul-dalnoboy", "baul-port", "baul-baraholka", "baul-sever"];
export const BAUL_GOLD_SET = "baul-zoloto";
export const BAUL_GOLD_FROM = 26;
/** the chance of a piece of sets 1–8 per opening: next to nothing low, mostly at 23–25 (0.42 at 25: ≈ 400 openings for 168 pieces) */
export const baulTattooChance = (level: number) => (level < 1 ? 0 : 0.42 * Math.pow(Math.min(level, 25) / 25, 4));
/** the chance of a piece of the 9th set per opening from level 26 (21 pieces ≈ 42 openings ≈ 840 слитков) */
export const BAUL_GOLD_CHANCE = 0.5;

/**
 * One opening (the user 2026-11-25): at level 30 every kind of the pool comes, each up to its MAX — one budget split at
 * random (fewer roubles — then more of something else: the shares are drawn, then scaled so they average BAUL_SHARE,
 * none over its max). Lower levels: the same × BAUL_GROWTH^(level − 30), a kind only from its `from` level.
 */
const POOL: { kind: "xp" | "cur" | "item" | "stash"; id: string; max: number; from?: number; /** at 30: from … to, at random (outside the budget split) */ range?: [number, number] }[] = [
  { kind: "xp", id: "xp", max: 280_205 },
  { kind: "cur", id: "RUB", max: 431 },
  { kind: "cur", id: "TOKEN", max: 162, from: 3 },
  { kind: "cur", id: "TOOTH", max: 19_125 },
  { kind: "item", id: "keyboard", max: 191 },
  // not in the user's list (my maxima): the papirosy, the guns, the wheel's tickets
  { kind: "cur", id: "PAP", max: 250_000 },
  { kind: "item", id: "gpu", max: 140, from: 2, range: [74, 140] },
  { kind: "item", id: "rug-pull-gun", max: 123, from: 4, range: [67, 123] },
  { kind: "item", id: "fortune-ticket", max: 5, from: 6 },
  { kind: "stash", id: "stash", max: 90, from: 5 },
  { kind: "item", id: "gold-nugget", max: 699, from: 10 },
  { kind: "item", id: "gold-ring", max: 210, from: 15 },
];
/** the average share of the max at level 30 */
export const BAUL_SHARE = 0.7;
export const BAUL_GROWTH = 1.2;
/** keys of the bosses from Князь on (the user): the boss's key joins from this level; at 30 — 4 or 5 of them, 6–9 each */
export const BAUL_KEYS: { boss: string; from: number }[] = [
  { boss: "knyaz", from: 8 }, { boss: "vadim", from: 12 }, { boss: "botsman", from: 16 }, { boss: "utilizator", from: 20 }, { boss: "fokus", from: 25 },
];

const shuffle = <T,>(a: T[], rng: () => number) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** one opening's pack at `level` (without the tattoo) */
export function rollBaulPack(level: number, rng: () => number): Reward {
  const lv = Math.max(1, Math.min(BAUL_MAX, level));
  const grow = Math.pow(BAUL_GROWTH, lv - BAUL_MAX);
  const pool = POOL.filter((p) => lv >= (p.from ?? 1));
  // the budget split (the kinds without a range): shares drawn, scaled to average BAUL_SHARE, none over 1
  const r = pool.map(() => 0.3 + rng() * 0.7);
  const split = pool.map((p, i) => (p.range ? 0 : r[i]));
  const k = (BAUL_SHARE * pool.filter((p) => !p.range).length) / split.reduce((a, b) => a + b, 0);
  const out: Reward = {};
  const items: { id: string; qty: number }[] = [];
  pool.forEach((p, i) => {
    const qty = p.range
      ? Math.max(1, Math.round((p.range[0] + rng() * (p.range[1] - p.range[0])) * grow))
      : Math.max(1, Math.round(p.max * Math.min(1, r[i] * k) * grow));
    if (p.kind === "xp") out.xp = qty;
    else if (p.kind === "cur") out.currencies = { ...out.currencies, [p.id]: qty };
    else if (p.kind === "stash") {
      // нычки: each one drawn at random from the whole list (the same may come twice)
      const got = new Map<string, number>();
      for (let j = 0; j < qty; j++) { const id = STASH_IDS[Math.floor(rng() * STASH_IDS.length) % STASH_IDS.length]; got.set(id, (got.get(id) ?? 0) + 1); }
      for (const [id, q] of got) items.push({ id, qty: q });
    } else items.push({ id: p.id, qty });
  });
  // the keys: at 30 — 4 or 5 bosses, 6–9 keys each; lower — fewer bosses and fewer keys
  const keys = shuffle(BAUL_KEYS.filter((x) => lv >= x.from && BOSSES.some((b) => b.id === x.boss)), rng);
  if (keys.length) {
    const nb = lv >= BAUL_MAX ? Math.min(keys.length, 4 + (rng() < 0.5 ? 1 : 0)) : Math.max(1, Math.round(keys.length * (0.5 + rng() * 0.5)));
    for (const x of keys.slice(0, nb)) items.push({ id: keyId(x.boss), qty: Math.max(1, Math.round((6 + Math.floor(rng() * 4)) * (lv / BAUL_MAX))) });
  }
  if (items.length) out.items = items;
  return out;
}
