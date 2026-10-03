import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "../src/server/db.ts";
import { act, always, freshDb, give, H, M, newPlayer, qty, setMoney, wallet } from "./helpers.ts";
import { energyNow, nextMoscowMidnight } from "../src/server/core.ts";
import { resetConfigCache } from "../src/server/config.ts";
import { fightView } from "../src/server/systems/combat.ts";
import { YARD_DROPS } from "../src/content/yard.ts";
import { levelFromXp } from "../src/content/levels.ts";
import { LOCATIONS } from "../src/content/locations.ts";
import { signInitData, signLoginWidget, validateInitData, validateLoginWidget } from "../src/server/auth.ts";

let db: Db;
let T0: number;
beforeEach(async () => {
  db = await freshDb();
  // noon in Moscow on the next day: always in the future and far from the daily reset
  T0 = nextMoscowMidnight(Date.now()) + 12 * H;
});

async function setBossHp(hp: Record<string, number>) {
  await db.query("INSERT INTO config (key, value) VALUES ('boss.hp', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(hp)]);
  resetConfigCache();
}
async function setEnergy(pid: number, e: number, at: number) {
  await db.query("UPDATE players SET energy=$2, energy_at=$3 WHERE id=$1", [pid, e, new Date(at)]);
}
const startDatsik = (pid: number, now = T0) => act(db, pid, "fight_start", { boss: "datsik" }, now);
const hit = (pid: number, weapon: string, now = T0, extra: Record<string, unknown> = {}) => act(db, pid, "attack", { weapon, ...extra }, now, always(0));

describe("energy", () => {
  const cfg = { max: 50, regenMin: 5 };
  it("regenerates +1 per 5 minutes up to 50", () => {
    expect(energyNow(45, 0, 4 * M, cfg).energy).toBe(45);
    expect(energyNow(45, 0, 5 * M, cfg).energy).toBe(46);
    expect(energyNow(45, 0, 12 * M, cfg)).toMatchObject({ energy: 47, at: 10 * M, nextIn: 3 * M });
    expect(energyNow(45, 0, 10 * H, cfg).energy).toBe(50);
  });
  it("never cuts energy above the maximum and does not regenerate there", () => {
    expect(energyNow(1500, 0, 10 * H, cfg)).toMatchObject({ energy: 1500, nextIn: 0 });
  });
  it("bought energy goes over 50; regen starts only after dropping below 50", async () => {
    const p = await newPlayer(db);
    await setEnergy(p, 45, T0);
    await setMoney(db, p, "RUB", 5000);
    let r = await act(db, p, "buy", { offerId: "energy-50" }, T0);
    expect(r.state.player.energy).toBe(95);
    r = await act(db, p, "task", { taskId: "os-standup" }, T0 + 10 * H);
    expect(r.state.player.energy).toBe(92);
    // spend down to 47, regen starts at that moment
    await setEnergy(p, 52, T0 + 11 * H);
    r = await act(db, p, "task", { taskId: "os-coffee" }, T0 + 11 * H);
    expect(r.state.player.energy).toBe(49);
    const s = await act(db, p, "equip", { itemId: "jeans" }, T0 + 11 * H + 5 * M);
    expect(s.state.player.energy).toBe(50);
  });
  it("tasks need enough energy", async () => {
    const p = await newPlayer(db);
    await setEnergy(p, 2, T0);
    await expect(act(db, p, "task", { taskId: "os-standup" }, T0)).rejects.toMatchObject({ code: "no_energy" });
  });
});

describe("boss fights: personal fights, shared damage", () => {
  it("a weapon is the only way to deal damage; consumables are spent", async () => {
    const p = await newPlayer(db);
    const f = await startDatsik(p);
    expect(f.state.fight).toMatchObject({ bossId: "datsik", hp: 1000, hpMax: 1000 });
    const r = await hit(p, "red-candle");
    expect(r.result).toMatchObject({ damage: 50, hp: 950, left: 2 });
    expect(await qty(db, p, "red-candle")).toBe(2);
    await expect(hit(p, "gpu")).rejects.toMatchObject({ code: "no_item" });
    expect((await fightView(db, p, f.result.fightId, 0, T0)).hp).toBe(950);
  });

  it("damage from the client is ignored: the server takes it from the catalog", async () => {
    const p = await newPlayer(db);
    await startDatsik(p);
    const r = await hit(p, "red-candle", T0, { damage: 999999 });
    expect(r.result.damage).toBe(50);
  });

  it("another player's hit lowers HP in my fight; fights started later do not get earlier hits", async () => {
    const a = await newPlayer(db), b = await newPlayer(db), c = await newPlayer(db);
    const fa = await startDatsik(a);
    await startDatsik(b);
    await hit(b, "red-candle");
    expect((await fightView(db, a, fa.result.fightId, 0, T0)).hp).toBe(950);
    const fc = await startDatsik(c, T0 + M);
    expect((await fightView(db, c, fc.result.fightId, 0, T0 + M)).hp).toBe(1000);
    await hit(a, "red-candle", T0 + 2 * M);
    expect((await fightView(db, a, fa.result.fightId, 0, T0 + 2 * M)).hp).toBe(900);
    expect((await fightView(db, c, fc.result.fightId, 0, T0 + 2 * M)).hp).toBe(950);
    const v = await fightView(db, a, fa.result.fightId, 0, T0 + 2 * M);
    expect(v.top.map((t) => t.damage).sort()).toEqual([50, 50]);
    expect(v.hits).toHaveLength(2);
  });

  it("one hit can finish several fights; each winner collects SOL, XP and a key", async () => {
    await setBossHp({ datsik: 100 });
    const a = await newPlayer(db), b = await newPlayer(db);
    const fa = await startDatsik(a);
    const fb = await startDatsik(b);
    await give(db, a, "keyboard", 1);
    const r = await hit(a, "keyboard");
    expect(r.result).toMatchObject({ status: "won", hp: 0, finished: 2 });
    const sb = await act(db, b, "fight_claim", { fightId: fb.result.fightId }, T0, always(0.99));
    expect(sb.result.status).toBe("won");
    expect(await qty(db, b, "key-datsik")).toBe(1);
    expect(await wallet(db, b, "SOL")).toBeCloseTo(0.02);
    const va = await fightView(db, a, fa.result.fightId, 0, T0);
    expect(va).toMatchObject({ status: "won", killerIsMe: true });
    // claiming twice does not pay twice
    await act(db, b, "fight_claim", { fightId: fb.result.fightId }, T0);
    expect(await qty(db, b, "key-datsik")).toBe(1);
  });

  it("after 8 hours the fight is lost: no key, weapons not returned", async () => {
    const p = await newPlayer(db);
    const f = await startDatsik(p);
    await hit(p, "red-candle");
    const later = T0 + 8 * H + 1000;
    await expect(hit(p, "red-candle", later)).rejects.toMatchObject({ code: "fight_over" });
    const s = await act(db, p, "equip", { itemId: "jeans" }, later);
    expect(s.state.fight).toBeNull();
    expect(s.state.pending).toEqual([{ fightId: f.result.fightId, bossId: "datsik", status: "lost" }]);
    expect(await qty(db, p, "red-candle")).toBe(2);
    const c = await act(db, p, "fight_claim", { fightId: f.result.fightId }, later);
    expect(c.result.status).toBe("lost");
    expect(await qty(db, p, "key-datsik")).toBe(0);
  });

  it("hits after a fight's time is over do not count for it", async () => {
    await setBossHp({ datsik: 100 });
    const a = await newPlayer(db), b = await newPlayer(db);
    const fa = await startDatsik(a);
    await startDatsik(b, T0 + 7 * H);
    await give(db, b, "keyboard", 1);
    const r = await hit(b, "keyboard", T0 + 9 * H);
    expect(r.result.status).toBe("won");
    expect((await fightView(db, a, fa.result.fightId, 0, T0 + 9 * H)).status).toBe("lost");
  });

  it("only one running fight; daily limit of 7 fights per boss", async () => {
    const p = await newPlayer(db);
    await startDatsik(p);
    await expect(startDatsik(p)).rejects.toMatchObject({ code: "fight_running" });
    await act(db, p, "fight_flee", {}, T0);
    for (let i = 1; i < 7; i++) {
      await startDatsik(p, T0 + i * M);
      await act(db, p, "fight_flee", {}, T0 + i * M);
    }
    await expect(startDatsik(p, T0 + 10 * M)).rejects.toMatchObject({ code: "fight_limit" });
  });

  it("3 keys of a boss open the next boss", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "fight_start", { boss: "kedr" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await give(db, p, "key-datsik", 2);
    await expect(act(db, p, "fight_start", { boss: "kedr" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await give(db, p, "key-datsik", 3);
    const r = await act(db, p, "fight_start", { boss: "kedr" }, T0);
    expect(r.state.fight?.bossId).toBe("kedr");
  });

  it("the mouse is permanent with a 1 hour cooldown", async () => {
    const p = await newPlayer(db);
    await startDatsik(p);
    const r = await hit(p, "mouse");
    expect(r.result).toMatchObject({ damage: 10, left: null });
    await expect(hit(p, "mouse", T0 + 59 * M)).rejects.toMatchObject({ code: "cooldown" });
    await hit(p, "mouse", T0 + 60 * M);
    expect(await qty(db, p, "mouse")).toBe(1);
  });

  it("20 players attacking at the same moment: no damage is lost", async () => {
    await setBossHp({ datsik: 5000 });
    const ps = await Promise.all(Array.from({ length: 20 }, () => newPlayer(db)));
    for (const p of ps) {
      await give(db, p, "red-candle", 5);
      await startDatsik(p);
    }
    await Promise.all(ps.flatMap((p) => [hit(p, "red-candle"), hit(p, "red-candle"), hit(p, "keyboard").catch(() => null)]));
    const [b] = await db.query<{ damage_total: number; last_seq: number }>("SELECT damage_total, last_seq FROM bosses WHERE id='datsik'");
    expect(b.damage_total).toBe(20 * 2 * 50);
    expect(b.last_seq).toBe(40);
    for (const p of ps) expect(await qty(db, p, "red-candle")).toBe(3);
  });

  it("the same idempotency key does not hit twice", async () => {
    const p = await newPlayer(db);
    await startDatsik(p);
    await hit(p, "red-candle", T0, { idem: "x1" });
    await hit(p, "red-candle", T0, { idem: "x1" });
    expect(await qty(db, p, "red-candle")).toBe(2);
  });
});

describe("yard", () => {
  it("one item every 5 minutes, at most 5, offline time counts; picking from a full yard restarts the timer", async () => {
    const p = await newPlayer(db);
    await db.query("UPDATE yard SET anchor_at=$2 WHERE player_id=$1", [p, new Date(T0)]);
    const look = async (now: number) => (await act(db, p, "equip", { itemId: "jeans" }, now, always(0))).state.yard;
    expect((await look(T0 + 12 * M)).count).toBe(2);
    const full = await look(T0 + 3 * H);
    expect(full).toMatchObject({ count: 5, nextAt: null });
    const items = (await db.query<{ id: number }>("SELECT id FROM yard_items WHERE player_id=$1", [p])).map((r) => r.id);
    const pick = await act(db, p, "yard_pick", { itemId: items[0] }, T0 + 3 * H, always(0));
    expect(pick.state.yard).toMatchObject({ count: 4, nextAt: T0 + 3 * H + 5 * M });
    expect((await look(T0 + 3 * H + 4 * M)).count).toBe(4);
    expect((await look(T0 + 3 * H + 5 * M)).count).toBe(5);
  });
  it("the mouse, GPU and Rug Pull Gun never drop in the yard", () => {
    const ids = YARD_DROPS.flatMap((d) => d.reward.items?.map((i) => i.id) ?? []);
    expect(ids).not.toContain("mouse");
    expect(ids).not.toContain("gpu");
    expect(ids).not.toContain("rug-pull-gun");
    expect(ids).toContain("red-candle");
  });
  it("a picked item goes to the inventory", async () => {
    const p = await newPlayer(db);
    await db.query("UPDATE yard SET anchor_at=$2 WHERE player_id=$1", [p, new Date(T0)]);
    // rng 0.999 → the last drop in the table: keyboard
    await act(db, p, "equip", { itemId: "jeans" }, T0 + 5 * M, always(0.9999));
    const [it] = await db.query<{ id: number; drop_id: string }>("SELECT id, drop_id FROM yard_items WHERE player_id=$1", [p]);
    expect(it.drop_id).toBe("keyboard");
    await act(db, p, "yard_pick", { itemId: it.id }, T0 + 5 * M);
    expect(await qty(db, p, "keyboard")).toBe(1);
    await expect(act(db, p, "yard_pick", { itemId: it.id }, T0 + 5 * M)).rejects.toMatchObject({ code: "yard_gone" });
  });
});

describe("shop and exchange", () => {
  it("buys with server prices; not enough money changes nothing", async () => {
    const p = await newPlayer(db);
    await act(db, p, "buy", { offerId: "candle-1", price: 1 }, T0);
    expect(await wallet(db, p, "RUB")).toBe(400);
    expect(await qty(db, p, "red-candle")).toBe(4);
    await expect(act(db, p, "buy", { offerId: "gpu-1" }, T0)).rejects.toMatchObject({ code: "no_money" });
    expect(await qty(db, p, "gpu")).toBe(0);
  });
  it("respects the 999 stack", async () => {
    const p = await newPlayer(db);
    await give(db, p, "red-candle", 995);
    await setMoney(db, p, "RUB", 100000);
    await expect(act(db, p, "buy", { offerId: "candle-10" }, T0)).rejects.toMatchObject({ code: "stack_full" });
  });
  it("idempotent purchase is charged once", async () => {
    const p = await newPlayer(db);
    await act(db, p, "buy", { offerId: "candle-1", idem: "b1" }, T0);
    await act(db, p, "buy", { offerId: "candle-1", idem: "b1" }, T0);
    expect(await wallet(db, p, "RUB")).toBe(400);
  });
  it("exchanges at the server rate minus the fee", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 900);
    const r = await act(db, p, "exchange", { from: "RUB", to: "USD", amount: 900 }, T0);
    expect(r.result.got).toBeCloseTo(9.5);
    expect(await wallet(db, p, "RUB")).toBe(0);
    await expect(act(db, p, "exchange", { from: "RUB", to: "USD", amount: 10 }, T0)).rejects.toMatchObject({ code: "no_money" });
    await expect(act(db, p, "exchange", { from: "USD", to: "RUB", amount: -5 }, T0)).rejects.toMatchObject({ code: "bad_amount" });
  });
});

describe("locations", () => {
  it("5 tasks, then the location reward opens the next location; replays pay half", async () => {
    const p = await newPlayer(db);
    await setEnergy(p, 5000, T0);
    const loc = LOCATIONS[0];
    await expect(act(db, p, "location_claim", { locationId: loc.id }, T0)).rejects.toMatchObject({ code: "not_done" });
    await expect(act(db, p, "task", { taskId: LOCATIONS[1].tasks[0].id }, T0)).rejects.toMatchObject({ code: "location_locked" });
    let last;
    for (const t of loc.tasks) for (let i = 0; i < t.steps; i++) last = await act(db, p, "task", { taskId: t.id }, T0);
    expect(last!.result.locationComplete).toBe(true);
    await expect(act(db, p, "task", { taskId: loc.tasks[0].id }, T0)).rejects.toMatchObject({ code: "task_done" });
    const usd0 = await wallet(db, p, "USD");
    const c = await act(db, p, "location_claim", { locationId: loc.id }, T0);
    expect(c.result).toMatchObject({ first: true, opened: "market" });
    expect((await wallet(db, p, "USD")) - usd0).toBe(5);
    expect(await qty(db, p, "tee-pump")).toBe(1);
    await act(db, p, "task", { taskId: LOCATIONS[1].tasks[0].id }, T0);
    for (const t of loc.tasks) for (let i = 0; i < t.steps; i++) await act(db, p, "task", { taskId: t.id }, T0);
    const usd1 = await wallet(db, p, "USD");
    const c2 = await act(db, p, "location_claim", { locationId: loc.id }, T0);
    expect(c2.result.first).toBe(false);
    expect((await wallet(db, p, "USD")) - usd1).toBe(2.5);
  });
});

describe("inventory and clans", () => {
  it("only owned clothes can be worn", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "equip", { itemId: "laser-eyes" }, T0)).rejects.toMatchObject({ code: "no_item" });
    await give(db, p, "laser-eyes", 1);
    const r = await act(db, p, "equip", { itemId: "laser-eyes" }, T0);
    expect(r.state.look.equipped.ACCESSORY).toBe("laser-eyes");
  });
  it("energy drink adds energy above the maximum", async () => {
    const p = await newPlayer(db);
    await give(db, p, "energy-drink", 1);
    const r = await act(db, p, "use", { itemId: "energy-drink" }, T0);
    expect(r.state.player.energy).toBe(60);
  });
  it("create, join, leave; the leader role passes on", async () => {
    const a = await newPlayer(db), b = await newPlayer(db);
    const c = await act(db, a, "clan_create", { name: "Хомяки", tag: "HMS", emblem: "bull", color: "#3ddc84" }, T0);
    await act(db, b, "clan_join", { clanId: c.result.clanId }, T0);
    await expect(act(db, b, "clan_create", { name: "Другие", tag: "OTH", emblem: "bull", color: "#3ddc84" }, T0)).rejects.toMatchObject({ code: "in_clan" });
    await act(db, a, "clan_leave", {}, T0);
    const [m] = await db.query<{ role: string }>("SELECT role FROM clan_members WHERE player_id=$1", [b]);
    expect(m.role).toBe("leader");
  });
});

