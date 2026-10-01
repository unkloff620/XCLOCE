import { createPgliteDb, migrate, type Db } from "../src/server/db.ts";
import { upsertGuestPlayer } from "../src/server/game.ts";
import { randomUUID } from "node:crypto";

export async function freshDb(): Promise<Db> {
  const db = await createPgliteDb();
  await migrate(db);
  return db;
}
export async function newPlayer(db: Db): Promise<number> {
  return db.tx((tx) => upsertGuestPlayer(tx, randomUUID()));
}
export async function bal(db: Db, pid: number, c: string): Promise<number> {
  return (await db.query<{ amount: number }>("SELECT amount FROM balances WHERE player_id=$1 AND currency=$2", [pid, c]))[0].amount;
}
export async function qty(db: Db, pid: number, item: string): Promise<number> {
  return (await db.query<{ quantity: number }>("SELECT quantity FROM inventory WHERE player_id=$1 AND item_type='item' AND item_id=$2", [pid, item]))[0]?.quantity ?? 0;
}
export const always = (v: number) => () => v;
