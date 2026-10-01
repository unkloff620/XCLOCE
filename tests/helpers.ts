import { createPgliteDb, migrate, type Db } from "../src/server/db.ts";
import { upsertGuestPlayer } from "../src/server/game.ts";
import { bossMarketCap } from "../src/shared/economy.ts";
import { randomUUID } from "node:crypto";

export async function freshDb(): Promise<Db> {
  const db = await createPgliteDb();
  await migrate(db);
  return db;
}

export async function newPlayer(db: Db): Promise<number> {
  return db.tx((tx) => upsertGuestPlayer(tx, randomUUID()));
}

/** Puts a player on boss #index with `remaining` market cap left. */
export async function placeOnBoss(db: Db, playerId: number, index: number, remaining: number) {
  const taken = bossMarketCap(index) - remaining;
  await db.query("UPDATE boss_progress SET boss_index=$2, damage_taken=$3, personal_on_boss=0 WHERE player_id=$1", [playerId, index, taken]);
}

export async function bossOf(db: Db, playerId: number) {
  const [r] = await db.query<{ boss_index: number; damage_taken: number; global_checkpoint: number }>(
    "SELECT boss_index, damage_taken, global_checkpoint FROM boss_progress WHERE player_id=$1", [playerId]);
  return { index: r.boss_index, remaining: bossMarketCap(r.boss_index) - r.damage_taken, checkpoint: r.global_checkpoint };
}

export async function usd(db: Db, playerId: number): Promise<number> {
  const [r] = await db.query<{ amount: number }>("SELECT amount FROM balances WHERE player_id=$1 AND currency='USD'", [playerId]);
  return r.amount;
}
