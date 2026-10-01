export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { publicRoute } from "../../../server/http.ts";
import { advanceMarket, listMarket } from "../../../server/market.ts";

export const GET = publicRoute("market", async ({ db }) => {
  await advanceMarket(db);
  return { tokens: await listMarket(db), serverTime: Date.now() };
});
