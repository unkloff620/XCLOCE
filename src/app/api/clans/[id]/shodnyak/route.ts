export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../../../server/http.ts";
import { GameError } from "../../../../../server/db.ts";
import { shodView } from "../../../../../server/systems/shodnyak.ts";
import { loadConfig } from "../../../../../server/config.ts";

/** «Сходняк» of the clan: the tasks, mine, the clans' table of the week (only its own members see it) */
export const GET = authedRoute("clan_shodnyak", async ({ db, req, playerId }) => {
  const id = Number(new URL(req.url).pathname.split("/").slice(-2)[0]);
  const [me] = await db.query<{ clan_id: number | null }>("SELECT clan_id FROM players WHERE id=$1", [playerId]);
  if (!me || Number(me.clan_id) !== id) throw new GameError("not_member", "Сходняк виден только своему клану", 403);
  return shodView(db, playerId, Date.now(), (await loadConfig(db)).bossOpen);
});
