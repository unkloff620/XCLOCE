export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../../server/http.ts";
import { bossDetails } from "../../../../server/systems/combat.ts";

export const GET = authedRoute("boss", async ({ db, req, playerId }) => {
  const id = new URL(req.url).pathname.split("/").pop() ?? "";
  return bossDetails(db, playerId, decodeURIComponent(id));
});
