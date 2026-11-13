import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "../src/server/db.ts";
import { act, always, freshDb, give, newPlayer, qty, setMoney, wallet } from "./helpers.ts";
import { makeCtx } from "../src/server/game.ts";
import { monthTick } from "../src/server/systems/monthly.ts";
import { resetConfigCache } from "../src/server/config.ts";
import { MONTHLY_TASKS, daysInMonth } from "../src/content/monthly.ts";

let db: Db;
/** 12:00 MSK on day `d` of December 2026 */
const at = (d: number) => Date.parse(`2026-12-${String(d).padStart(2, "0")}T09:00:00Z`);
const tick = async (p: number, now: number, ...a: Parameters<typeof monthTick> extends [unknown, ...infer R] ? R : never) =>
  db.tx(async (q) => monthTick(await makeCtx(q, p, { now }), ...a));
const view = async (p: number, now: number) => (await act(db, p, "notes_read", {}, now)).state.monthly!;

beforeEach(async () => {
  db = await freshDb();
  await db.query("INSERT INTO config (key, value) VALUES ('monthly', '{\"on\":true}') ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  resetConfigCache();
});

describe("«От звонка до звонка»", () => {
  it("a task for every day of the longest month", () => {
    expect(MONTHLY_TASKS).toHaveLength(31);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2026-12")).toBe(31);
  });

  it("only today's task counts; reaching the target closes the day", async () => {
    const p = await newPlayer(db);
    // day 2: «Подбери 5 вещей во дворе»
    await tick(p, at(2), "hits", 50);
    expect((await view(p, at(2))).progress).toBe(0);
    await tick(p, at(2), "yard", 4);
    let v = await view(p, at(2));
    expect(v.progress).toBe(4);
    expect(v.closed["2"]).toBeUndefined();
    await tick(p, at(2), "yard", 3);
    v = await view(p, at(2));
    expect(v.closed["2"]).toBe("done");
    expect(v.closedN).toBe(1);
  });

  it("a boss task counts the right boss (and mode)", async () => {
    const p = await newPlayer(db);
    await tick(p, at(4), "kill", 1, { boss: "kedr", mode: "pacan" });
    expect((await view(p, at(4))).closed["4"]).toBeUndefined();
    await tick(p, at(4), "kill", 1, { boss: "datsik", mode: "blat" });
    expect((await view(p, at(4))).closed["4"]).toBe("done");
    // day 16: Гаркуша only in «Блатной»
    await tick(p, at(16), "kill", 1, { boss: "garkusha", mode: "pacan" });
    expect((await view(p, at(16))).closed["16"]).toBeUndefined();
    await tick(p, at(16), "kill", 1, { boss: "garkusha", mode: "blat" });
    expect((await view(p, at(16))).closed["16"]).toBe("done");
  });

  it("the «social» task takes any of the three", async () => {
    const p = await newPlayer(db);
    await tick(p, at(31), "spit", 5);
    await tick(p, at(31), "pump", 5);
    await tick(p, at(31), "fight", 5);
    expect((await view(p, at(31))).closed["31"]).toBe("done");
  });

  it("a past day is bought out for 1 SOL; today and the future are not", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "SOL", 2);
    await expect(act(db, p, "month_buy", { day: 10 }, at(10))).rejects.toMatchObject({ code: "day_not_past" });
    await expect(act(db, p, "month_buy", { day: 12 }, at(10))).rejects.toMatchObject({ code: "day_not_past" });
    const r = await act(db, p, "month_buy", { day: 3 }, at(10));
    expect(r.state.monthly!.closed["3"]).toBe("bought");
    expect(await wallet(db, p, "SOL")).toBe(1);
    await expect(act(db, p, "month_buy", { day: 3 }, at(10))).rejects.toMatchObject({ code: "day_closed" });
    await act(db, p, "month_buy", { day: 4 }, at(10));
    await expect(act(db, p, "month_buy", { day: 5 }, at(10))).rejects.toMatchObject({ code: "no_money" });
  });

  it("rewards open by closed days, once each; the chest for the whole month", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "SOL", 40);
    await expect(act(db, p, "month_claim", { id: "t2" }, at(31))).rejects.toMatchObject({ code: "tier_locked" });
    for (let d = 1; d <= 2; d++) await act(db, p, "month_buy", { day: d }, at(31));
    const usd = await wallet(db, p, "USD");
    const r = await act(db, p, "month_claim", { id: "t2" }, at(31));
    expect(await wallet(db, p, "USD")).toBe(usd + 30);
    await expect(act(db, p, "month_claim", { id: "t2" }, at(31))).rejects.toMatchObject({ code: "tier_taken" });
    expect(r.state.monthly!.tiers.find((t) => t.id === "t2")!.got).toBeTruthy();
    for (let d = 3; d <= 30; d++) await act(db, p, "month_buy", { day: d }, at(31));
    await act(db, p, "month_claim", { id: "t5" }, at(31));
    expect(await qty(db, p, "energy-full")).toBe(2);
    await act(db, p, "month_claim", { id: "t10" }, at(31));
    await act(db, p, "month_claim", { id: "t20" }, at(31));
    // 30 of 31: the chest still waits for the last day
    await expect(act(db, p, "month_claim", { id: "all" }, at(31))).rejects.toMatchObject({ code: "tier_locked" });
    await tick(p, at(31), "spit", 15);
    const rpg = await qty(db, p, "rug-pull-gun");
    const c = await act(db, p, "month_claim", { id: "all" }, at(31), always(0));
    expect(c.result).toMatchObject({ chest: true });
    expect(await qty(db, p, "rug-pull-gun")).toBe(rpg + 59);
    expect(c.result.reward.currencies).toMatchObject({ USD: 200, RUB: 30_000, SOL: 3 });
    expect(c.result.reward.achPoints).toBe(20);
  });

  it("a new month starts empty", async () => {
    const p = await newPlayer(db);
    await tick(p, at(2), "yard", 5);
    const v = await view(p, Date.parse("2027-01-02T09:00:00Z"));
    expect(v.closedN).toBe(0);
    expect(v.month).toBe("2027-01");
  });

  it("off for the players until the admin turns it on", async () => {
    await db.query("DELETE FROM config WHERE key='monthly'");
    resetConfigCache();
    const p = await newPlayer(db);
    expect((await act(db, p, "notes_read", {}, at(2))).state.monthly).toBeNull();
    await tick(p, at(2), "yard", 5);
    await db.query("INSERT INTO config (key, value) VALUES ('monthly', '{\"on\":true}')");
    resetConfigCache();
    expect((await view(p, at(2))).closedN).toBe(0);
  });

  it("«До краёв» fills the energy up to the limit, not when full", async () => {
    const p = await newPlayer(db);
    await give(db, p, "energy-full", 2);
    await expect(act(db, p, "use", { itemId: "energy-full" }, at(2))).rejects.toMatchObject({ code: "energy_full" });
    await db.query("UPDATE players SET energy=5, energy_at=$2 WHERE id=$1", [p, new Date(at(2))]);
    const r = await act(db, p, "use", { itemId: "energy-full" }, at(2));
    expect(r.state.player.energy).toBe(r.state.player.energyMax);
    expect(await qty(db, p, "energy-full")).toBe(1);
  });
});
