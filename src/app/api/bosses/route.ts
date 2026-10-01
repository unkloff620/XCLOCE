export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { bossInfo } from "../../../shared/bosses.ts";

export const GET = authedRoute("bosses", async ({ db, playerId }) => {
  const [bp] = await db.query<{ boss_index: number }>("SELECT boss_index FROM boss_progress WHERE player_id = $1", [playerId]);
  const defeats = await db.query<{ boss_index: number; personal_damage: number; reward_usd: number; reward_item: string | null; defeated_at: string }>(
    "SELECT boss_index, personal_damage, reward_usd, reward_item, defeated_at FROM boss_defeats WHERE player_id = $1 ORDER BY boss_index", [playerId]);
  const byIndex = new Map(defeats.map((d) => [d.boss_index, d]));
  const last = Math.max(bp.boss_index + 5, 12);
  const list = [];
  for (let i = 1; i <= last; i++) {
    const d = byIndex.get(i);
    list.push({ ...bossInfo(i), status: d ? "defeated" : i === bp.boss_index ? "current" : i < bp.boss_index ? "defeated" : "locked",
      personalDamage: d?.personal_damage ?? null, rewardPaid: d?.reward_usd ?? null, defeatedAt: d?.defeated_at ?? null });
  }
  return { current: bp.boss_index, bosses: list };
});
