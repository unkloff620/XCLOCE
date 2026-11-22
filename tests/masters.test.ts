import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "../src/server/db.ts";
import { act, freshDb, newPlayer, qty, setMoney, wallet } from "./helpers.ts";
import { MASTERS, partPrice, pointSteps, totalSteps, energyOfStep } from "../src/content/masters.ts";
import { mastersView } from "../src/server/systems/masters.ts";

let db: Db;
const T0 = Date.parse("2026-12-10T09:00:00Z");
beforeEach(async () => { db = await freshDb(); });
const energy = (p: number, e: number) => db.query("UPDATE players SET energy=$2, energy_at=$3 WHERE id=$1", [p, e, new Date(T0)]);

describe("«Мастера»", () => {
  it("the user's numbers: 16 masters, the path's energy, the first prices, the caps", () => {
    expect(MASTERS).toHaveLength(16);
    expect(MASTERS.map((m) => m.energy)).toEqual([443, 542, 647, 942, 1002, 1008, 1164, 1224, 1240, 1425, 1607, 1700, 1837, 1967, 2103, 2249]);
    expect([0, 1, 2, 3, 4].map((s) => partPrice(MASTERS[0], s))).toEqual([
      { cur: "PAP", amount: 1120 }, { cur: "PAP", amount: 1250 }, { cur: "RUB", amount: 2 }, { cur: "PAP", amount: 1304 }, { cur: "PAP", amount: 1370 },
    ]);
    for (const m of MASTERS) {
      for (let s = 0; s < 5; s++) {
        const p = partPrice(m, s);
        expect(p.amount).toBeLessThanOrEqual(p.cur === "RUB" ? 30 : 10_000);
      }
      let sum = 0;
      for (let i = 0; i < totalSteps(m); i++) sum += energyOfStep(m, i);
      expect(sum).toBe(m.energy);
      expect(pointSteps(m).reduce((a, b) => a + b, 0)).toBe(totalSteps(m));
    }
    expect(partPrice(MASTERS[15], 4)).toEqual({ cur: "PAP", amount: 10_000 });
    expect(partPrice(MASTERS[15], 2)).toEqual({ cur: "RUB", amount: 30 });
    expect(partPrice(MASTERS[8], 1).cur).toBe("TOOTH");
  });

  it("buy the five parts, walk the path: the next master opens, the path starts again", async () => {
    const p = await newPlayer(db);
    const m = MASTERS[0];
    await expect(act(db, p, "master_step", { master: m.id }, T0)).rejects.toMatchObject({ code: "parts_needed" });
    await expect(act(db, p, "master_buy", { master: MASTERS[1].id, slot: 0 }, T0)).rejects.toMatchObject({ code: "master_locked" });
    await setMoney(db, p, "PAP", 100_000);
    await setMoney(db, p, "RUB", 100);
    for (let s = 0; s < 5; s++) await act(db, p, "master_buy", { master: m.id, slot: s }, T0);
    await expect(act(db, p, "master_buy", { master: m.id, slot: 0 }, T0)).rejects.toMatchObject({ code: "bought" });
    expect(await qty(db, p, m.parts[0])).toBeGreaterThanOrEqual(1);
    expect(await wallet(db, p, "RUB")).toBe(98);
    await energy(p, 10_000);
    let last;
    for (let i = 0; i < totalSteps(m); i++) last = await act(db, p, "master_step", { master: m.id }, T0);
    expect(last!.result).toMatchObject({ done: true, opened: MASTERS[1].id });
    const v = await mastersView(db, p);
    expect(v[0]).toMatchObject({ steps: 0, runs: 1, mastery: m.energy });
    expect(v[1].open).toBe(true);
    expect(v[0].best?.id).toBe(p);
  });
});
