export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { dayTop } from "../../../server/systems/minigame-extras.ts";

/** The daily tops of the mini-games: ?game=bj|poker&day=today|yesterday. */
export const GET = authedRoute("game-day", async ({ db, req, playerId }) => {
  const u = new URL(req.url).searchParams;
  return dayTop(db, playerId, u.get("game") === "poker" ? "poker" : "bj", u.get("day") === "yesterday" ? "yesterday" : "today", Date.now());
});
