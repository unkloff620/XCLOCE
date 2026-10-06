import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "../src/server/db.ts";
import { act, always, freshDb, give, H, M, newPlayer, qty, setMoney, wallet } from "./helpers.ts";
import { energyNow, nextMoscowMidnight } from "../src/server/core.ts";
import { resetConfigCache } from "../src/server/config.ts";
import { fightView } from "../src/server/systems/combat.ts";
import { YARD_DROPS } from "../src/content/yard.ts";
import { levelFromXp } from "../src/content/levels.ts";
import { LOCATIONS } from "../src/content/locations.ts";
import { TALENT_THRESHOLDS, talentThreshold, talentsForDamage } from "../src/content/talents.ts";
import { MIGRATIONS } from "../src/server/migrations.ts";
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

  it("one hit can finish several fights; the reward follows each one's own damage", async () => {
    await setBossHp({ datsik: 1000 });
    const a = await newPlayer(db), b = await newPlayer(db), c = await newPlayer(db), d = await newPlayer(db);
    const fa = await startDatsik(a);
    const fb = await startDatsik(b);
    const fc = await startDatsik(c);
    const fd = await startDatsik(d);
    // b: a full share (2% = 20 → one fist hit is 10, a mouse 30); c: half a share (one fist hit = 1% → key); d: nothing
    await give(db, b, "mouse", 1);
    await hit(b, "mouse");
    await hit(c, "fist");
    await give(db, a, "rug-pull-gun", 2);
    await hit(a, "rug-pull-gun");
    const r = await hit(a, "rug-pull-gun");
    expect(r.result).toMatchObject({ status: "won", hp: 0, finished: 4 });

    const sb = await act(db, b, "fight_claim", { fightId: fb.result.fightId }, T0, always(0.99));
    expect(sb.result).toMatchObject({ status: "won", share: 1, key: true });
    expect(await qty(db, b, "key-datsik")).toBe(1);
    expect(await wallet(db, b, "SOL")).toBeCloseTo(0.02);

    const sc = await act(db, c, "fight_claim", { fightId: fc.result.fightId }, T0, always(0.99));
    expect(sc.result).toMatchObject({ share: 0.5, key: true });
    expect(await wallet(db, c, "SOL")).toBeCloseTo(0.01);
    expect(await qty(db, c, "key-datsik")).toBe(1);

    const sd = await act(db, d, "fight_claim", { fightId: fd.result.fightId }, T0, always(0.99));
    expect(sd.result).toMatchObject({ share: 0, key: false });
    expect(await wallet(db, d, "SOL")).toBe(0);
    expect(await qty(db, d, "key-datsik")).toBe(0);

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

  it("only one running fight; 7 won fights per boss per day, lost fights do not count", async () => {
    await setBossHp({ datsik: 10 });
    const p = await newPlayer(db);
    await give(db, p, "red-candle", 20);
    await startDatsik(p);
    await expect(startDatsik(p)).rejects.toMatchObject({ code: "fight_running" });
    // ten abandoned fights do not use up the limit
    await act(db, p, "fight_flee", {}, T0);
    for (let i = 1; i < 10; i++) {
      await startDatsik(p, T0 + i * M);
      await act(db, p, "fight_flee", {}, T0 + i * M);
    }
    for (let i = 0; i < 7; i++) {
      await startDatsik(p, T0 + (20 + i) * M);
      const r = await hit(p, "red-candle", T0 + (20 + i) * M);
      expect(r.result.status).toBe("won");
    }
    await expect(startDatsik(p, T0 + 40 * M)).rejects.toMatchObject({ code: "fight_limit" });
  });

  it("Дацкоу opens his things in the shop (10% each, the 10th unlucky win for sure); they are bought there, not given", async () => {
    await setBossHp({ datsik: 50 });
    const p = await newPlayer(db);
    expect(await qty(db, p, "tee-white")).toBe(0); // players start with no clothes
    expect(await qty(db, p, "sneakers")).toBe(0);
    const [{ equipped }] = await db.query<{ equipped: Record<string, string> }>("SELECT equipped FROM appearance WHERE player_id=$1", [p]);
    expect(equipped).toEqual({});
    // locked in the shop before it drops
    await setMoney(db, p, "RUB", 10_000);
    await expect(act(db, p, "buy", { offerId: "tee-white" }, T0)).rejects.toMatchObject({ code: "item_locked" });
    await give(db, p, "red-candle", 30);
    const D = 24 * H;
    const unlocks = async () => (await db.query<{ item_id: string }>("SELECT item_id FROM player_unlocks WHERE player_id=$1 ORDER BY item_id", [p])).map((r) => r.item_id);
    const win = async (i: number, rng: number) => {
      const t = T0 + Math.floor(i / 7) * D + (i % 7) * M;
      const f = await startDatsik(p, t);
      await hit(p, "red-candle", t);
      return act(db, p, "fight_claim", { fightId: f.result.fightId }, t, always(rng));
    };
    for (let i = 0; i < 9; i++) await win(i, 0.99);
    expect(await unlocks()).toEqual([]);
    const c = await win(9, 0.99);
    expect(await unlocks()).toHaveLength(1);
    expect(c.result.reward.unlocks).toHaveLength(1);
    // a lucky roll opens all the rest (test players own jeans already — owned things do not drop); the things are not given
    await win(10, 0.01);
    expect(await unlocks()).toEqual(["sneakers", "tee-white"]);
    expect(await qty(db, p, "tee-white")).toBe(0);
    const s = await act(db, p, "buy", { offerId: "tee-white" }, T0 + 2 * D);
    expect(s.state.unlocks).toContain("tee-white");
    expect(await qty(db, p, "tee-white")).toBe(1);
    // nothing left to open: no more rolls
    const after = await win(11, 0.01);
    expect(after.result.reward.unlocks).toBeUndefined();
  });

  it("«Соло»: others' damage does not touch my solo fight; my own win counts for the solo badge", async () => {
    await setBossHp({ datsik: 100 });
    const a = await newPlayer(db), b = await newPlayer(db);
    await act(db, a, "fight_start", { boss: "datsik" }, T0);
    const fb = await act(db, b, "fight_start", { boss: "datsik", solo: true }, T0);
    expect(fb.result.solo).toBe(true);
    await give(db, a, "rug-pull-gun", 1);
    const ra = await hit(a, "rug-pull-gun");
    expect(ra.result.status).toBe("won");
    let sb = await act(db, b, "equip", { itemId: "jeans" }, T0);
    expect(sb.state.fight).toMatchObject({ solo: true, hp: 100 });
    await expect(act(db, b, "achievement_claim", { id: "solo-1" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    await expect(act(db, b, "achievement_claim", { id: "soloboss-datsik" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    // the common (not solo) win over Датцкоу does not count for player a either
    await expect(act(db, a, "achievement_claim", { id: "soloboss-datsik" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    const h1 = await hit(b, "red-candle");
    expect(h1.result).toMatchObject({ status: "active", hp: 50 });
    const h2 = await hit(b, "red-candle");
    expect(h2.result).toMatchObject({ status: "won", hp: 0 });
    const c = await act(db, b, "fight_claim", { fightId: fb.result.fightId }, T0, always(0.99));
    expect(c.result).toMatchObject({ status: "won", share: 1, key: true });
    await act(db, b, "achievement_claim", { id: "solo-1" }, T0);
    // the per-boss badge: Датцкоу beaten solo — collected once, with its (bronze) reward; Кедр is still to do
    const rub = await wallet(db, b, "RUB");
    await act(db, b, "achievement_claim", { id: "soloboss-datsik" }, T0);
    expect(await wallet(db, b, "RUB")).toBe(rub + 500);
    await expect(act(db, b, "achievement_claim", { id: "soloboss-datsik" }, T0)).rejects.toMatchObject({ code: "achievement_taken" });
    await expect(act(db, b, "achievement_claim", { id: "soloboss-kedr" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    sb = await act(db, b, "equip", { itemId: "jeans" }, T0);
    expect(sb.state.fight).toBeNull();
  });

  it("the CLOSE statue adds crit damage while owned", async () => {
    const { totalBonus } = await import("../src/content/home.ts");
    expect(totalBonus({}, ["basic"], ["statue-close"]).critDamage).toBeCloseTo(0.25);
    expect(totalBonus({}, ["basic"], []).critDamage).toBe(0);
  });

  it("Фокус and Солнце open with a single key", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "fight_start", { boss: "fokus" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await give(db, p, "key-utilizator", 1);
    const r = await act(db, p, "fight_start", { boss: "fokus" }, T0);
    expect(r.state.fight?.bossId).toBe("fokus");
  });

  it("Вадим and Боцман stand between Князь and Утилизатор; who had Утилизатор open keeps it", async () => {
    const p = await newPlayer(db);
    await give(db, p, "key-knyaz", 3);
    await act(db, p, "fight_start", { boss: "vadim" }, T0);
    const q = await newPlayer(db);
    await give(db, q, "key-knyaz", 3);
    await expect(act(db, q, "fight_start", { boss: "utilizator" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    const { MIGRATIONS } = await import("../src/server/migrations.ts");
    await db.query(MIGRATIONS.find((m) => m.id === "v2-016-vadim-botsman")!.sql);
    expect(await qty(db, q, "key-vadim")).toBe(3);
    expect(await qty(db, q, "key-botsman")).toBe(3);
    const r = await act(db, q, "fight_start", { boss: "utilizator" }, T0);
    expect(r.state.fight?.bossId).toBe("utilizator");
  });

  it("Гаркуша and Mugo stand between Командате and Бабафей; who had Бабафей open keeps it", async () => {
    const p = await newPlayer(db);
    await give(db, p, "key-bebyakyan", 3);
    await expect(act(db, p, "fight_start", { boss: "babafey" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    const { MIGRATIONS } = await import("../src/server/migrations.ts");
    await db.query(MIGRATIONS.find((m) => m.id === "v2-017-garkusha-mugo")!.sql);
    expect(await qty(db, p, "key-garkusha")).toBe(3);
    expect(await qty(db, p, "key-mugo")).toBe(3);
    const r = await act(db, p, "fight_start", { boss: "babafey" }, T0);
    expect(r.state.fight?.bossId).toBe("babafey");
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

  it("the fist is permanent with a 1 hour cooldown; the mouse is a 30-damage consumable", async () => {
    const p = await newPlayer(db);
    await startDatsik(p);
    const r = await hit(p, "fist");
    expect(r.result).toMatchObject({ damage: 10, left: null });
    await expect(hit(p, "fist", T0 + 59 * M)).rejects.toMatchObject({ code: "cooldown" });
    await hit(p, "fist", T0 + 60 * M);
    expect(await qty(db, p, "fist")).toBe(1);
    await give(db, p, "mouse", 2);
    expect((await hit(p, "mouse", T0 + 61 * M)).result).toMatchObject({ damage: 30 });
    expect(await qty(db, p, "mouse")).toBe(1);
  });

  it("a new fight resets the fist cooldown", async () => {
    const p = await newPlayer(db);
    await startDatsik(p);
    await hit(p, "fist");
    await expect(hit(p, "fist", T0 + M)).rejects.toMatchObject({ code: "cooldown" });
    await act(db, p, "fight_flee", {}, T0 + 2 * M);
    await act(db, p, "fight_start", { boss: "datsik" }, T0 + 3 * M);
    expect((await hit(p, "fist", T0 + 4 * M)).result).toMatchObject({ damage: 10 });
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
  it("the fist, GPU and Rug Pull Gun never drop in the yard", () => {
    const ids = YARD_DROPS.flatMap((d) => d.reward.items?.map((i) => i.id) ?? []);
    expect(ids).not.toContain("fist");
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
  it("respects the 9999 stack", async () => {
    const p = await newPlayer(db);
    await give(db, p, "red-candle", 9995);
    await setMoney(db, p, "RUB", 100000);
    await expect(act(db, p, "buy", { offerId: "candle-1", qty: 10 }, T0)).rejects.toMatchObject({ code: "stack_full" });
  });
  it("sells weapons in batches with a discount", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 100000);
    await act(db, p, "buy", { offerId: "candle-1", qty: 10 }, T0); // 1000 − 2%
    expect(await wallet(db, p, "RUB")).toBe(100000 - 980);
    await act(db, p, "buy", { offerId: "mouse-1", qty: 1000 }, T0); // 60 000 − 10%
    expect(await wallet(db, p, "RUB")).toBe(100000 - 980 - 54000);
    expect(await qty(db, p, "mouse")).toBe(1000);
    await expect(act(db, p, "buy", { offerId: "mouse-1", qty: 7 }, T0)).rejects.toMatchObject({ code: "bad_qty" });
    await expect(act(db, p, "buy", { offerId: "tee-white", qty: 10 }, T0)).rejects.toMatchObject({ code: "bad_qty" });
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

describe("selling, nickname, slot machine 777", () => {
  it("yard finds sell for RUB, other things do not", async () => {
    const p = await newPlayer(db);
    await give(db, p, "spinner", 3);
    const r = await act(db, p, "sell", { itemId: "spinner", qty: 2 }, T0);
    expect(r.result).toMatchObject({ got: 120, left: 1 });
    expect(await wallet(db, p, "RUB")).toBe(620);
    await expect(act(db, p, "sell", { itemId: "spinner", qty: 5 }, T0)).rejects.toMatchObject({ code: "no_item" });
    await expect(act(db, p, "sell", { itemId: "fist" }, T0)).rejects.toMatchObject({ code: "not_sellable" });
  });

  it("nickname: paid, once per 24 h, unique, survives a Telegram re-login", async () => {
    const a = await newPlayer(db), b = await newPlayer(db);
    await setMoney(db, a, "RUB", 5000);
    await expect(act(db, a, "rename", { name: "x" }, T0)).rejects.toMatchObject({ code: "bad_nick" });
    const r = await act(db, a, "rename", { name: "  Хомяк   Кит " }, T0);
    expect(r.state.player.name).toBe("Хомяк Кит");
    expect(await wallet(db, a, "RUB")).toBe(4000);
    await expect(act(db, a, "rename", { name: "Другой" }, T0 + 23 * H)).rejects.toMatchObject({ code: "rename_cooldown" });
    await setMoney(db, b, "RUB", 5000);
    await expect(act(db, b, "rename", { name: "хомяк кит" }, T0)).rejects.toMatchObject({ code: "nick_taken" });
    await setMoney(db, b, "RUB", 10);
    await expect(act(db, b, "rename", { name: "Бедняк" }, T0)).rejects.toMatchObject({ code: "no_money" });
    const ok = await act(db, a, "rename", { name: "Другой" }, T0 + 25 * H);
    expect(ok.state.player.name).toBe("Другой");
  });

  it("slots: 3 spins per 60 minutes, 777 pays the jackpot", async () => {
    const p = await newPlayer(db);
    const s1 = await act(db, p, "slots_spin", {}, T0, always(0)); // lowest roll → first outcome = jackpot
    expect(s1.result).toMatchObject({ outcome: "jackpot", reels: ["seven", "seven", "seven"], left: 2 });
    expect(await qty(db, p, "gpu")).toBe(1);
    expect(await wallet(db, p, "SOL")).toBeCloseTo(0.07);
    const s2 = await act(db, p, "slots_spin", {}, T0 + 10 * M, always(0.999));
    expect(s2.result.kind).toBe("miss");
    expect(new Set(s2.result.reels).size).toBe(3);
    await act(db, p, "slots_spin", {}, T0 + 20 * M, always(0.5));
    await expect(act(db, p, "slots_spin", {}, T0 + 30 * M)).rejects.toMatchObject({ code: "slots_limit" });
    const st = await act(db, p, "slots_spin", {}, T0 + 61 * M, always(0.999));
    expect(st.state.slots).toMatchObject({ left: 0, nextAt: T0 + 70 * M });
  });
});

describe("home: equipment, rooms, look, help", () => {
  it("equipment levels cost money and add crits and damage to hits", async () => {
    await setBossHp({ datsik: 100000 });
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 20000);
    await startDatsik(p);
    const plain = await hit(p, "red-candle");
    expect(plain.result).toMatchObject({ damage: 50, crit: false });
    await act(db, p, "equipment_upgrade", { id: "chair" }, T0);
    await act(db, p, "equipment_upgrade", { id: "monitor2" }, T0);
    // the old money-bought system unit is gone from the shop (the computer is upgraded for talents now)
    await expect(act(db, p, "equipment_upgrade", { id: "pc" }, T0)).rejects.toMatchObject({ code: "bad_equipment" });
    expect(await wallet(db, p, "RUB")).toBe(20000 - 2500 - 3000);
    const r = await hit(p, "red-candle"); // rng 0 → always a crit once the chance is above zero
    expect(r.result).toMatchObject({ crit: true, damage: Math.round(50 * 1.6) });
    // level 2 of the monitor costs USD
    await expect(act(db, p, "equipment_upgrade", { id: "monitor2" }, T0)).rejects.toMatchObject({ code: "no_money" });
    const st = await act(db, p, "equipment_upgrade", { id: "rgb" }, T0);
    expect(st.state.home.levels).toMatchObject({ chair: 1, monitor2: 1, rgb: 1 });
    // players who bought it earlier keep its bonus
    await db.query("INSERT INTO player_equipment (player_id, equipment_id, level) VALUES ($1, 'pc', 1)", [p]);
    const legacy = await hit(p, "red-candle");
    expect(legacy.result.damage).toBe(Math.round(Math.round(50 * 1.03) * 1.6));
  });

  it("talents: the 1st for 100 damage, the 100th for 1 000 000, uneven steps in between", () => {
    expect(TALENT_THRESHOLDS.length).toBe(100);
    expect([talentThreshold(1), talentThreshold(100)]).toEqual([100, 1_000_000]);
    for (let k = 2; k <= 100; k++) expect(talentThreshold(k)).toBeGreaterThan(talentThreshold(k - 1));
    expect([0, 99, 100, talentThreshold(2) - 1, talentThreshold(2), 999_999, 1_000_000, 1_210_000].map(talentsForDamage)).toEqual([0, 0, 1, 1, 2, 99, 100, 110]);
    // not a plain 100·k² curve
    expect(TALENT_THRESHOLDS.filter((v, i) => v !== 100 * (i + 1) ** 2).length).toBeGreaterThan(80);
  });

  it("talents: the counter carries over between fights; weapon branches cost talents and boost only that weapon", async () => {
    await setBossHp({ datsik: 100000 });
    const p = await newPlayer(db);
    await give(db, p, "red-candle", 40);
    await startDatsik(p);
    expect((await hit(p, "red-candle")).result.talentsGained).toBe(0); // 50
    const t1 = await hit(p, "red-candle"); // 100
    expect(t1.result).toMatchObject({ fightDamage: 100, talentDamage: 100, talentsGained: 1 });
    expect(t1.state.player).toMatchObject({ talents: 1, talentDamage: 100 });
    // a new fight goes on from the same counter
    await act(db, p, "fight_flee", {}, T0);
    await startDatsik(p, T0 + M);
    let last = t1;
    const need = talentThreshold(2) - 100;
    for (let i = 0; i < Math.ceil(need / 50); i++) last = await hit(p, "red-candle", T0 + M);
    expect(last.state.fight?.myDamage).toBe(Math.ceil(need / 50) * 50);
    expect(last.state.player.talents).toBe(2);
    // branches: levels 1–3 cost 1 talent; the damage branch adds 10% to that weapon only
    const up = await act(db, p, "talent_up", { weapon: "red-candle", branch: "dmg" }, T0 + M);
    expect(up.result).toMatchObject({ level: 1, talents: 1 });
    expect(up.state.weaponTalents).toEqual({ "red-candle": { dmg: 1 } });
    const r = await hit(p, "red-candle", T0 + M);
    expect(r.result.damage).toBe(Math.round(50 * 1.1));
    await give(db, p, "mouse", 1);
    expect((await hit(p, "mouse", T0 + M)).result.damage).toBe(30);
    await act(db, p, "talent_up", { weapon: "fist", branch: "crit" }, T0 + M);
    await expect(act(db, p, "talent_up", { weapon: "fist", branch: "crit" }, T0 + M)).rejects.toMatchObject({ code: "no_talents" });
    await expect(act(db, p, "talent_up", { weapon: "nope", branch: "dmg" }, T0 + M)).rejects.toMatchObject({ code: "bad_talent" });
    await expect(act(db, p, "talent_up", { weapon: "fist", branch: "speed" }, T0 + M)).rejects.toMatchObject({ code: "bad_talent" });
  });

  it("talents migration: computer parts are refunded, damage so far is counted on the new curve", async () => {
    const p = await newPlayer(db);
    // before: 5 talents earned in fights, 3 of them spent on the GPU (levels 1 and 2), 20 000 damage dealt
    await db.query("UPDATE players SET talents = 2 WHERE id=$1", [p]);
    await db.query("INSERT INTO ledger (player_id, kind, key, delta, reason) VALUES ($1,'talent','talent',5,'fight:1')", [p]);
    await db.query("INSERT INTO player_equipment (player_id, equipment_id, level) VALUES ($1,'pc-gpu',2)", [p]);
    await db.query("UPDATE player_stats SET total_damage = 20000 WHERE player_id=$1", [p]);
    await db.exec(MIGRATIONS.find((m) => m.id === "v2-021-weapon-talents")!.sql);
    const [row] = await db.query<{ talents: number }>("SELECT talents FROM players WHERE id=$1", [p]);
    // 2 left + 3 refunded + (talents for 20 000 on the new curve − 5 already earned)
    expect(row.talents).toBe(2 + 3 + talentsForDamage(20000) - 5);
    expect(await db.query("SELECT 1 FROM player_equipment WHERE player_id=$1 AND equipment_id LIKE 'pc-%'", [p])).toHaveLength(0);
  });

  it("tasks hint: the cheapest step left in an open location", async () => {
    const p = await newPlayer(db);
    const st = await act(db, p, "help_seen", { topic: "home" }, T0);
    expect(st.state.tasks).toEqual({ minEnergy: 3, claimable: false });
    // a cleared location stops calling: only the next, not yet cleared one counts
    await db.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1, 'openspace', $2)", [p, new Date(T0)]);
    const st2 = await act(db, p, "help_seen", { topic: "yard" }, T0);
    const market = LOCATIONS.find((l) => l.id === "market")!;
    expect(st2.state.tasks.minEnergy).toBe(Math.min(...market.tasks.map((t) => t.energy)));
  });

  it("desk: four stages, upgraded in «Обстановка» for money, each with its bonus", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 5000);
    const r = await act(db, p, "equipment_upgrade", { id: "desk" }, T0);
    expect(r.result).toMatchObject({ level: 1, max: 3 });
    expect(r.state.home.bonus.critChance).toBeCloseTo(0.02);
    await expect(act(db, p, "equipment_upgrade", { id: "desk" }, T0)).rejects.toMatchObject({ code: "no_money" });
  });

  it("decor: any owned stage of a room thing can stand in the room; an upgrade shows the new one", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 3000);
    await act(db, p, "equipment_upgrade", { id: "chair" }, T0);
    await expect(act(db, p, "decor_set", { id: "chair", stage: 2 }, T0)).rejects.toMatchObject({ code: "locked" });
    const back = await act(db, p, "decor_set", { id: "chair", stage: 0 }, T0); // the old stool
    expect(back.state.home.decor).toEqual({ chair: 0 });
    expect(back.state.home.bonus.critChance).toBeCloseTo(0.02); // the bonus stays
    await expect(act(db, p, "decor_set", { id: "rgb", stage: 0 }, T0)).rejects.toMatchObject({ code: "bad_equipment" });
  });

  it("rooms: buy, switch, the bonus of every owned room counts", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "room_set", { id: "office" }, T0)).rejects.toMatchObject({ code: "room_locked" });
    await setMoney(db, p, "USD", 50);
    const b = await act(db, p, "room_buy", { id: "office" }, T0);
    expect(b.state.look.room).toBe("office");
    expect(b.state.home.bonus.critChance).toBeCloseTo(0.03);
    const back = await act(db, p, "room_set", { id: "basic" }, T0);
    expect(back.state.look.room).toBe("basic");
    expect(back.state.home.bonus.critChance).toBeCloseTo(0.03);
    await expect(act(db, p, "room_buy", { id: "office" }, T0)).rejects.toMatchObject({ code: "room_owned" });
  });

  it("look: only known options are kept; help topics are remembered once", async () => {
    const p = await newPlayer(db);
    const r = await act(db, p, "look_set", { hair: "spiky", hairColor: 5, eyes: 99, skin: 3 }, T0);
    expect(r.state.look.body).toEqual({ hair: "spiky", hairColor: 5, eyes: 0, skin: 3 });
    await act(db, p, "help_seen", { topic: "boss" }, T0);
    const h = await act(db, p, "help_seen", { topic: "boss" }, T0);
    expect(h.state.helpSeen).toEqual(["boss"]);
    await expect(act(db, p, "help_seen", { topic: "nope" }, T0)).rejects.toMatchObject({ code: "bad_topic" });
  });
});

describe("levels and auth", () => {
  it("authority curve: 1 003 for level 2, ~10 M for level 100, levels go past 100", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 1003 });
    expect(levelFromXp(1002).level).toBe(1);
    expect(levelFromXp(1003).level).toBe(2);
    expect(levelFromXp(13_000).level).toBe(10);
    expect(levelFromXp(1_100_000).level).toBe(50);
    expect(levelFromXp(10_200_000).level).toBe(100);
    expect(levelFromXp(100_000_000).level).toBe(200);
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

describe("admin", () => {
  it("logs actions (ok and refused), not hits", async () => {
    const { actions } = await import("../src/server/admin.ts");
    const p = await newPlayer(db);
    await act(db, p, "equip", { itemId: "jeans" }, T0);
    await expect(act(db, p, "buy", { offerId: "nope" }, T0)).rejects.toThrow();
    const rows = await actions(db, { playerId: p });
    expect(rows.map((r) => [r.type, r.ok])).toEqual([["buy", false], ["equip", true]]);
    expect(String(rows[1].info)).toContain("jeans");
  });
  it("edits are applied, written to the ledger and admin_log", async () => {
    const { edit, player } = await import("../src/server/admin.ts");
    const p = await newPlayer(db);
    await edit(db, 777, p, { op: "set_money", currency: "RUB", amount: 12345 });
    await edit(db, 777, p, { op: "set_item", item: "mouse", qty: 50 });
    await edit(db, 777, p, { op: "set_xp", value: 999 });
    await edit(db, 777, p, { op: "set_talent", weapon: "fist", branch: "dmg", level: 3 });
    await edit(db, 777, p, { op: "set_name", value: "Тест" });
    expect(await wallet(db, p, "RUB")).toBe(12345);
    expect(await qty(db, p, "mouse")).toBe(50);
    await edit(db, 777, p, { op: "set_item", item: "mouse", qty: 0 });
    expect(await qty(db, p, "mouse")).toBe(0);
    await expect(edit(db, 777, p, { op: "set_item", item: "fist", qty: 5 })).rejects.toThrow();
    const v = await player(db, p);
    expect(v.player.display_name).toBe("Тест");
    expect(Number(v.player.xp)).toBe(999);
    expect(v.talents).toEqual([{ weapon_id: "fist", branch: "dmg", level: 3 }]);
    expect(v.admin.length).toBe(6);
    expect(v.ledger.some((l) => l.reason === "admin:777" && l.key === "mouse" && Number(l.delta) === -50)).toBe(true);
  });
  it("a banned player cannot act until unbanned", async () => {
    const { edit } = await import("../src/server/admin.ts");
    const p = await newPlayer(db);
    await edit(db, 1, p, { op: "ban", reason: "читы" });
    await expect(act(db, p, "equip", { itemId: "jeans" }, T0)).rejects.toThrow(/заблокирован: читы/);
    await edit(db, 1, p, { op: "unban" });
    await act(db, p, "equip", { itemId: "jeans" }, T0);
  });
  it("admin sessions are separate from game sessions", async () => {
    const { issueAdminSession, verifyAdminSession, issueSession } = await import("../src/server/auth.ts");
    expect(verifyAdminSession(issueAdminSession(42))).toBe(42);
    expect(() => verifyAdminSession(issueSession(42))).toThrow();
  });
});

describe("admin sign-in confirmed in the Telegram app", () => {
  it("the browser gets the session only after the admin confirms, only once, only with its secret", async () => {
    const { startLogin, approveLogin, pollLogin } = await import("../src/server/admin-login.ts");
    const { verifyAdminSession } = await import("../src/server/auth.ts");
    await db.query("INSERT INTO config (key, value) VALUES ('admins', '[555]')");
    resetConfigCache();
    const s = await startLogin(db, "1.2.3.4", "Firefox");
    expect(await pollLogin(db, s.code, s.secret)).toEqual({ status: "pending" });
    await expect(approveLogin(db, s.code, 999, true)).rejects.toThrow(/Нет доступа/);
    const info = await approveLogin(db, s.code, 555, false);
    expect(info).toMatchObject({ ip: "1.2.3.4", ua: "Firefox", approved: false });
    expect(await pollLogin(db, s.code, s.secret)).toEqual({ status: "pending" });
    await approveLogin(db, s.code, 555, true);
    await expect(pollLogin(db, s.code, "wrong")).rejects.toThrow();
    const r = await pollLogin(db, s.code, s.secret);
    expect(r.status).toBe("ok");
    expect(verifyAdminSession(r.token!)).toBe(555);
    await expect(pollLogin(db, s.code, s.secret)).rejects.toThrow(/устарел/);
  });
});
