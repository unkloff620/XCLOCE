export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { zarubView } from "../../../server/systems/zarub.ts";

/** «Зарубы»: my зарубный уровень, кольца, самородки, the difficulties, the bags, my race */
export const GET = authedRoute("zarub", async ({ db, playerId }) => zarubView(db, playerId, Date.now()));
