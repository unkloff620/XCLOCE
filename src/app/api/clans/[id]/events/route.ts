export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../../../server/http.ts";
import { GameError } from "../../../../../server/db.ts";
import { clanEvents } from "../../../../../server/systems/raids.ts";

/** «События» of the clan: its influence in the yards and what happened (only its own members see them) */
export const GET = authedRoute("clan_events", async ({ db, req, playerId }) => {
  const id = Number(new URL(req.url).pathname.split("/").slice(-2)[0]);
  const [me] = await db.query<{ clan_id: number | null }>("SELECT clan_id FROM players WHERE id=$1", [playerId]);
  if (!me || Number(me.clan_id) !== id) throw new GameError("not_member", "События видны только своему клану", 403);
  return clanEvents(db, id);
});
