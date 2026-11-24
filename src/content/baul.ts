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

/** the pool of one opening: base amounts at level 1, × BAUL_GROWTH per level, ±50% at random; `from` — the first level */
const POOL: { kind: "xp" | "cur" | "item"; id: string; base: number; from?: number }[] = [
  { kind: "xp", id: "xp", base: 150 },
  { kind: "cur", id: "PAP", base: 400 },
  { kind: "cur", id: "RUB", base: 15 },
  { kind: "cur", id: "TOOTH", base: 60 },
  { kind: "cur", id: "TOKEN", base: 1, from: 3 },
  { kind: "item", id: "keyboard", base: 3 },
  { kind: "item", id: "gpu", base: 2, from: 2 },
  { kind: "item", id: "rug-pull-gun", base: 1, from: 4 },
  { kind: "item", id: "fortune-ticket", base: 1, from: 6 },
];
export const BAUL_GROWTH = 1.17;
/** keys of the bosses from Князь on (the user): the boss's key joins the pool from this level */
export const BAUL_KEYS: { boss: string; from: number }[] = [
  { boss: "knyaz", from: 8 }, { boss: "vadim", from: 12 }, { boss: "botsman", from: 16 }, { boss: "utilizator", from: 20 }, { boss: "fokus", from: 25 },
];

/** one opening's pack at `level` (without the tattoo): 3 + level/4 kinds of the pool, and with a chance a key */
export function rollBaulPack(level: number, rng: () => number): Reward {
  const lv = Math.max(1, level);
  const grow = Math.pow(BAUL_GROWTH, lv - 1);
  const pool = POOL.filter((p) => lv >= (p.from ?? 1));
  const n = Math.min(pool.length, 3 + Math.floor(lv / 4));
  const pick = [...pool];
  for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
  const out: Reward = {};
  for (const p of pick.slice(0, n)) {
    const qty = Math.max(1, Math.round(p.base * grow * (0.5 + rng())));
    if (p.kind === "xp") out.xp = qty;
    else if (p.kind === "cur") out.currencies = { ...out.currencies, [p.id]: qty };
    else out.items = [...(out.items ?? []), { id: p.id, qty }];
  }
  const keys = BAUL_KEYS.filter((k) => lv >= k.from && BOSSES.some((b) => b.id === k.boss));
  if (keys.length && rng() < 0.35 + lv / 100) {
    const k = keys[Math.floor(rng() * keys.length) % keys.length];
    out.items = [...(out.items ?? []), { id: keyId(k.boss), qty: 1 + (rng() < 0.25 ? 1 : 0) }];
  }
  return out;
}
