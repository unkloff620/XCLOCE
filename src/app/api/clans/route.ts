export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { clanDetails, listClans } from "../../../server/game.ts";

/** GET /api/clans?search=… lists clans; GET /api/clans?id=… returns one clan (with requests for its leader). */
export const GET = authedRoute("clans", async ({ db, req, playerId }) => {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id") || 0);
  if (id) return { clan: await clanDetails(db, id, playerId) };
  return { clans: await listClans(db, url.searchParams.get("search") ?? "") };
});
