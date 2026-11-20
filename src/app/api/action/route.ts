export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute, oneOf } from "../../../server/http.ts";
import { ACTIONS, runAction } from "../../../server/game.ts";
import { GameError } from "../../../server/db.ts";

/** the weapon hits from the client: one a player per HIT_GAP_MS (no spamming the server with a thousand taps) */
const HITS = new Set(["attack", "raid_attack", "clan_boss_hit"]);
const HIT_GAP_MS = 250;

/** Single action endpoint: every action is validated and executed on the server; the client only names it. */
export const POST = authedRoute("action", async ({ db, body, playerId }) => {
  const type = oneOf(body.type, ACTIONS, "type");
  if (HITS.has(type)) {
    // one atomic check for every server instance: the last hit's time on the player's row
    const ok = await db.query(
      "UPDATE players SET last_hit_at = now() WHERE id=$1 AND (last_hit_at IS NULL OR last_hit_at <= now() - make_interval(secs => $2)) RETURNING id",
      [playerId, HIT_GAP_MS / 1000],
    );
    if (!ok.length) throw new GameError("too_fast", "Не так быстро", 429);
  }
  return runAction(db, playerId, type, body);
});
