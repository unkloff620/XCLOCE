export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute, num, oneOf, str } from "../../../server/http.ts";
import { withState } from "../../../server/routes.ts";
import { advanceMarket } from "../../../server/market.ts";
import { doBuy, doSell } from "../../../server/game.ts";

export const POST = authedRoute("trade", async ({ db, body, playerId }) => {
  const side = oneOf(body.side, ["buy", "sell"] as const, "side");
  const tokenId = str(body.tokenId, "tokenId", 40);
  const idem = str(body.idem, "idem", 80);
  await advanceMarket(db);
  return withState(db, playerId, (tx) =>
    side === "buy" ? doBuy(tx, playerId, tokenId, num(body.sol, "sol"), idem) : doSell(tx, playerId, tokenId, num(body.fraction, "fraction"), idem),
  );
});
