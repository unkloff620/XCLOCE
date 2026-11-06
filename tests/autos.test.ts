import { describe, expect, it } from "vitest";
import { act, freshDb, H, M, newPlayer, setMoney, wallet } from "./helpers.ts";
import { inPlayerTx } from "../src/server/game.ts";
import { resetConfigCache } from "../src/server/config.ts";
import { eventSave } from "../src/server/admin.ts";
import { runAllAutos, runAutos } from "../src/server/systems/autos.ts";
import { LOCK_RUSH } from "../src/content/heist.ts";
import { LOCATIONS } from "../src/content/locations.ts";

const T = Date.UTC(2026, 10, 10, 9); // 12:00 Moscow
const iso = (t: number) => new Date(t).toISOString();

describe("automation toggles", () => {
  it("the zone spends the energy on its tasks, for today only", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await db.query("UPDATE players SET energy=200, energy_at=$2 WHERE id=$1", [p, new Date(T)]);
    const r = await act(db, p, "auto_set", { kind: "zone", target: "openspace", on: true }, T);
    expect(r.state.autos.zone).toBe("openspace");
    const steps = await db.query<{ n: number }>("SELECT COALESCE(SUM(steps),0)::int AS n FROM task_progress WHERE player_id=$1", [p]);
    expect(steps[0].n).toBeGreaterThan(0);
    const [{ energy }] = await db.query<{ energy: number }>("SELECT energy FROM players WHERE id=$1", [p]);
    expect(energy).toBeLessThan(Math.max(...LOCATIONS[0].tasks.map((t) => t.energy))); // spent down to less than a step
    // the next day the toggle is off by itself
    const next = await act(db, p, "auto_set", { kind: "zone", target: "openspace", on: false }, T + 24 * H);
    expect(next.state.autos.zone).toBeNull();
  });

  it("a boss toggle starts the fight and hits with the free weapons; one mode per boss", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await act(db, p, "auto_set", { kind: "boss", target: "datsik", on: true, mode: "pacan" }, T);
    const [f] = await db.query<{ id: number; my_hits: number; mode: string }>("SELECT id, my_hits, mode FROM fights WHERE player_id=$1", [p]);
    expect(f.mode).toBe("pacan");
    expect(Number(f.my_hits)).toBeGreaterThan(0);
    const r = await act(db, p, "auto_set", { kind: "boss", target: "datsik", on: true, mode: "blat" }, T + M);
    expect(r.state.autos.bosses).toEqual({ datsik: "blat" });
    // the cron runs everybody with a toggle today
    expect((await runAllAutos(db, T + 6 * H)).players).toBe(1);
    expect(await runAutos(db, p, T + 30 * H)).toMatchObject({ hits: 0, fights: 0 }); // tomorrow: nothing until switched on again
  });

  it("«Автовзлом»: the padlocks left are paid at once and come off one by one, an hour each, loot whole", async () => {
    const db = await freshDb();
    await eventSave(db, 1, { title: "Взлом", startsAt: iso(T - H), endsAt: iso(T + 72 * H), effects: { heistBoxes: 1 } });
    resetConfigCache();
    const p = await newPlayer(db);
    await db.query("INSERT INTO heist_boxes (player_id, slot, kind) VALUES ($1, 0, 'gold')", [p]);
    await setMoney(db, p, "USD", LOCK_RUSH * 3 + 7);
    await act(db, p, "heist_auto", { slot: 0 }, T);
    expect(await wallet(db, p, "USD")).toBe(7);
    const mid = await inPlayerTx(db, p, async () => null, { now: T + 2 * H + M });
    expect(mid.state.heist!.boxes[0]).toMatchObject({ done: 2, auto: true });
    const o = await act(db, p, "heist_open", { slot: 0 }, T + 3 * H + M);
    expect(o.result.rushed).toBe(false);
  });
});
