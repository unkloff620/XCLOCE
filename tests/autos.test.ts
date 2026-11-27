import { describe, expect, it } from "vitest";
import { act, freshDb, H, M, newPlayer, setMoney, wallet } from "./helpers.ts";
import { inPlayerTx } from "../src/server/game.ts";
import { resetConfigCache } from "../src/server/config.ts";
import { eventSave } from "../src/server/admin.ts";
import { runAutos } from "../src/server/systems/autos.ts";
import { moscowDay } from "../src/server/core.ts";
import { LOCK_AUTO } from "../src/content/heist.ts";
import { LOCATIONS } from "../src/content/locations.ts";

const T = Date.UTC(2026, 10, 10, 9); // 12:00 Moscow
const iso = (t: number) => new Date(t).toISOString();

describe("automation toggles", () => {
  it("the zone toggle is gone: it cannot be switched on, an old one does nothing", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await db.query("UPDATE players SET energy=200, energy_at=$2 WHERE id=$1", [p, new Date(T)]);
    await expect(act(db, p, "auto_set", { kind: "zone", target: "openspace", on: true }, T)).rejects.toThrow();
    await db.query("INSERT INTO autos (player_id, kind, target, mode, day, at) VALUES ($1,'zone','openspace','',$2,$3)", [p, moscowDay(T), new Date(T)]);
    expect(await runAutos(db, p, T)).toMatchObject({ tasks: 0, claims: 0 });
    expect(LOCATIONS.length).toBe(15);
  });

  it("«Автобой» with the bosses is gone: it cannot be switched on, an old one only off", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await expect(act(db, p, "auto_set", { kind: "boss", target: "datsik", on: true, mode: "pacan" }, T)).rejects.toMatchObject({ code: "auto_boss_gone" });
    const r = await act(db, p, "auto_set", { kind: "boss", target: "datsik", on: false }, T);
    expect(r.state.autos.bosses).toEqual({});
    expect(await runAutos(db, p, T + H)).toMatchObject({ hits: 0, fights: 0 });
  });

  it("«Автовзлом»: the padlocks left are paid at once and come off one by one, 6 hours each", async () => {
    const db = await freshDb();
    await eventSave(db, 1, { title: "Взлом", startsAt: iso(T - H), endsAt: iso(T + 72 * H), effects: { heistBoxes: 1 } });
    resetConfigCache();
    const p = await newPlayer(db);
    await db.query("INSERT INTO heist_boxes (player_id, slot, kind) VALUES ($1, 0, 'gold')", [p]);
    await setMoney(db, p, "TOOTH", LOCK_AUTO * 3 + 7);
    await act(db, p, "heist_auto", { slot: 0 }, T);
    expect(await wallet(db, p, "TOOTH")).toBe(7);
    const mid = await inPlayerTx(db, p, async () => null, { now: T + 12 * H + M });
    expect(mid.state.heist!.boxes[0]).toMatchObject({ done: 2, auto: true });
    const o = await act(db, p, "heist_open", { slot: 0 }, T + 18 * H + M);
    expect(o.result.rushed).toBe(false);
  });
});
