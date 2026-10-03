export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { CLAN_COLORS, CLAN_EMBLEMS, clanList } from "../../../server/systems/clans.ts";

export const GET = authedRoute("clans", async ({ db }) => ({ clans: await clanList(db), emblems: CLAN_EMBLEMS, colors: CLAN_COLORS }));
