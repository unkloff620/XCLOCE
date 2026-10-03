export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { locationsView } from "../../../server/systems/locations.ts";

export const GET = authedRoute("locations", async ({ db, playerId }) => ({ locations: await locationsView(db, playerId) }));
