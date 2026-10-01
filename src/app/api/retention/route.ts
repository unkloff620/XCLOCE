export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute, oneOf, str } from "../../../server/http.ts";
import { withState } from "../../../server/routes.ts";
import { doClaimDaily, doClaimQuest, doWear } from "../../../server/game.ts";

export const POST = authedRoute("retention", async ({ db, body, playerId }) => {
  const action = oneOf(body.action, ["daily", "quest", "wear"] as const, "action");
  return withState(db, playerId, (tx) =>
    action === "daily"
      ? doClaimDaily(tx, playerId)
      : action === "quest"
        ? doClaimQuest(tx, playerId, str(body.questId, "questId", 40))
        : doWear(tx, playerId, str(body.cosmeticId, "cosmeticId", 40)),
  );
});
