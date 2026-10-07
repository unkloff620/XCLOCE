export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../../server/http.ts";
import { clanRequests, clanView } from "../../../../server/systems/clans.ts";
import { loadConfig } from "../../../../server/config.ts";

export const GET = authedRoute("clan", async ({ db, req, playerId }) => {
  const id = Number(new URL(req.url).pathname.split("/").pop());
  const view = await clanView(db, id, (await loadConfig(db)).levels);
  // the leader also sees the requests to join
  return { ...view, requests: await clanRequests(db, id, playerId) };
});