describe("daily login reward", () => {
  const D = 24 * H;
  it("once per Moscow day, the streak grows, a missed day resets it, the cycle wraps after 7", async () => {
    const p = await newPlayer(db);
    const r1 = await act(db, p, "daily_claim", {}, T0);
    expect(r1.result).toMatchObject({ day: 1, streak: 1 });
    expect(r1.state.daily).toMatchObject({ available: false, day: 1, streak: 1 });
    expect(await wallet(db, p, "RUB")).toBe(800);
    await expect(act(db, p, "daily_claim", {}, T0 + 10 * H)).rejects.toMatchObject({ code: "daily_taken" });
    // 12:00 → next day 01:00 MSK
    const r2 = await act(db, p, "daily_claim", {}, T0 + 13 * H);
    expect(r2.result).toMatchObject({ day: 2, streak: 2 });
    expect(await qty(db, p, "red-candle")).toBe(5);
    // skip a day → back to day 1
    const r3 = await act(db, p, "daily_claim", {}, T0 + 3 * D);
    expect(r3.result).toMatchObject({ day: 1, streak: 1 });
    for (let i = 1; i < 7; i++) await act(db, p, "daily_claim", {}, T0 + (3 + i) * D);
    expect(await qty(db, p, "gpu")).toBe(1);
    const r8 = await act(db, p, "daily_claim", {}, T0 + 10 * D);
    expect(r8.result).toMatchObject({ day: 1, streak: 8 });
  });
});

describe("levels and auth", () => {
  it("level curve 100 × N^1.5", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelFromXp(100)).toEqual({ level: 2, into: 0, need: 283 });
    expect(levelFromXp(383 + 10).level).toBe(3);
  });
  it("Telegram initData and Login Widget signatures", () => {
    const token = "123:ABC";
    const now = Math.floor(Date.now() / 1000);
    const init = signInitData({ auth_date: String(now), user: JSON.stringify({ id: 42, first_name: "Kedr" }) }, token);
    expect(validateInitData(init, token).user.id).toBe(42);
    expect(() => validateInitData(init, "999:OTHER")).toThrow();
    const w = signLoginWidget({ id: 42, first_name: "Kedr", auth_date: now }, token);
    expect(validateLoginWidget(w, token).id).toBe(42);
    expect(() => validateLoginWidget({ ...w, id: 43 }, token)).toThrow();
  });
});
