/*
 * «Бандитский фарт» (the user 2026-11-26): the yard's slot machine for roubles, each player on his own. 5 reels × 4 rows,
 * paid «by ways»: a symbol on reels 1, 2, 3… in a row from the left (anywhere on each reel) pays its 3/4/5 price ×
 * the number of such ways × the bet. A wild reel (reels 2–4): the bandit standing the whole reel (4 cells), standing in
 * for every symbol but the bell, with a multiplier; all the multipliers on the screen add up and multiply the whole
 * spin's win. 3+ bells anywhere: free spins at the same bet (wild reels fall oftener in them).
 * The rouble has no kopecks: a spin pays whole roubles, the kopecks left over wait for the player's next win.
 */
export const BANDIT_ROWS = 4;
export const BANDIT_REELS = 5;
export const BANDIT_BET_MIN = 1;
export const BANDIT_BET_MAX = 10;

export type BanditSym = "money" | "ring" | "chain" | "raven" | "cap" | "revolver" | "dice" | "horseshoe" | "a" | "k" | "q" | "j" | "ten" | "bell";
/** a cell of the screen: a symbol, or «W» — a part of a wild reel */
export type BanditCell = BanditSym | "W";

export interface BanditSymDef { id: BanditSym; name: string; weight: number; pay: [number, number, number] }
/** the price of 3 / 4 / 5 in a row, × the bet (before BANDIT_SCALE); the weight — how often it falls in a cell */
export const BANDIT_SYMS: BanditSymDef[] = [
  { id: "money", name: "Пачка денег", weight: 3, pay: [1, 2.5, 5] },
  { id: "ring", name: "Печатка", weight: 4, pay: [0.8, 2, 4] },
  { id: "chain", name: "Цепь", weight: 5, pay: [0.6, 1.5, 3] },
  { id: "raven", name: "Ворон", weight: 6, pay: [0.5, 1.2, 2.5] },
  { id: "cap", name: "Кепка", weight: 7, pay: [0.4, 1, 2] },
  { id: "revolver", name: "Револьвер", weight: 8, pay: [0.3, 0.8, 1.5] },
  { id: "dice", name: "Кости", weight: 9, pay: [0.25, 0.6, 1.2] },
  { id: "horseshoe", name: "Подкова", weight: 9, pay: [0.25, 0.6, 1.2] },
  { id: "a", name: "Туз", weight: 11, pay: [0.15, 0.4, 0.8] },
  { id: "k", name: "Король", weight: 11, pay: [0.15, 0.4, 0.8] },
  { id: "q", name: "Дама", weight: 12, pay: [0.1, 0.25, 0.5] },
  { id: "j", name: "Валет", weight: 12, pay: [0.1, 0.25, 0.5] },
  { id: "ten", name: "Десятка", weight: 12, pay: [0.1, 0.25, 0.5] },
  { id: "bell", name: "Колокол", weight: 2.5, pay: [2, 5, 20] },
];
/** all the prices × this: tuned so the machine gives back about BANDIT_RTP of what is bet (tests/bandit.test.ts) */
export const BANDIT_SCALE = 0.27;
export const BANDIT_RTP = 0.94;
/** the wild reel: the chance per reel 2–4 (in the free spins higher), its multiplier by weight */
export const BANDIT_WILD = { reels: [1, 2, 3], chance: 0.045, freeChance: 0.13, mult: [[2, 40], [3, 25], [5, 20], [10, 10], [25, 5]] as [number, number][] };
/** a spin never pays more than this × the bet */
export const BANDIT_MAX_X = 2000;
/** bells anywhere → free spins */
export const BANDIT_FREE: Record<number, number> = { 3: 10, 4: 12, 5: 15 };

export const banditSym = (id: string) => BANDIT_SYMS.find((s) => s.id === id);

export interface BanditSpin {
  /** reels[r][row] */
  reels: BanditCell[][];
  /** the wild reels: reel index → multiplier */
  wilds: Record<number, number>;
  /** the wins by ways: the symbol, how many reels in a row, the ways, the roubles before the multiplier */
  wins: { sym: BanditSym; n: number; ways: number; pay: number }[];
  /** the bells' own pay (× the bet already), not multiplied */
  bells: number;
  mult: number;
  /** the spin's win, kopecks and all (the server keeps the kopecks for the player's next win: bandit_state.carry) */
  raw: number;
  /** the spin's win in whole roubles (without the kept kopecks) */
  win: number;
  /** free spins this spin gives */
  free: number;
}

const pick = <T,>(items: [T, number][], rng: () => number): T => {
  const sum = items.reduce((s, [, w]) => s + w, 0);
  let x = rng() * sum;
  for (const [v, w] of items) if ((x -= w) < 0) return v;
  return items[items.length - 1][0];
};
const CELL: [BanditSym, number][] = BANDIT_SYMS.map((s) => [s.id, s.weight]);

/** one spin's screen and its win (pure: the server and the tests share it) */
export function banditSpin(bet: number, rng: () => number, free = false): BanditSpin {
  const wilds: Record<number, number> = {};
  const reels: BanditCell[][] = [];
  for (let r = 0; r < BANDIT_REELS; r++) {
    if (BANDIT_WILD.reels.includes(r) && rng() < (free ? BANDIT_WILD.freeChance : BANDIT_WILD.chance)) {
      wilds[r] = pick(BANDIT_WILD.mult, rng);
      reels.push(Array(BANDIT_ROWS).fill("W"));
      continue;
    }
    // a bell at most once a reel
    const col: BanditCell[] = [];
    for (let i = 0; i < BANDIT_ROWS; i++) {
      let s = pick(CELL, rng);
      while (s === "bell" && col.includes("bell")) s = pick(CELL, rng);
      col.push(s);
    }
    reels.push(col);
  }
  return banditPay(reels, wilds, bet);
}

/** the win of a screen */
export function banditPay(reels: BanditCell[][], wilds: Record<number, number>, bet: number): BanditSpin {
  const wins: BanditSpin["wins"] = [];
  for (const s of BANDIT_SYMS) {
    if (s.id === "bell") continue;
    let ways = 1, n = 0;
    for (let r = 0; r < BANDIT_REELS; r++) {
      const c = reels[r].filter((x) => x === s.id || x === "W").length;
      if (!c) break;
      ways *= c; n++;
    }
    // a run of wilds alone with no symbol of its own pays nothing: the first reel never has wilds
    if (n >= 3) wins.push({ sym: s.id, n, ways, pay: s.pay[n - 3] * BANDIT_SCALE * ways * bet });
  }
  const nb = reels.flat().filter((x) => x === "bell").length;
  const bellDef = banditSym("bell")!;
  const bells = nb >= 3 ? bellDef.pay[Math.min(5, nb) - 3] * bet : 0;
  const mult = Object.values(wilds).reduce((a, b) => a + b, 0) || 1;
  const line = wins.reduce((a, w) => a + w.pay, 0);
  const raw = Math.min(BANDIT_MAX_X * bet, line * mult + bells);
  return { reels, wilds, wins, bells, mult, raw, win: Math.floor(raw), free: BANDIT_FREE[Math.min(5, nb)] ?? 0 };
}
