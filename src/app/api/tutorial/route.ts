export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute, oneOf } from "../../../server/http.ts";
import { withState } from "../../../server/routes.ts";
import { markBossScreenOpened, skipTutorial } from "../../../server/game.ts";

export const POST = authedRoute("tutorial", async ({ db, body, playerId }) => {
  const action = oneOf(body.action, ["boss_opened", "skip"] as const, "action");
  return withState(db, playerId, (tx) => (action === "skip" ? skipTutorial(tx, playerId) : markBossScreenOpened(tx, playerId)));
});
