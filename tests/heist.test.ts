import { describe, expect, it } from "vitest";
import { act, always, freshDb, give, H, M, newPlayer, qty, setMoney, wallet } from "./helpers.ts";
import { resetConfigCache } from "../src/server/config.ts";
import { eventSave } from "../src/server/admin.ts";
import type { Db } from "../src/server/db.ts";
import { HEIST_BOXES, HEIST_SLOTS, LOCK_RUSH, heistOdds, rollHeistLoot } from "../src/content/heist.ts";
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

  it("a win drops a box; padlocks are picked one by one, an hour each, or opened for dollars; the box opens", async () => {
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
    expect(s.result.pickEnds).toBe(T + H);
    await expect(act(db, p, "heist_pick", { slot: 0 }, T + 10 * M)).rejects.toMatchObject({ code: "heist_busy" });
    // an hour later the padlock is off; the box opens: money, weapons, parts, maybe stashes
    const o = await act(db, p, "heist_open", { slot: 0 }, T + H + M, always(0.5));
    expect(o.result.kind).toBe("bronze");
    expect(o.result.reward.currencies.RUB).toBeGreaterThan(0);
    expect(await qty(db, p, "keyboard")).toBeGreaterThan(0);
    expect(o.state.heist!.boxes).toEqual([]);

    // a gold box: three padlocks; one paid, the rest picked
    await db.query("INSERT INTO heist_boxes (player_id, slot, kind) VALUES ($1, 2, 'gold')", [p]);
    await setMoney(db, p, "USD", LOCK_RUSH + 5);
    const rush = await act(db, p, "heist_rush", { slot: 2 }, T + 2 * H);
    expect(rush.result.done).toBe(1);
    expect(await wallet(db, p, "USD")).toBe(5);
    await expect(act(db, p, "heist_rush", { slot: 2 }, T + 2 * H)).rejects.toMatchObject({ code: "no_money" });
    await act(db, p, "heist_pick", { slot: 2 }, T + 2 * H);
    // the player must come back to start the next one: the second lock is off, the third waits
    const later = await act(db, p, "heist_pick", { slot: 2 }, T + 4 * H);
    expect(later.state.heist!.boxes[0]).toMatchObject({ done: 2 });
    const st = await act(db, p, "heist_open", { slot: 2 }, T + 5 * H + 2 * M);
    expect(st.result.kind).toBe("gold");
  });

  it("all five cells taken: no more boxes; a diamond box always holds a tattoo piece not owned yet", async () => {
    const db = await freshDb();
    await heistOn(db);
    const p = await newPlayer(db);
    for (let i = 0; i < HEIST_SLOTS; i++) await db.query("INSERT INTO heist_boxes (player_id, slot, kind, locks_done) VALUES ($1,$2,'diamond',4)", [p, i]);
    const r = await winDatsik(db, p);
    expect(r.result.reward.heistBox).toBe("full");
    expect(r.state.heist!.boxes).toHaveLength(HEIST_SLOTS);
    const o = await act(db, p, "heist_open", { slot: 3 }, T + M);
    const ids = TATTOO_SETS.filter((s) => s.boss === "heist").flatMap((s) => s.pieces.map((x) => x.id));
    expect(ids).toContain(o.result.tattoo);
    expect(await qty(db, p, o.result.tattoo)).toBe(1);
    const o2 = await act(db, p, "heist_open", { slot: 4 }, T + M);
    expect(o2.result.tattoo).not.toBe(o.result.tattoo);
  });

  it("odds: weak bosses mostly bronze, the strongest a diamond about one time in four; richer boxes hold more", () => {
    expect(heistOdds(0).bronze).toBeGreaterThan(0.6);
    expect(heistOdds(1).diamond).toBeCloseTo(0.25);
    for (const t of [0, 0.5, 1]) expect(Object.values(heistOdds(t)).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const rub = HEIST_BOXES.map((b) => rollHeistLoot(b.id, always(0.5)).currencies!.RUB!);
    expect([...rub].sort((a, b) => a - b)).toEqual(rub);
    expect(HEIST_BOXES.map((b) => b.locks)).toEqual([1, 2, 3, 4]);
    expect(HEIST_BOXES.map((b) => b.tattoo)).toEqual([0.25, 0.5, 0.75, 1]);
  });
});
