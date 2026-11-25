import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "../src/server/db.ts";
import { act, freshDb, give, newPlayer, qty, setMoney, wallet, H, M } from "./helpers.ts";
import { makeCtx } from "../src/server/game.ts";
import { zarubTick } from "../src/server/systems/zarub.ts";
import { zarubLevel, zarubTasks, zarubXpFor, ZARUB_SETS } from "../src/content/zarub.ts";
import { TATTOO_SETS } from "../src/content/tattoos.ts";

let db: Db;
const T0 = Date.parse("2026-12-10T09:00:00Z");
beforeEach(async () => { db = await freshDb(); });

/** closes every task of the player's race (all kinds) */
async function closeAll(p: number, now: number) {
  const v = (await act(db, p, "zarub_close", {}, now)).result;
  for (const t of v.race.tasks) await db.tx(async (q) => zarubTick(await makeCtx(q, p, { now }), t.kind, t.target));
}

describe("«Зарубы»", () => {
  it("the level curve hits the user's numbers", () => {
    expect([1, 30, 60, 100].map(zarubXpFor)).toEqual([50, 5510, 20060, 53460]);
    expect(zarubLevel(49).level).toBe(0);
    expect(zarubLevel(5510).level).toBe(30);
    expect(zarubTasks("blat", "7")).toHaveLength(8);
    expect(new Set(zarubTasks("blat", "7").map((t) => t.kind)).size).toBe(8);
    expect(Object.values(ZARUB_SETS).flatMap((m) => m.sets)).toHaveLength(27);
    expect(TATTOO_SETS.filter((s) => s.boss === "zarub").every((s) => s.pieces.length === 42)).toBe(true);
  });

  it("a race: 4 bots, the tasks count, all 8 closed — first place, its rings, the nuggets, the опыт", async () => {
    const p = await newPlayer(db);
    const s = (await act(db, p, "zarub_start", { mode: "pacan" }, T0)).result;
    expect(s.race.rivals).toHaveLength(5);
    expect(s.race.rivals.filter((r: { bot: boolean }) => r.bot)).toHaveLength(4);
    await expect(act(db, p, "zarub_start", { mode: "pacan" }, T0)).rejects.toMatchObject({ code: "zarub_busy" });
    await expect(act(db, p, "zarub_start", { mode: "blat" }, T0)).rejects.toMatchObject({ code: "zarub_locked" });
    await closeAll(p, T0 + 5 * M);
    const v = (await act(db, p, "zarub_close", {}, T0 + 6 * M)).result;
    expect(v.race).toBeNull();
    expect(await qty(db, p, "gold-ring")).toBe(26 + 20);
    expect(await qty(db, p, "gold-nugget")).toBe(21);
    expect(v.xp).toBe(120);
    expect(v.modes.find((m: { id: string }) => m.id === "pacan").today).toBe(1);
  });

  it("a second player within 10 minutes takes a bot's seat; the later finisher is second", async () => {
    const a = await newPlayer(db), b = await newPlayer(db);
    await act(db, a, "zarub_start", { mode: "pacan" }, T0);
    const s = (await act(db, b, "zarub_start", { mode: "pacan" }, T0 + 5 * M)).result;
    expect(s.race.rivals.filter((r: { bot: boolean }) => !r.bot)).toHaveLength(2);
    await closeAll(a, T0 + 20 * M);
    await closeAll(b, T0 + 25 * M);
    expect(await qty(db, b, "gold-ring")).toBe(26 + 12);
    // after 10 minutes — a new race
    const c = await newPlayer(db);
    const s2 = (await act(db, c, "zarub_start", { mode: "pacan" }, T0 + 30 * M)).result;
    expect(s2.race.rivals.filter((r: { bot: boolean }) => !r.bot)).toHaveLength(1);
  });

  it("a task bought out for 4 слитка; time out — nothing", async () => {
    const p = await newPlayer(db);
    await act(db, p, "zarub_start", { mode: "pacan" }, T0);
    await setMoney(db, p, "GOLD", 10);
    const v = (await act(db, p, "zarub_skip", { index: 0 }, T0 + M)).result;
    expect(v.race.done).toBe(1);
    expect(await wallet(db, p, "GOLD")).toBe(6);
    const late = (await act(db, p, "zarub_close", {}, T0 + 25 * H)).result;
    expect(late.race).toBeNull();
    expect(await qty(db, p, "gold-ring")).toBe(0);
    await act(db, p, "zarub_start", { mode: "pacan" }, T0 + 25 * H);
  });

  it("15 nuggets melt into a ring; a bag gives a piece of its sets for rings", async () => {
    const p = await newPlayer(db);
    await give(db, p, "gold-nugget", 31);
    await act(db, p, "zarub_melt", {}, T0);
    expect(await qty(db, p, "gold-ring")).toBe(2);
    expect(await qty(db, p, "gold-nugget")).toBe(1);
    await expect(act(db, p, "zarub_bag", { mode: "pacan", bag: 0 }, T0)).rejects.toMatchObject({ code: "zarub_no_rings" });
    await give(db, p, "gold-ring", 40);
    const r = (await act(db, p, "zarub_bag", { mode: "pacan", bag: 0 }, T0)).result;
    expect(r.tattoo).toMatch(/^tat-zr-(barak|bones|ash)-/);
    expect(await qty(db, p, "gold-ring")).toBe(20);
    await expect(act(db, p, "zarub_bag", { mode: "blat", bag: 0 }, T0)).rejects.toMatchObject({ code: "zarub_locked" });
  });
});
