// Shared helpers for API route modules.
import type { Db, Queryable } from "./db.ts";
import { getState, lockPlayer } from "./game.ts";

/** Runs an action and returns {result, state} computed inside the same transaction. */
export async function withState(db: Db, playerId: number, action: (tx: Queryable) => Promise<unknown>) {
  return db.tx(async (tx) => {
    const result = await action(tx);
    await lockPlayer(tx, playerId);
    const state = await getState(tx, playerId);
    return { result, state };
  });
}
