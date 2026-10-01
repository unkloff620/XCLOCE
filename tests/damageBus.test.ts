import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/server/db.ts";
import { emitDamage, syncBoss } from "../src/server/damageBus.ts";
import { bossMarketCap } from "../src/shared/economy.ts";
import { bossOf, freshDb, newPlayer, placeOnBoss, usd } from "./helpers.ts";

let db: Db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db.close(); });

const emit = (src: number, amount: number) => db.tx((tx) => emitDamage(tx, { sourcePlayerId: src, amount, sourceType: "sell" }));
const sync = (pid: number) => db.tx((tx) => syncBoss(tx, pid));
const lifetime = async (pid: number) => (await db.query<{ lifetime_damage: number }>("SELECT lifetime_damage FROM player_stats WHERE player_id=$1", [pid]))[0].lifetime_damage;

describe("Global Damage Bus", () => {
  it("§99: one player's $100 hits every player's own current boss", async () => {
    const [a, b, c] = [await newPlayer(db), await newPlayer(db), await newPlayer(db)];
    await placeOnBoss(db, a, 1, 500);
    await placeOnBoss(db, b, 4, 8_000);
    await placeOnBoss(db, c, 10, 45_000);
    await emit(a, 100);
    for (const p of [a, b, c]) await sync(p);
    expect(await bossOf(db, a)).toMatchObject({ index: 1, remaining: 400 });
    expect(await bossOf(db, b)).toMatchObject({ index: 4, remaining: 7_900 });
    expect(await bossOf(db, c)).toMatchObject({ index: 10, remaining: 44_900 });
    expect(await lifetime(a)).toBe(100);
    expect(await lifetime(b)).toBe(0);
    expect(await lifetime(c)).toBe(0);
    const [ev] = await db.query<{ source_player_id: number; amount: number }>("SELECT source_player_id, amount FROM damage_events");
    expect(ev).toMatchObject({ source_player_id: a, amount: 100 });
  });

  it("§100: overkill flows to the player's next boss, others take the full $200", async () => {
    const [a, b, c] = [await newPlayer(db), await newPlayer(db), await newPlayer(db)];
    await placeOnBoss(db, a, 1, 50);
    await placeOnBoss(db, b, 3, 5_000);
    await placeOnBoss(db, c, 6, 20_000);
    await emit(b, 200);
    const ra = await sync(a);
    await sync(b);
    await sync(c);
    expect(ra.defeats.map((d) => d.index)).toEqual([1]);
    expect(await bossOf(db, a)).toMatchObject({ index: 2, remaining: bossMarketCap(2) - 150 });
    expect(await bossOf(db, b)).toMatchObject({ index: 3, remaining: 4_800 });
    expect(await bossOf(db, c)).toMatchObject({ index: 6, remaining: 19_800 });
  });

  it("damage passes through several weak bosses at once", async () => {
    const a = await newPlayer(db);
    const total = bossMarketCap(1) + bossMarketCap(2) + bossMarketCap(3) + 400;
    await emit(a, total);
    const r = await sync(a);
    expect(r.defeats.map((d) => d.index)).toEqual([1, 2, 3]);
    expect(await bossOf(db, a)).toMatchObject({ index: 4, remaining: bossMarketCap(4) - 400 });
  });

  it("§101: offline player processes accumulated global damage via checkpoint", async () => {
    const [offline, active] = [await newPlayer(db), await newPlayer(db)];
    await db.query("UPDATE global_state SET damage_total = 1000000 WHERE id = 1");
    await db.query("UPDATE boss_progress SET global_checkpoint = 1000000 WHERE player_id = ANY($1)", [[offline, active]]);
    // while `offline` is away, others deal $50,000 in many events
    for (let i = 0; i < 50; i++) await emit(active, 1_000);
    const [g] = await db.query<{ damage_total: number }>("SELECT damage_total FROM global_state");
    expect(g.damage_total).toBe(1_050_000);
    const r = await sync(offline);
    expect(r.applied).toBe(50_000);
    // bosses 1..4 sum to 28,600; boss 5 (27,000) is not finished: 21,400 taken
    expect(r.defeats.map((d) => d.index)).toEqual([1, 2, 3, 4]);
    expect(await bossOf(db, offline)).toMatchObject({ index: 5, remaining: bossMarketCap(5) - (50_000 - 28_600), checkpoint: 1_050_000 });
  });

  it("concurrent damage events are all counted exactly once", async () => {
    const players = await Promise.all(Array.from({ length: 8 }, () => newPlayer(db)));
    await Promise.all(players.flatMap((p) => [emit(p, 10), emit(p, 15), emit(p, 25)]));
    const [g] = await db.query<{ damage_total: number }>("SELECT damage_total FROM global_state");
    expect(g.damage_total).toBe(8 * 50);
    await Promise.all(players.map((p) => sync(p)));
    for (const p of players) expect(await bossOf(db, p)).toMatchObject({ index: 1, remaining: bossMarketCap(1) - 400 });
    // syncing again changes nothing (no double application)
    await Promise.all(players.map((p) => sync(p)));
    for (const p of players) expect(await bossOf(db, p)).toMatchObject({ index: 1, remaining: bossMarketCap(1) - 400 });
  });

  it("boss reward is paid only once, even if the chain is replayed", async () => {
    const a = await newPlayer(db);
    await emit(a, bossMarketCap(1));
    const r1 = await sync(a);
    expect(r1.defeats).toHaveLength(1);
    const paid = await usd(db, a);
    expect(paid).toBeGreaterThan(0);
    // Simulate a buggy rollback of progress: the player is pushed back to boss #1 and damage replays.
    await db.query("UPDATE boss_progress SET boss_index = 1, damage_taken = 0 WHERE player_id = $1", [a]);
    await emit(a, bossMarketCap(1));
    const r2 = await sync(a);
    expect(r2.defeats).toHaveLength(0);
    expect(await usd(db, a)).toBe(paid);
    const [{ n }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM boss_defeats WHERE player_id=$1", [a]);
    expect(n).toBe(1);
  });

  it("new players start from the current global total (no retroactive damage)", async () => {
    const a = await newPlayer(db);
    await emit(a, 300);
    const late = await newPlayer(db);
    await sync(late);
    expect(await bossOf(db, late)).toMatchObject({ index: 1, remaining: bossMarketCap(1) });
  });

  it("contribution factor: full reward with personal damage, reduced without", async () => {
    const [solo, helper] = [await newPlayer(db), await newPlayer(db)];
    await emit(helper, bossMarketCap(1)); // helper kills boss #1 for both
    const rSolo = await sync(solo);
    const rHelper = await sync(helper);
    expect(rHelper.defeats[0].rewardUsd).toBeGreaterThan(rSolo.defeats[0].rewardUsd);
    expect(rSolo.defeats[0].rewardUsd).toBeCloseTo(rHelper.defeats[0].rewardUsd * 0.25, 2);
  });
});
