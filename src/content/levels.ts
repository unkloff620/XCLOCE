/** Draft formula: going from level N to N+1 needs round(base × N^power) XP. Overridable via config "levels". */
export const LEVELS = { base: 100, power: 1.5, max: 200 };

export function xpForLevel(n: number, cfg = LEVELS): number {
  return Math.round(cfg.base * n ** cfg.power);
}

/** Level and progress inside the level from total XP. */
export function levelFromXp(totalXp: number, cfg = LEVELS): { level: number; into: number; need: number } {
  let level = 1;
  let left = Math.max(0, Math.floor(totalXp));
  while (level < cfg.max) {
    const need = xpForLevel(level, cfg);
    if (left < need) return { level, into: left, need };
    left -= need;
    level++;
  }
  return { level, into: 0, need: 0 };
}

export const ENERGY = { max: 50, regenMin: 5, start: 50 };
