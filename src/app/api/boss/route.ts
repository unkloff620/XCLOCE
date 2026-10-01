export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { bossFight, getState, lockPlayer } from "../../../server/game.ts";

/**
 * GET /api/boss?index=N — live fight view (shared HP + damage list), polled while the fight screen is open.
 * If a kill reward is waiting for this player it is settled here and the fresh state is returned too.
 */
export const GET = authedRoute("boss", async ({ db, req, playerId }) => {
  const index = Number(new URL(req.url).searchParams.get("index") || 0);
  return db.tx(async (tx) => {
    const fight = await bossFight(tx, playerId, index);
    const [pending] = await tx.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM boss_damage WHERE player_id=$1 AND reward IS NOT NULL AND claimed_at IS NULL", [playerId]);
    if (!pending.n) return { fight, state: null };
    await lockPlayer(tx, playerId);
    return { fight: await bossFight(tx, playerId, index), state: await getState(tx, playerId) };
  });
});
