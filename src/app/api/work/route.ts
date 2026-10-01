export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { withState } from "../../../server/routes.ts";
import { doWork } from "../../../server/game.ts";

export const POST = authedRoute("work", async ({ db, playerId }) => withState(db, playerId, (tx) => doWork(tx, playerId)));
