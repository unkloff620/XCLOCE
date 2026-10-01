export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { publicRoute, str } from "../../../server/http.ts";
import { advanceMarket, getToken } from "../../../server/market.ts";
import { GameError } from "../../../server/db.ts";

export const GET = publicRoute("token", async ({ db, req }) => {
  const id = str(new URL(req.url).searchParams.get("id"), "id", 40);
  await advanceMarket(db);
  const token = await getToken(db, id);
  if (!token) throw new GameError("no_token", "Токен не найден", 404);
  return { token, serverTime: Date.now() };
});
