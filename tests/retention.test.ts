import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/server/db.ts";
import { seed } from "../src/server/seed.ts";
import { doClaimDaily, doClaimQuest, doWear, doWork, getState } from "../src/server/game.ts";
import { DAILY_COOLDOWN_MS, DAILY_REWARDS } from "../src/shared/retention.ts";
import { freshDb, newPlayer } from "./helpers.ts";

let db: Db;
beforeEach(async () => { db = await freshDb(); await seed(db); });
afterEach(async () => { await db.close(); });

const rub = async (pid: number) => (await db.query<{ amount: number }>("SELECT amount FROM balances WHERE player_id=$1 AND currency='RUB'", [pid]))[0].amount;

describe("daily reward", () => {
  it("claims once per cooldown and builds a streak", async () => {
    const pid = await newPlayer(db);
    const t0 = Date.now();
    const before = await rub(pid);
    const r1 = await db.tx((tx) => doClaimDaily(tx, pid, t0));
    expect(r1.day).toBe(1);
    expect(await rub(pid)).toBeCloseTo(before + DAILY_REWARDS[0].amount!, 0);
    await expect(db.tx((tx) => doClaimDaily(tx, pid, t0 + 60_000))).rejects.toMatchObject({ code: "daily_cooldown" });
    const r2 = await db.tx((tx) => doClaimDaily(tx, pid, t0 + DAILY_COOLDOWN_MS + 1));
    expect(r2.day).toBe(2);
  });
  it("streak resets after 48 h", async () => {
    const pid = await newPlayer(db);
    const t0 = Date.now();
    await db.tx((tx) => doClaimDaily(tx, pid, t0));
    const r = await db.tx((tx) => doClaimDaily(tx, pid, t0 + 49 * 3_600_000));
    expect(r.day).toBe(1);
  });
});

describe("quests", () => {
  it("tracks progress from real actions and pays once", async () => {
    const pid = await newPlayer(db);
    let t = Date.now();
    for (let i = 0; i < 20; i++) await db.tx((tx) => doWork(tx, pid, (t += 500)));
    const st = await db.tx((tx) => getState(tx, pid, undefined, t));
    const q = st.quests.find((x) => x.id === "d_work")!;
    expect(q.progress).toBe(20);
    expect(q.done).toBe(true);
    const before = await rub(pid);
    await db.tx((tx) => doClaimQuest(tx, pid, "d_work", t));
    expect(await rub(pid)).toBeCloseTo(before + 2_500, 0);
    await expect(db.tx((tx) => doClaimQuest(tx, pid, "d_work", t))).rejects.toMatchObject({ code: "quest_claimed" });
    await expect(db.tx((tx) => doClaimQuest(tx, pid, "d_buy3", t))).rejects.toMatchObject({ code: "quest_not_done" });
  });
});

describe("wardrobe", () => {
  it("buys and wears cosmetics, respects level and funds", async () => {
    const pid = await newPlayer(db);
    const r = await db.tx((tx) => doWear(tx, pid, "hat-cap"));
    expect(r.bought).toBe(true);
    expect(r.outfit.hat).toBe("hat-cap");
    expect(await rub(pid)).toBeCloseTo(2_000, 0);
    await expect(db.tx((tx) => doWear(tx, pid, "hat-crown"))).rejects.toMatchObject({ code: "locked" });
    await expect(db.tx((tx) => doWear(tx, pid, "hoodie-grey"))).rejects.toMatchObject({ code: "insufficient_funds" });
    const again = await db.tx((tx) => doWear(tx, pid, "hat-none"));
    expect(again.bought).toBe(false);
    const back = await db.tx((tx) => doWear(tx, pid, "hat-cap"));
    expect(back.bought).toBe(false);
    const st = await db.tx((tx) => getState(tx, pid));
    expect(st.player.outfit.hat).toBe("hat-cap");
    expect(st.cosmetics).toContain("hat-cap");
  });
});
