import type { Queryable } from "./db.ts";
import { xpForNextLevel } from "../shared/economy.ts";

/** Adds XP and processes level-ups. Returns new level. */
export async function addXp(tx: Queryable, playerId: number, xp: number): Promise<number> {
  const [p] = await tx.query<{ level: number; xp: number }>("UPDATE players SET xp = xp + $2 WHERE id = $1 RETURNING level, xp", [playerId, Math.round(xp)]);
  let { level, xp: cur } = p;
  let changed = false;
  while (cur >= xpForNextLevel(level) && level < 200) {
    cur -= xpForNextLevel(level);
    level += 1;
    changed = true;
  }
  if (changed) await tx.query("UPDATE players SET level = $2, xp = $3 WHERE id = $1", [playerId, level, cur]);
  return level;
}
