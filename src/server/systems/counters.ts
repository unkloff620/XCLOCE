import type { Queryable } from "../db.ts";

/*
 * Plain per-player counters for the things the game does not keep elsewhere (the achievements read them):
 * exchanges, money spent in the shop, upgrader luck, blackjack hands, a clan created. Table player_counters.
 */
export async function bump(q: Queryable, pid: number, key: string, by = 1) {
  if (!(by > 0)) return;
  await q.query(
    "INSERT INTO player_counters (player_id, key, n) VALUES ($1,$2,$3) ON CONFLICT (player_id, key) DO UPDATE SET n = player_counters.n + EXCLUDED.n",
    [pid, key, Math.floor(by)],
  );
}
/** keeps the highest value seen */
export async function setMax(q: Queryable, pid: number, key: string, v: number) {
  await q.query(
    "INSERT INTO player_counters (player_id, key, n) VALUES ($1,$2,$3) ON CONFLICT (player_id, key) DO UPDATE SET n = GREATEST(player_counters.n, EXCLUDED.n)",
    [pid, key, Math.floor(v)],
  );
}
export async function setTo(q: Queryable, pid: number, key: string, v: number) {
  await q.query(
    "INSERT INTO player_counters (player_id, key, n) VALUES ($1,$2,$3) ON CONFLICT (player_id, key) DO UPDATE SET n = EXCLUDED.n",
    [pid, key, Math.floor(v)],
  );
}
export async function countersOf(q: Queryable, pid: number): Promise<Record<string, number>> {
  const rows = await q.query<{ key: string; n: number }>("SELECT key, n FROM player_counters WHERE player_id=$1", [pid]);
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.n)]));
}
