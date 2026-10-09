import { describe, expect, it } from "vitest";
import { freshDb, H } from "./helpers.ts";
import { defaultConfig, loadConfig, resetConfigCache } from "../src/server/config.ts";
import { eventSave } from "../src/server/admin.ts";

describe("game events", () => {
  it("change the numbers only inside their window and only when enabled", async () => {
    const db = await freshDb();
    const T = Date.UTC(2026, 9, 10, 12);
    const base = defaultConfig();
    await eventSave(db, 1, {
      title: "Выходные", description: "x2", startsAt: new Date(T).toISOString(), endsAt: new Date(T + 48 * H).toISOString(),
      effects: { energyRegen: 2, yardSpeed: 3, slotsSpins: 2, exchangeFee: 0, bossHp: 50, junk: 9 },
    });
    resetConfigCache();
    const before = await loadConfig(db, T - H);
    expect(before.events).toHaveLength(0);
    expect(before.energy.regenMin).toBe(base.energy.regenMin);
    resetConfigCache();
    const on = await loadConfig(db, T + H);
    expect(on.events.map((e) => e.title)).toEqual(["Выходные"]);
    expect(on.events[0].effects).not.toHaveProperty("junk");
    expect(on.energy.regenMin).toBeCloseTo(base.energy.regenMin / 2);
    expect(on.yard.spawnMin).toBeCloseTo(base.yard.spawnMin / 3);
    expect(on.slots.perHour).toBe(base.slots.perHour * 2);
    expect(on.exchange.fee).toBe(0);
    expect(on.bossHp.datsik).toBe(Math.round(base.bossHp.datsik / 2));
    resetConfigCache();
    expect((await loadConfig(db, T + 49 * H)).events).toHaveLength(0);
    await db.query("UPDATE game_events SET enabled=false");
    resetConfigCache();
    expect((await loadConfig(db, T + H)).events).toHaveLength(0);
  });

  it("refuse an end before the start", async () => {
    const db = await freshDb();
    await expect(eventSave(db, 1, { title: "x", startsAt: "2026-10-10T10:00:00Z", endsAt: "2026-10-10T09:00:00Z" })).rejects.toMatchObject({ code: "bad_event" });
  });
});
