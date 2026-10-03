export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../../server/http.ts";
import { clanView } from "../../../../server/systems/clans.ts";
import { loadConfig } from "../../../../server/config.ts";

export const GET = authedRoute("clan", async ({ db, req }) => {
  const id = Number(new URL(req.url).pathname.split("/").pop());
  return clanView(db, id, (await loadConfig(db)).levels);
});
