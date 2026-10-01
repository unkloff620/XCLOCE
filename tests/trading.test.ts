import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/server/db.ts";
import { seed } from "../src/server/seed.ts";
import { doBuy, doExchange, doSell, doWork, getState, buyTool, equipTool, TUTORIAL } from "../src/server/game.ts";
import { computeDamage, DUMP_TOOLS, type DumpToolDef } from "../src/shared/economy.ts";
import { bossOf, freshDb, newPlayer } from "./helpers.ts";

let db: Db;
beforeEach(async () => { db = await freshDb(); await seed(db); });
afterEach(async () => { await db.close(); });

let clock = Date.now();
const tick = () => (clock += 1_000);

async function fundSol(pid: number) {
  await db.tx((tx) => doExchange(tx, pid, "RUB", "USD", 9_000, "ex1", tick()));
  await db.tx((tx) => doExchange(tx, pid, "USD", "SOL", 90, "ex2", tick()));
}

describe("economy formulas", () => {
  it("§33: $100 x 1.5 tool x 2 crit = $300", () => {
    const tool: DumpToolDef = { ...DUMP_TOOLS[0], mult: 1.5, critChance: 1, critMult: 2 };
    const d = computeDamage({ saleUsd: 100, tool, combo: 0, equipmentTier: 1, critRoll: 0 });
    expect(d.amount).toBe(300);
    expect(d.crit).toBe(true);
  });
  it("§32: $100 sale with 1.4x tool = $140", () => {
    const tool: DumpToolDef = { ...DUMP_TOOLS[0], mult: 1.4, critChance: 0 };
    expect(computeDamage({ saleUsd: 100, tool, combo: 0, equipmentTier: 1, critRoll: 0.5 }).amount).toBe(140);
  });
});

describe("trading loop (tutorial path)", () => {
  it("work → USD → SOL → buy token → sell: sale creates damage on the player's boss", async () => {
    const pid = await newPlayer(db);
    await db.tx((tx) => doWork(tx, pid, tick()));
    await fundSol(pid);
    const buy = await db.tx((tx) => doBuy(tx, pid, "dking", 0.5, "buy1", tick()));
    expect(buy.amount).toBeGreaterThan(0);
    const sell = await db.tx((tx) => doSell(tx, pid, "dking", 1, "sell1", tick(), 0.99));
    expect(sell.saleUsd).toBeGreaterThan(50);
    expect(sell.damage.amount).toBeCloseTo(sell.saleUsd, 1); // Paper Hands x1.0, no crit, no combo bonus
    const boss = await bossOf(db, pid);
    expect(boss.index).toBe(1);
    expect(1000 - boss.remaining).toBeCloseTo(sell.damage.amount, 1);
    const state = await db.tx((tx) => getState(tx, pid));
    expect(state.player.tutorialStep).toBe(TUTORIAL.OPEN_BOSS);
    expect(state.positions).toHaveLength(0);
    expect(state.stats.lifetime_damage).toBeCloseTo(sell.damage.amount, 2);
  });

  it("duplicate sell request (same idempotency key) is applied once", async () => {
    const pid = await newPlayer(db);
    await fundSol(pid);
    await db.tx((tx) => doBuy(tx, pid, "frog", 0.4, "b", tick()));
    const t = tick();
    const s1 = await db.tx((tx) => doSell(tx, pid, "frog", 0.5, "same-key", t, 0.99));
    const s2 = await db.tx((tx) => doSell(tx, pid, "frog", 0.5, "same-key", t + 5_000, 0.99));
    expect(s2.replay).toBe(true);
    expect(s2.damage.eventId).toBe(s1.damage.eventId);
    const [{ n }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM damage_events");
    expect(n).toBe(1);
  });

  it("rejects selling what you do not own, overspending and too-fast spam", async () => {
    const pid = await newPlayer(db);
    await expect(db.tx((tx) => doSell(tx, pid, "frog", 1, "x", tick()))).rejects.toMatchObject({ code: "no_position" });
    await expect(db.tx((tx) => doBuy(tx, pid, "frog", 5, "y", tick()))).rejects.toMatchObject({ code: "insufficient_funds" });
    await expect(db.tx((tx) => doExchange(tx, pid, "RUB", "BTC", 100, "z", tick()))).rejects.toMatchObject({ code: "bad_pair" });
    const t = tick();
    await db.tx((tx) => doWork(tx, pid, t));
    await expect(db.tx((tx) => doWork(tx, pid, t + 10))).rejects.toMatchObject({ code: "too_fast" });
  });

  it("selling costs tool energy; no energy → no sale", async () => {
    const pid = await newPlayer(db);
    await fundSol(pid);
    await db.tx((tx) => doBuy(tx, pid, "bcat", 0.3, "b", tick()));
    const t = clock + 2_000;
    await db.query("UPDATE players SET energy = 0, energy_updated_at = $2 WHERE id = $1", [pid, new Date(t - 1)]);
    await expect(db.tx((tx) => doSell(tx, pid, "bcat", 1, "s", t))).rejects.toMatchObject({ code: "no_energy" });
  });

  it("only owned tools can be equipped; bought tools modify damage", async () => {
    const pid = await newPlayer(db);
    await expect(db.tx((tx) => equipTool(tx, pid, "sell-button"))).rejects.toMatchObject({ code: "not_owned" });
    await db.query("UPDATE players SET level = 2 WHERE id = $1", [pid]);
    await db.query("UPDATE balances SET amount = 1000 WHERE player_id = $1 AND currency = 'USD'", [pid]);
    await db.tx((tx) => buyTool(tx, pid, "sell-button", "t1", tick()));
    await db.tx((tx) => doExchange(tx, pid, "USD", "SOL", 500, "e", tick()));
    await db.tx((tx) => doBuy(tx, pid, "dking", 1, "b", tick()));
    const s = await db.tx((tx) => doSell(tx, pid, "dking", 1, "s", tick(), 0.999));
    expect(s.damage.toolId).toBe("sell-button");
    expect(s.damage.amount).toBeCloseTo(s.saleUsd * 1.15, 1);
  });
});
