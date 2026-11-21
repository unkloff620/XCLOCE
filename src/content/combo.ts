import type { Reward } from "./rewards.ts";
import { STASH_SETS_ORDERED } from "./stashes.ts";
import { onePart } from "./craft-drops.ts";

/*
 * «Комбо» (the user 2026-11-21): a hidden sequence of hits on a boss, to be guessed in a fight. Before the fight the
 * player picks the fight mode and then the combo mode; every hit is checked against the next step. Right — +1; wrong —
 * now and then (COMBO_KEEP) the progress stays, mostly it falls to zero. The sequence is one for everybody (players
 * may tell each other), its own for every boss and combo mode, and it changes every day at 00:00 Moscow time.
 * Done — the payout (authority, money, нычки, parts, weapons by the mode) is taken with «Забрать».
 */

export type ComboMode = "pacan" | "blat" | "avtor";
export const COMBO_MODES: { id: ComboMode; name: string; length: number }[] = [
  { id: "pacan", name: "Пацанский", length: 6 },
  { id: "blat", name: "Блатной", length: 10 },
  { id: "avtor", name: "Авторитетный", length: 16 },
];
export const comboMode = (id: string | null | undefined) => COMBO_MODES.find((m) => m.id === id) ?? null;

/** the names of the hits (the admin's «Комбо» tab) */
export const COMBO_HIT_NAMES: Record<string, string> = { fist: "Кулак", mouse: "Глаза", "red-candle": "Пинок", bat: "Бита", keyboard: "Нож", gpu: "Пистолет", "rug-pull-gun": "Автомат" };
/** the free hits: кулак, тычок в глаза, пинок */
export const COMBO_FREE = ["fist", "mouse", "red-candle"];
/** the bat: in «Блатной» and «Авторитетный» only */
export const COMBO_BAT = "bat";
/** a wrong hit keeps the progress this often */
export const COMBO_KEEP = 0.1;
/** «Блатной» and «Авторитетный»: each weapon (нож, пистолет, автомат) is in the sequence this many times — never more
 *  than the payout gives back (the user 2026-11-21); «Пацанский» — the hand hits only (кулак, глаза, пинок) */
export const COMBO_WEAPON_HITS: [number, number] = [1, 2];
export const COMBO_WEAPONS = ["keyboard", "gpu", "rug-pull-gun"];

/** the weak bosses (before Гаркуша) have no combo (the user 2026-11-21) */
export const NO_COMBO = new Set(["datsik", "kedr", "mugo"]);
export const hasCombo = (bossId: string) => !NO_COMBO.has(bossId);

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
/** a small seeded random (mulberry32) */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * the day's sequence of a boss in a combo mode (`day` — the Moscow day, YYYY-MM-DD). `salt` is the server's secret
 * (config «combo.secret», systems/combo.ts): without it this code in the app's bundle tells nothing.
 */
export function comboSequence(day: string, bossId: string, mode: ComboMode, salt = ""): string[] {
  const def = comboMode(mode)!;
  const rnd = seeded(hash(`combo:${salt}:${day}:${bossId}:${mode}`));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length) % xs.length];
  const out: (string | null)[] = Array(def.length).fill(null);
  // the weapons first, each 1–2 times, on free places
  if (mode !== "pacan") {
    const [lo, hi] = COMBO_WEAPON_HITS;
    for (const w of COMBO_WEAPONS) {
      for (let k = lo + Math.floor(rnd() * (hi - lo + 1)); k > 0; k--) {
        const free = out.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
        if (free.length) out[pick(free)] = w;
      }
    }
  }
  // the rest: the hand hits (and the bat, but not in «Пацанский»), never three of the same in a row
  const pool = mode === "pacan" ? COMBO_FREE : [...COMBO_FREE, COMBO_BAT];
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue;
    let h = pick(pool);
    if (i >= 2 && out[i - 1] === h && out[i - 2] === h) h = pool[(pool.indexOf(h) + 1) % pool.length];
    out[i] = h;
  }
  return out as string[];
}

/** the payout of a combo mode: [min, max] of each (the user's table) */
export const COMBO_PAYOUT: Record<ComboMode, { xp: [number, number]; PAP: [number, number]; RUB?: number; TOOTH?: [number, number]; stash: [number, number]; parts: [number, number]; keyboard: [number, number]; gpu: [number, number]; rifle: [number, number] }> = {
  pacan: { xp: [800, 1400], PAP: [400, 700], stash: [1, 2], parts: [1, 2], keyboard: [1, 3], gpu: [1, 2], rifle: [1, 2] },
  blat: { xp: [1500, 2500], PAP: [800, 1700], RUB: 3, stash: [1, 2], parts: [3, 5], keyboard: [2, 4], gpu: [3, 4], rifle: [2, 3] },
  avtor: { xp: [2600, 3700], PAP: [1800, 2700], RUB: 12, TOOTH: [800, 1300], stash: [25, 35], parts: [5, 8], keyboard: [5, 9], gpu: [4, 8], rifle: [4, 7] },
};
const STASH_ITEMS = STASH_SETS_ORDERED.flatMap((s) => s.items.map((i) => i.id));

/** the payout, rolled once when the combo is done (kept until «Забрать») */
export function rollComboReward(mode: ComboMode, rng: () => number): Reward {
  const p = COMBO_PAYOUT[mode];
  const between = ([a, b]: [number, number]) => a + (Math.floor(rng() * (b - a + 1)) % (b - a + 1));
  const items = new Map<string, number>();
  const add = (id: string, n: number) => n > 0 && items.set(id, (items.get(id) ?? 0) + n);
  // нычки: different ones while there are
  const stash = between(p.stash);
  const left = STASH_ITEMS.slice();
  for (let i = 0; i < stash; i++) {
    const k = Math.floor(rng() * left.length) % Math.max(1, left.length);
    add(left.length ? left.splice(k, 1)[0] : STASH_ITEMS[k % STASH_ITEMS.length], 1);
  }
  for (let i = 0, n = between(p.parts); i < n; i++) add(onePart(rng, "common"), 1);
  add("keyboard", between(p.keyboard));
  add("gpu", between(p.gpu));
  add("rug-pull-gun", between(p.rifle));
  return {
    xp: between(p.xp),
    currencies: { PAP: between(p.PAP), ...(p.RUB ? { RUB: p.RUB } : {}), ...(p.TOOTH ? { TOOTH: between(p.TOOTH) } : {}) },
    items: [...items].map(([id, qty]) => ({ id, qty })),
  };
}
