export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { inPlayerTx } from "../../../server/game.ts";
import { yardSync } from "../../../server/systems/yard.ts";

export const GET = authedRoute("yard", async ({ db, playerId }) => {
  const r = await inPlayerTx(db, playerId, (ctx) => yardSync(ctx));
  return { ...r.result, now: r.state.now };
});
