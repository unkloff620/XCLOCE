/*
 * «Бандитский фарт» (the user 2026-11-26): the yard's slot machine for roubles, each player on his own. 5 reels × 3 rows,
 * each row a line: a symbol on reels 1, 2… of the row from the left pays its 2/3/4/5 price × the bet (a pair too). A
 * wild reel (reels 2–4): the bandit standing the whole reel, standing in for every symbol but the bell and the revolver,
 * with a multiplier; all the multipliers on the screen add up and multiply the whole spin's win. 3+ bells anywhere: free
 * spins at the same bet (wild reels fall oftener in them). 3+ revolvers anywhere: the bonus game «Русская рулетка».
 * Paid in matchboxes — they open the chest (a tattoo).
 */
export const BANDIT_ROWS = 3;
export const BANDIT_REELS = 5;
export const BANDIT_BET_MIN = 1;
export const BANDIT_BET_MAX = 10;

export type BanditSym = "money" | "ring" | "chain" | "raven" | "cap" | "revolver" | "dice" | "horseshoe" | "a" | "k" | "q" | "j" | "ten" | "bell";
/** a cell of the screen: a symbol, or «W» — a part of a wild reel */
export type BanditCell = BanditSym | "W";

export interface BanditSymDef { id: BanditSym; name: string; weight: number; pay: [number, number, number, number]; xp?: [number, number, number, number] }
/** the price of 2 / 3 / 4 / 5 in a row in whole matchboxes, × the bet; the weight — how often it falls in a cell. The
 *  horseshoe gives the machine's experience instead (`xp`, not × the bet). The bell and the revolver are scatters
 *  (anywhere on the screen): the bell's 3 / 4 / 5 price, the revolver pays nothing itself (the bonus game) */
export const BANDIT_SYMS: BanditSymDef[] = [
  { id: "money", name: "Пачка денег", weight: 3, pay: [5, 75, 250, 1000] },
  { id: "ring", name: "Печатка", weight: 4, pay: [4, 60, 200, 500] },
  { id: "chain", name: "Цепь", weight: 5, pay: [3, 50, 150, 300] },
  { id: "raven", name: "Ворон", weight: 6, pay: [2, 40, 100, 250] },
  { id: "cap", name: "Кепка", weight: 7, pay: [2, 30, 80, 200] },
  { id: "dice", name: "Кости", weight: 12, pay: [1, 12, 30, 80] },
  { id: "horseshoe", name: "Подкова", weight: 12, pay: [0, 0, 0, 0], xp: [0, 200, 300, 500] },
  { id: "a", name: "Туз", weight: 20, pay: [1, 7, 20, 60] },
  { id: "k", name: "Король", weight: 20, pay: [1, 7, 20, 60] },
  { id: "q", name: "Дама", weight: 24, pay: [1, 4, 15, 40] },
  { id: "j", name: "Валет", weight: 24, pay: [1, 4, 15, 40] },
  { id: "ten", name: "Десятка", weight: 24, pay: [1, 4, 15, 40] },
  { id: "bell", name: "Колокол", weight: 3.3, pay: [0, 5, 20, 100] },
  { id: "revolver", name: "Револьвер", weight: 3.5, pay: [0, 0, 0, 0] },
];
/** the scatters: they pay or give something anywhere on the screen, never on a line, a wild does not stand in for them */
export const BANDIT_SCATTER: BanditSym[] = ["bell", "revolver"];
/**
 * «Русская рулетка» (3+ revolvers anywhere; the user 2026-11-26): ROULETTE_PULLS rounds (the bullets top left of the
 * window); each pull one round goes into the six chambers and the drum is spun — the shot 1 in 6. Every click —
 * ROULETTE_PAY × the bet matchboxes, the shot ends the game (the clicks before it are kept).
 */
export const ROULETTE_PAY = 25;
export const ROULETTE_PULLS = 4;
/** the chance of the shot on a pull */
export const ROULETTE_SHOT = 1 / 6;
/** the bonus game's mean win × the bet: a click on pull k needs all k pulls to click */
export const ROULETTE_MEAN = ROULETTE_PAY * Array.from({ length: ROULETTE_PULLS }, (_, k) => (1 - ROULETTE_SHOT) ** (k + 1)).reduce((a, b) => a + b, 0);
/** the line prices are tuned so the machine gives back about BANDIT_RTP of what is bet in red matchboxes (the
 *  roulette pays its own blue ones; tests/bandit.test.ts) */
export const BANDIT_RTP = 0.94;
/** the wild reel: the chance per reel 2–4 (in the free spins higher), its multiplier by weight */
export const BANDIT_WILD = { reels: [1, 2, 3], chance: 0.01, freeChance: 0.04, mult: [[2, 60], [3, 25], [5, 10], [10, 4], [25, 1]] as [number, number][] };
/** a spin never pays more than this × the bet */
export const BANDIT_MAX_X = 5000;
/** bells anywhere → free spins */
export const BANDIT_FREE: Record<number, number> = { 3: 10, 4: 12, 5: 15 };

