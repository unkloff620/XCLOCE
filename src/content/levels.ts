/**
 * Уровень зависит от набранного авторитета (в коде — xp). Порог уровня N (сколько всего авторитета нужно):
 *   total(N) = round(a·(N−1)^p + b·(N−1))
 * Подобрано под награды (боссы: 100 … 1 500 000 авторитета):
 *   2 ур. ≈ 1 000, 10 ур. ≈ 13 000, 50 ур. ≈ 1 млн, 100 ур. ≈ 10 млн, 200 ур. ≈ 99 млн. Потолка по сути нет (999).
 * Переопределяется через config "levels".
 */
export const LEVELS = { a: 3, b: 1000, p: 3.27, max: 999 };
export type LevelsCfg = typeof LEVELS;

/** Total authority needed to reach level n. */
export function totalForLevel(n: number, cfg: LevelsCfg = LEVELS): number {
  if (n <= 1) return 0;
  const k = n - 1;
  return Math.round(cfg.a * k ** cfg.p + cfg.b * k);
}

/** Level and progress inside the level from total authority. */
export function levelFromXp(totalXp: number, cfg: LevelsCfg = LEVELS): { level: number; into: number; need: number } {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (level < cfg.max && xp >= totalForLevel(level + 1, cfg)) level++;
  if (level >= cfg.max) return { level, into: 0, need: 0 };
  const from = totalForLevel(level, cfg);
  return { level, into: xp - from, need: totalForLevel(level + 1, cfg) - from };
}

export const ENERGY = { max: 50, regenMin: 5, start: 50 };
