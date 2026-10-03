export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { profileView } from "../../../server/systems/state.ts";
import { loadConfig } from "../../../server/config.ts";

export const GET = authedRoute("profile", async ({ db, req, playerId }) => {
  const raw = new URL(req.url).searchParams.get("id");
  const id = raw ? Number(raw) : playerId;
  return profileView(db, playerId, Number.isSafeInteger(id) && id > 0 ? id : playerId, await loadConfig(db));
});