/**
 * The machine's own level (the user 2026-11-26): every rouble bet is 1 experience (free spins give none).
 * 10 experience from level 0 to 1, then 100 000 in all from level 1 to 100, each next level a bit dearer.
 */
export const BANDIT_LEVEL_MAX = 100;
/** the chest: so many matchboxes for a tattoo piece */
export const BANDIT_CHEST_PRICE = 500;
const _w = Array.from({ length: BANDIT_LEVEL_MAX - 1 }, (_, i) => (i + 1) ** 1.5);
const _k = 100_000 / _w.reduce((a, b) => a + b, 0);
/** the experience from level L to L+1 (L = 0…99) */
export const BANDIT_LEVEL_NEED: number[] = [10, ..._w.map((w) => Math.round(w * _k))];
{ const d = 100_000 - BANDIT_LEVEL_NEED.slice(1).reduce((a, b) => a + b, 0); BANDIT_LEVEL_NEED[BANDIT_LEVEL_MAX - 1] += d; }
/** the level of so much experience: the level, the experience into it and the experience it needs */
export function banditLevel(xp: number) {
  let level = 0, left = xp;
  while (level < BANDIT_LEVEL_MAX && left >= BANDIT_LEVEL_NEED[level]) { left -= BANDIT_LEVEL_NEED[level]; level++; }
  return { level, into: level >= BANDIT_LEVEL_MAX ? 0 : left, need: level >= BANDIT_LEVEL_MAX ? 0 : BANDIT_LEVEL_NEED[level] };
}

export const banditSym = (id: string) => BANDIT_SYMS.find((s) => s.id === id);

export interface BanditSpin {
  /** reels[r][row] */
  reels: BanditCell[][];
  /** the wild reels: reel index → multiplier */
  wilds: Record<number, number>;
  /** the wins by lines (the rows): the symbol, how many reels in a row from the left, the row, the boxes before the multiplier */
  wins: { sym: BanditSym; n: number; row: number; pay: number; xp?: number }[];
  /** the bells' own pay (× the bet already), not multiplied */
  bells: number;
  mult: number;
  /** the spin's win, kopecks and all (the server keeps the kopecks for the player's next win: bandit_state.carry) */
  raw: number;
  /** the spin's win in whole roubles (without the kept kopecks) */
  win: number;
  /** free spins this spin gives */
  free: number;
  /** the machine's experience the horseshoes gave */
  xp: number;
  /** 3+ revolvers: the bonus game «Русская рулетка» */
  roulette: boolean;
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
    // a scatter (a bell, a revolver) at most once a reel
    const col: BanditCell[] = [];
    for (let i = 0; i < BANDIT_ROWS; i++) {
      let s = pick(CELL, rng);
      while (BANDIT_SCATTER.includes(s) && col.includes(s)) s = pick(CELL, rng);
      col.push(s);
    }
    reels.push(col);
  }
  return banditPay(reels, wilds, bet);
}

/** the win of a screen: every row is a line, paid from the left — a pair and more (a wild reel stands in on all its rows) */
export function banditPay(reels: BanditCell[][], wilds: Record<number, number>, bet: number): BanditSpin {
  const wins: BanditSpin["wins"] = [];
  for (let row = 0; row < BANDIT_ROWS; row++) {
    // the line's symbol: its first own symbol from the left (the first reel never has a wild)
    const sym = reels[0][row];
    if (sym === "W" || BANDIT_SCATTER.includes(sym)) continue;
    let n = 1;
    while (n < BANDIT_REELS && (reels[n][row] === sym || reels[n][row] === "W")) n++;
    const def = banditSym(sym)!;
    if (n >= 2 && (def.pay[n - 2] > 0 || (def.xp?.[n - 2] ?? 0) > 0)) wins.push({ sym, n, row, pay: def.pay[n - 2] * bet, ...(def.xp ? { xp: def.xp[n - 2] } : {}) });
  }
  const nb = reels.flat().filter((x) => x === "bell").length;
  const bellDef = banditSym("bell")!;
  const bells = nb >= 3 ? bellDef.pay[Math.min(5, nb) - 2] * bet : 0;
  const roulette = reels.flat().filter((x) => x === "revolver").length >= 3;
  const mult = Object.values(wilds).reduce((a, b) => a + b, 0) || 1;
  const line = wins.reduce((a, w) => a + w.pay, 0);
  const raw = Math.min(BANDIT_MAX_X * bet, line * mult + bells);
  return { reels, wilds, wins, bells, mult, raw, win: Math.floor(raw), free: BANDIT_FREE[Math.min(5, nb)] ?? 0, roulette, xp: wins.reduce((a, w) => a + (w.xp ?? 0), 0) };
}
