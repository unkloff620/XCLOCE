export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { withState } from "../../../server/routes.ts";

export const GET = authedRoute("me", async ({ db, playerId }) => withState(db, playerId, async () => null));
