export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute, num, oneOf, str } from "../../../server/http.ts";
import { withState } from "../../../server/routes.ts";
import { doExchange } from "../../../server/game.ts";
import { CURRENCIES } from "../../../shared/economy.ts";

export const POST = authedRoute("exchange", async ({ db, body, playerId }) => {
  const from = oneOf(body.from, CURRENCIES, "from");
  const to = oneOf(body.to, CURRENCIES, "to");
  return withState(db, playerId, (tx) => doExchange(tx, playerId, from, to, num(body.amount, "amount"), str(body.idem, "idem", 80)));
});
