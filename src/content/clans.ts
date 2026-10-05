/*
 * Clan level from the total boss damage of its members.
 * Level 1 at 5 000, level 2 at 11 000, then every step is 1 000 longer than the one before:
 * 5 000 → 11 000 → 18 000 → 26 000 → 35 000 …  (threshold of level n = 4 000·n + 500·n·(n+1))
 */
export const clanLevelAt = (n: number) => (n <= 0 ? 0 : 4000 * n + 500 * n * (n + 1));

export function clanLevelInfo(damage: number): { level: number; from: number; to: number } {
  const d = Math.max(0, damage);
  let n = Math.max(0, Math.floor((-9 + Math.sqrt(81 + (8 * d) / 1000)) / 2) - 1);
  while (clanLevelAt(n + 1) <= d) n++;
  return { level: n, from: clanLevelAt(n), to: clanLevelAt(n + 1) };
}
