// Shared helpers for API route modules.
import type { Db } from "./db.ts";
import { lockPlayer, getState, displayName } from "./game.ts";
import { syncBoss } from "./damageBus.ts";
import type { Queryable } from "./db.ts";

/** Runs an action and returns {result, state} computed inside the same transaction. */
export async function withState(db: Db, playerId: number, action: (tx: Queryable) => Promise<unknown>) {
  return db.tx(async (tx) => {
    const result = await action(tx);
    const p = await lockPlayer(tx, playerId);
    const sync = await syncBoss(tx, playerId, displayName(p));
    const state = await getState(tx, playerId, sync);
    return { result, state, sync: { defeats: sync.defeats } };
  });
}
