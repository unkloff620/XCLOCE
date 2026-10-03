import { randomUUID } from "node:crypto";
import { createPgliteDb, migrate, type Db } from "../src/server/db.ts";
import { upsertGuestPlayer } from "../src/server/players.ts";
import { runAction, type ActionType } from "../src/server/game.ts";
import { resetConfigCache } from "../src/server/config.ts";

export async function freshDb(): Promise<Db> {
  resetConfigCache();
  const db = await createPgliteDb();
  await migrate(db);
  return db;
}
export async function newPlayer(db: Db): Promise<number> {
  return db.tx((q) => upsertGuestPlayer(q, randomUUID()));
}
export async function wallet(db: Db, pid: number, c: string): Promise<number> {
  return Number((await db.query<{ amount: number }>("SELECT amount FROM wallets WHERE player_id=$1 AND currency=$2", [pid, c]))[0]?.amount ?? 0);
}
export async function qty(db: Db, pid: number, item: string): Promise<number> {
  return (await db.query<{ qty: number }>("SELECT qty FROM inventory WHERE player_id=$1 AND item_id=$2", [pid, item]))[0]?.qty ?? 0;
}
export async function give(db: Db, pid: number, item: string, n: number) {
  await db.query("INSERT INTO inventory (player_id, item_id, qty) VALUES ($1,$2,$3) ON CONFLICT (player_id, item_id) DO UPDATE SET qty = EXCLUDED.qty", [pid, item, n]);
}
export async function setMoney(db: Db, pid: number, c: string, v: number) {
  await db.query("UPDATE wallets SET amount=$3 WHERE player_id=$1 AND currency=$2", [pid, c, v]);
}
import type { gameState } from "../src/server/systems/state.ts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Acted = { result: any; state: Awaited<ReturnType<typeof gameState>> };
export const act = (db: Db, pid: number, type: ActionType, body: Record<string, unknown> = {}, now?: number, rng?: () => number) =>
  runAction(db, pid, type, body, { now, rng }) as Promise<Acted>;
export const always = (v: number) => () => v;
export const H = 3600_000;
export const M = 60_000;
