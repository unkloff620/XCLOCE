export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { fightView, weaponTray } from "../../../server/systems/combat.ts";
import { GameError } from "../../../server/db.ts";

/** Polled by the boss screen: HP of my fight, new hits since `since`, top of the fight, weapons. Read-only. */
export const GET = authedRoute("live", async ({ db, req, playerId }) => {
  const u = new URL(req.url);
  const fightId = Number(u.searchParams.get("fight"));
  const since = Number(u.searchParams.get("since") ?? 0);
  if (!Number.isSafeInteger(fightId) || fightId <= 0) throw new GameError("bad_request", "Нет боя", 400);
  const now = Date.now();
  return { fight: await fightView(db, playerId, fightId, Number.isFinite(since) ? since : 0, now), weapons: await weaponTray(db, playerId, now), now };
});
