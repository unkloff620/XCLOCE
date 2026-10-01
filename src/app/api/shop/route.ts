export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute, num, oneOf, str } from "../../../server/http.ts";
import { withState } from "../../../server/routes.ts";
import { buyEquipment, buyTool } from "../../../server/game.ts";

export const POST = authedRoute("shop", async ({ db, body, playerId }) => {
  const kind = oneOf(body.kind, ["equipment", "tool"] as const, "kind");
  const idem = str(body.idem, "idem", 80);
  return withState(db, playerId, (tx) =>
    kind === "equipment" ? buyEquipment(tx, playerId, num(body.tier, "tier"), idem) : buyTool(tx, playerId, str(body.toolId, "toolId", 40), idem),
  );
});
