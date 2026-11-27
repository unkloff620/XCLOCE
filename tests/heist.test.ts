import { describe, expect, it } from "vitest";
import { act, always, freshDb, give, H, M, newPlayer, qty, setMoney, wallet } from "./helpers.ts";
import { resetConfigCache } from "../src/server/config.ts";
import { eventSave } from "../src/server/admin.ts";
import type { Db } from "../src/server/db.ts";
import { HEIST_BOXES, HEIST_SLOTS, LOCK_RUSH, LOCK_RUSH_GOLD, heistLoot, heistOdds, rollHeistLoot } from "../src/content/heist.ts";
import { TATTOO_SETS } from "../src/content/tattoos.ts";

const T = Date.UTC(2026, 10, 10, 12);
const iso = (t: number) => new Date(t).toISOString();

async function heistOn(db: Db) {
  await eventSave(db, 1, { title: "Взлом", startsAt: iso(T - H), endsAt: iso(T + 72 * H), effects: { heistBoxes: 1 } });
  resetConfigCache();
}
/** a won Дацкоу fight, claimed: returns the claim */
async function winDatsik(db: Db, p: number, now = T, rng = always(0.99)) {
  await db.query("INSERT INTO config (key, value) VALUES ('boss.hp', '{\"datsik\": 100}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
  resetConfigCache();
  const f = await act(db, p, "fight_start", { boss: "datsik" }, now);
  await give(db, p, "rug-pull-gun", 1);
  await act(db, p, "attack", { weapon: "rug-pull-gun" }, now);
  return act(db, p, "fight_claim", { fightId: f.result.fightId }, now, rng);
}

describe("«Взлом»: boxes with padlocks", () => {
  it("nothing of it while the event is off", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    const r = await winDatsik(db, p);
    expect(r.result.reward.heistBox).toBeUndefined();
    expect(r.state.heist).toBeNull();
  });

  it("a win drops a box; padlocks are picked one by one, 6 hours each, or opened for teeth; the box opens", async () => {
    const db = await freshDb();
    await heistOn(db);
    const p = await newPlayer(db);
    const r = await winDatsik(db, p, T, always(0.01));
    expect(r.result.reward.heistBox).toBe("bronze"); // a weak boss, a low roll: bronze
    expect(r.state.heist).toMatchObject({ on: true, slots: HEIST_SLOTS });
    expect(r.state.heist!.boxes).toEqual([expect.objectContaining({ slot: 0, kind: "bronze", locks: 1, done: 0, pickEnds: null })]);
    // can't open with a padlock on
    await expect(act(db, p, "heist_open", { slot: 0 }, T)).rejects.toMatchObject({ code: "heist_locked" });
    const s = await act(db, p, "heist_pick", { slot: 0 }, T);
    expect(s.result.pickEnds).toBe(T + 6 * H);
    await expect(act(db, p, "heist_pick", { slot: 0 }, T + 10 * M)).rejects.toMatchObject({ code: "heist_busy" });
    // 6 hours later the padlock is off; the box opens: knives, pistols, nuggets (the «teeth» loot)
    const o = await act(db, p, "heist_open", { slot: 0 }, T + 6 * H + M, always(0.5));
    expect(o.result.kind).toBe("bronze");
    expect(o.result.pay).toBe("teeth");
    expect(await qty(db, p, "keyboard")).toBe(4);
    expect(await qty(db, p, "gold-nugget")).toBe(5);
    expect(o.state.heist!.boxes).toEqual([]);

    // a gold box: three padlocks; one paid in teeth, then (teeth short) one in bars, the last picked
    const t0 = T + 7 * H;
    await db.query("INSERT INTO heist_boxes (player_id, slot, kind) VALUES ($1, 2, 'gold'), ($1, 3, 'bronze')", [p]);
    await setMoney(db, p, "TOOTH", LOCK_RUSH + 5);
    await setMoney(db, p, "GOLD", LOCK_RUSH_GOLD);
    const rush = await act(db, p, "heist_rush", { slot: 2 }, t0);
    expect(rush.result).toMatchObject({ done: 1, paid: { currency: "TOOTH", amount: LOCK_RUSH } });
    expect(await wallet(db, p, "TOOTH")).toBe(5);
    const rush2 = await act(db, p, "heist_rush", { slot: 2 }, t0);
    expect(rush2.result).toMatchObject({ done: 2, paid: { currency: "GOLD", amount: LOCK_RUSH_GOLD } });
    await expect(act(db, p, "heist_rush", { slot: 2 }, t0)).rejects.toMatchObject({ code: "no_money" });
    await act(db, p, "heist_pick", { slot: 2 }, t0);
    // one box at a time
    await expect(act(db, p, "heist_pick", { slot: 3 }, t0 + M)).rejects.toMatchObject({ code: "heist_one" });
    const st = await act(db, p, "heist_open", { slot: 2 }, t0 + 6 * H + M);
    expect(st.result).toMatchObject({ kind: "gold", pay: "teeth" });
    // the other box can be picked now
    await act(db, p, "heist_pick", { slot: 3 }, t0 + 6 * H + 2 * M);
  });

  it("all five cells taken: no more boxes; a tattoo piece is one not owned yet", async () => {
    const db = await freshDb();
    await heistOn(db);
    const p = await newPlayer(db);
    for (let i = 0; i < HEIST_SLOTS; i++) await db.query("INSERT INTO heist_boxes (player_id, slot, kind, locks_done) VALUES ($1,$2,'diamond',4)", [p, i]);
    const r = await winDatsik(db, p);
    expect(r.result.reward.heistBox).toBe("full");
    expect(r.state.heist!.boxes).toHaveLength(HEIST_SLOTS);
    const o = await act(db, p, "heist_open", { slot: 3 }, T + M, always(0.01));
    const ids = TATTOO_SETS.filter((s) => s.boss === "heist").flatMap((s) => s.pieces.map((x) => x.id));
    expect(ids).toContain(o.result.tattoo);
    expect(await qty(db, p, o.result.tattoo)).toBe(1);
    const o2 = await act(db, p, "heist_open", { slot: 4 }, T + M, always(0.01));
    expect(o2.result.tattoo).not.toBe(o.result.tattoo);
  });

  it("a box with every padlock paid in gold bars holds the «bars» loot", async () => {
    const db = await freshDb();
    await heistOn(db);
    const p = await newPlayer(db);
    await db.query("INSERT INTO heist_boxes (player_id, slot, kind) VALUES ($1, 0, 'silver')", [p]);
    await setMoney(db, p, "GOLD", LOCK_RUSH_GOLD * 2);
    await act(db, p, "heist_rush", { slot: 0 }, T);
    await act(db, p, "heist_rush", { slot: 0 }, T);
    expect(await wallet(db, p, "GOLD")).toBe(0);
    const o = await act(db, p, "heist_open", { slot: 0 }, T + M, always(0.99));
    expect(o.result.pay).toBe("bars");
    expect(await qty(db, p, "keyboard")).toBe(24);
    expect(await qty(db, p, "gold-ring")).toBe(6);
    expect(await qty(db, p, "poker-chip")).toBe(1);
  });

  it("odds: weak bosses mostly bronze, the strongest a diamond about one time in four; richer boxes hold more", () => {
    expect(heistOdds(0).bronze).toBeGreaterThan(0.6);
    expect(heistOdds(1).diamond).toBeCloseTo(0.25);
    for (const t of [0, 0.5, 1]) expect(Object.values(heistOdds(t)).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const kb = HEIST_BOXES.map((b) => rollHeistLoot(b.id, always(0.5)).items!.find((i) => i.id === "keyboard")!.qty);
    expect([...kb].sort((a, b) => a - b)).toEqual(kb);
    expect(HEIST_BOXES.map((b) => b.locks)).toEqual([1, 2, 3, 4]);
    expect(HEIST_BOXES.map((b) => heistLoot(b.id, "teeth").tattoo)).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(HEIST_BOXES.map((b) => heistLoot(b.id, "bars").tattoo)).toEqual([0.2, 0.3, 0.4, 0.5]);
    // the gold and diamond boxes: «Ящик ништяков» openings as achievement points
    expect(rollHeistLoot("diamond", always(0.99), "bars").achPoints).toBeGreaterThan(0);
  });
});
