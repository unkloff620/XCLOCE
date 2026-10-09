import { describe, expect, it } from "vitest";
import { act, always, freshDb, give, H, newPlayer, wallet } from "./helpers.ts";
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

  it("boss controls: take a boss out, change his HP and rewards", async () => {
    const db = await freshDb();
    const T = Date.now();
    const iso = (t: number) => new Date(t).toISOString();
    const base = defaultConfig();
    await eventSave(db, 1, { title: "Дацкоу убран", startsAt: iso(T - H), endsAt: iso(T + 24 * H), effects: { bosses: { datsik: { visible: false } }, silent: true } });
    resetConfigCache();
    const cfg = await loadConfig(db, T);
    expect(cfg.bossOpen.datsik).toBe(false);
    expect(cfg.events[0].effects.silent).toBe(true);
    const p = await newPlayer(db);
    await expect(act(db, p, "fight_start", { boss: "datsik" }, T)).rejects.toMatchObject({ code: "boss_hidden" });
    expect(cfg.bossHp.datsik).toBe(base.bossHp.datsik);
    // put back (the later event wins), double HP, triple rewards
    await eventSave(db, 1, { title: "Дацкоу x2", startsAt: iso(T - H / 2), endsAt: iso(T + 24 * H), effects: { bosses: { datsik: { visible: true, hpPct: 200, rewardPct: 300 } }, silent: true } });
    resetConfigCache();
    const c2 = await loadConfig(db, T);
    expect(c2.bossOpen.datsik).toBe(true);
    expect(c2.bossHp.datsik).toBe(base.bossHp.datsik * 2);
    expect(c2.bossReward.datsik).toBeCloseTo(3);
    await db.query("INSERT INTO config (key, value) VALUES ('boss.hp', '{\"datsik\": 5}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
    resetConfigCache();
    await give(db, p, "keyboard", 1);
    const rub0 = await wallet(db, p, "RUB");
    const f = await act(db, p, "fight_start", { boss: "datsik" }, T);
    await act(db, p, "attack", { weapon: "keyboard" }, T, always(0));
    const c = await act(db, p, "fight_claim", { fightId: f.result.fightId }, T, always(0.99));
    expect(c.result.reward.currencies.RUB).toBe(150 * 3);
    expect(await wallet(db, p, "RUB")).toBeGreaterThanOrEqual(rub0 + 450);
  });
});
