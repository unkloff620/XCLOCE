import { DEALER_TALKS, talkOfDay } from "../src/content/dealer-talk.ts";
import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "../src/server/db.ts";
import { achGot, act, always, freshDb, give, H, M, newPlayer, openRoads, qty, setMoney, wallet } from "./helpers.ts";
import { energyNow, nextMoscowMidnight } from "../src/server/core.ts";
import { resetConfigCache } from "../src/server/config.ts";
import { fightView } from "../src/server/systems/combat.ts";
import { YARD_DROPS } from "../src/content/yard.ts";
import { levelFromXp } from "../src/content/levels.ts";
import { slotLevel } from "../src/content/slots.ts";
import { LOCATIONS } from "../src/content/locations.ts";
import { BUSINESS_MAX_HOURS, LOCATION_BIZ, bizCellCost, bizCells, bizPerHour } from "../src/content/business.ts";
import { locationsView } from "../src/server/systems/locations.ts";
import { exchangeWindow } from "../src/content/currencies.ts";
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
/** rng: the dice of this request — a killing hit also draws the win's reward (it is granted at once, settleMyWins) */
const hit = (pid: number, weapon: string, now = T0, extra: Record<string, unknown> = {}, rng = 0) => act(db, pid, "attack", { weapon, ...extra }, now, always(rng));

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
  it("the only energy drink: up to the limit, never above; at most 20 in the bag, «Пополнить» for 5 gold bars", async () => {
    const p = await newPlayer(db);
    await setEnergy(p, 45, T0);
    await setMoney(db, p, "GOLD", 10);
    // not sold in the shop any more
    const { OFFERS } = await import("../src/content/shop.ts");
    expect(OFFERS.some((o) => o.give.item?.startsWith("energy"))).toBe(false);
    await give(db, p, "energy-drink", 3);
    const f = await act(db, p, "energy_refill", {}, T0);
    expect(f.result).toMatchObject({ added: 17, have: 20 });
    expect(await wallet(db, p, "GOLD")).toBe(5);
    await expect(act(db, p, "energy_refill", {}, T0)).rejects.toMatchObject({ code: "drinks_full" });
    // more never goes in over 20
    await act(db, p, "use", { itemId: "energy-drink" }, T0);
    expect(await qty(db, p, "energy-drink")).toBe(19);
    let r = await act(db, p, "use", { itemId: "energy-drink" }, T0).catch((e) => e);
    expect(r).toMatchObject({ code: "energy_full" });
    // spend some, drink: back to 50, not more
    r = await act(db, p, "task", { taskId: "os-standup" }, T0);
    expect(r.state.player.energy).toBe(50 - LOCATIONS[0].tasks[0].energy);
    r = await act(db, p, "use", { itemId: "energy-drink" }, T0);
    expect(r.state.player.energy).toBe(50);
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
    await give(db, p, "keyboard", 3);
    const r = await hit(p, "keyboard");
    expect(r.result).toMatchObject({ damage: 30, hp: 970, left: 2 });
    expect(await qty(db, p, "keyboard")).toBe(2);
    await expect(hit(p, "gpu")).rejects.toMatchObject({ code: "no_item" });
    expect((await fightView(db, p, f.result.fightId, 0, T0)).hp).toBe(970);
  });

  it("damage from the client is ignored: the server takes it from the catalog", async () => {
    const p = await newPlayer(db);
    await startDatsik(p);
    const r = await hit(p, "red-candle", T0, { damage: 999999 });
    expect(r.result.damage).toBe(12);
  });

  it("another player's hit lowers HP in my fight; fights started later do not get earlier hits", async () => {
    const a = await newPlayer(db), b = await newPlayer(db), c = await newPlayer(db);
    const fa = await startDatsik(a);
    await startDatsik(b);
    await hit(b, "red-candle");
    expect((await fightView(db, a, fa.result.fightId, 0, T0)).hp).toBe(988);
    const fc = await startDatsik(c, T0 + M);
    expect((await fightView(db, c, fc.result.fightId, 0, T0 + M)).hp).toBe(1000);
    await hit(a, "red-candle", T0 + 2 * M);
    expect((await fightView(db, a, fa.result.fightId, 0, T0 + 2 * M)).hp).toBe(976);
    expect((await fightView(db, c, fc.result.fightId, 0, T0 + 2 * M)).hp).toBe(988);
    const v = await fightView(db, a, fa.result.fightId, 0, T0 + 2 * M);
    expect(v.top.map((t) => t.damage).sort()).toEqual([12, 12]);
    expect(v.hits).toHaveLength(2);
  });

  it("damage is global: a hit on one boss lowers HP in fights with other bosses too (not in solo fights)", async () => {
    const a = await newPlayer(db), b = await newPlayer(db), c = await newPlayer(db);
    await give(db, b, "key-datsik", 3);
    await give(db, c, "key-datsik", 3);
    const fa = await startDatsik(a);
    const fb = await act(db, b, "fight_start", { boss: "kedr" }, T0);
    const fc = await act(db, c, "fight_start", { boss: "kedr", solo: true }, T0);
    await hit(a, "red-candle");
    expect((await fightView(db, b, fb.result.fightId, 0, T0)).hp).toBe(10_000 - 12);
    expect((await fightView(db, c, fc.result.fightId, 0, T0)).hp).toBe(10_000);
    await hit(b, "red-candle");
    const va = await fightView(db, a, fa.result.fightId, 0, T0);
    expect(va.hp).toBe(1000 - 24);
    expect(va.hits.map((h) => h.playerId).sort()).toEqual([a, b].sort());
    // the bosses still count their own damage
    const rows = await db.query<{ id: string; damage_total: number }>("SELECT id, damage_total FROM bosses WHERE id IN ('datsik','kedr','_all') ORDER BY id");
    expect(Object.fromEntries(rows.map((r) => [r.id, Number(r.damage_total)]))).toEqual({ _all: 24, datsik: 12, kedr: 12 });
  });

  it("one hit can finish several fights; everyone in the fight gets the full reward", async () => {
    await setBossHp({ datsik: 1000 });
    const a = await newPlayer(db), b = await newPlayer(db), c = await newPlayer(db), d = await newPlayer(db);
    const fa = await startDatsik(a);
    const fb = await startDatsik(b);
    const fc = await startDatsik(c);
    const fd = await startDatsik(d);
    // b and c hit (a mouse, a fist), d did not: everyone in the fight gets everything
    await hit(b, "mouse");
    await hit(c, "fist");
    await give(db, a, "rug-pull-gun", 4);
    for (let i = 0; i < 3; i++) await hit(a, "rug-pull-gun");
    const r = await hit(a, "rug-pull-gun");
    expect(r.result).toMatchObject({ status: "won", hp: 0, finished: 4 });

    const rubB = await wallet(db, b, "RUB"), rubC = await wallet(db, c, "RUB");
    const sb = await act(db, b, "fight_claim", { fightId: fb.result.fightId }, T0, always(0.99));
    expect(sb.result).toMatchObject({ status: "won", share: 1, key: true });
    expect(await qty(db, b, "key-datsik")).toBe(1);
    expect(await wallet(db, b, "RUB")).toBe(rubB + 5); // Дацкоу: +5 ₽

    const sc = await act(db, c, "fight_claim", { fightId: fc.result.fightId }, T0, always(0.99));
    expect(sc.result).toMatchObject({ share: 1, key: true });
    expect(await wallet(db, c, "RUB")).toBe(rubC + 5);
    expect(await qty(db, c, "key-datsik")).toBe(1);

    const sd = await act(db, d, "fight_claim", { fightId: fd.result.fightId }, T0, always(0.99));
    // d was in the fight without a hit: the full reward too
    expect(sd.result).toMatchObject({ share: 1, key: true });
    expect(await qty(db, d, "key-datsik")).toBe(1);

    const va = await fightView(db, a, fa.result.fightId, 0, T0);
    expect(va).toMatchObject({ status: "won", killerIsMe: true });
    // claiming twice does not pay twice
    await act(db, b, "fight_claim", { fightId: fb.result.fightId }, T0);
    expect(await qty(db, b, "key-datsik")).toBe(1);
  });

  it("the first boss gives his pass for any own hit in a won fight (a newcomer's fist on a big Дацкоу)", async () => {
    await setBossHp({ datsik: 5000 });
    const a = await newPlayer(db), c = await newPlayer(db);
    await startDatsik(a);
    const fc = await startDatsik(c);
    await hit(c, "fist"); // 12 of 5000 — far under 1%
    await give(db, a, "rug-pull-gun", 20);
    let r = await hit(a, "rug-pull-gun");
    while (r.result.status !== "won") r = await hit(a, "rug-pull-gun");
    const sc = await act(db, c, "fight_claim", { fightId: fc.result.fightId }, T0, always(0.99));
    expect(sc.result).toMatchObject({ status: "won", key: true });
    expect(await qty(db, c, "key-datsik")).toBe(1);
    await setBossHp({ datsik: 1000 });
  });

  it("after 8 hours the fight is lost: no key, weapons not returned", async () => {
    const p = await newPlayer(db);
    const f = await startDatsik(p);
    await give(db, p, "keyboard", 3);
    await hit(p, "keyboard");
    const later = T0 + 8 * H + 1000;
    await expect(hit(p, "keyboard", later)).rejects.toMatchObject({ code: "fight_over" });
    const s = await act(db, p, "equip", { itemId: "jeans" }, later);
    expect(s.state.fight).toBeNull();
    expect(s.state.pending).toEqual([{ fightId: f.result.fightId, bossId: "datsik", status: "lost" }]);
    expect(await qty(db, p, "keyboard")).toBe(2);
    const c = await act(db, p, "fight_claim", { fightId: f.result.fightId }, later);
    expect(c.result.status).toBe("lost");
    expect(await qty(db, p, "key-datsik")).toBe(0);
  });

  it("hits after a fight's time is over do not count for it", async () => {
    await setBossHp({ datsik: 100 });
    const a = await newPlayer(db), b = await newPlayer(db);
    const fa = await startDatsik(a);
    await startDatsik(b, T0 + 7 * H);
    await give(db, b, "rug-pull-gun", 1);
    const r = await hit(b, "rug-pull-gun", T0 + 9 * H);
    expect(r.result.status).toBe("won");
    expect((await fightView(db, a, fa.result.fightId, 0, T0 + 9 * H)).status).toBe("lost");
  });

  it("only one running fight; 7 won fights a day with Дацкоу (like the others), lost fights do not count", async () => {
    await setBossHp({ datsik: 10 });
    const p = await newPlayer(db);
    await give(db, p, "keyboard", 20);
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
      const r = await hit(p, "keyboard", T0 + (20 + i) * M);
      expect(r.result.status).toBe("won");
    }
    await expect(startDatsik(p, T0 + 40 * M)).rejects.toMatchObject({ code: "fight_limit" });
  });

  it("Дацкоу's things drop straight into the inventory (the 10th unlucky win for sure); not sold in the shop", async () => {
    // things drop only in «Блатной» (HP ×3): 20 × 3 = 60, one video card
    await setBossHp({ datsik: 20 });
    const p = await newPlayer(db);
    expect(await qty(db, p, "tee-white")).toBe(0); // players start with no clothes
    expect(await qty(db, p, "sneakers")).toBe(0);
    const [{ equipped }] = await db.query<{ equipped: Record<string, string> }>("SELECT equipped FROM appearance WHERE player_id=$1", [p]);
    expect(equipped).toEqual({});
    await setMoney(db, p, "RUB", 10_000);
    await expect(act(db, p, "buy", { offerId: "tee-white" }, T0)).rejects.toMatchObject({ code: "bad_offer" });
    await give(db, p, "gpu", 30);
    const D = 24 * H;
    const things = async () => (await db.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id IN ('sneakers','tee-white') ORDER BY item_id", [p])).map((r) => r.item_id);
    const win = async (i: number, rng: number) => {
      const t = T0 + Math.floor(i / 7) * D + (i % 7) * M;
      const f = await act(db, p, "fight_start", { boss: "datsik", mode: "blat" }, t);
      await hit(p, "gpu", t, {}, rng);
      return act(db, p, "fight_claim", { fightId: f.result.fightId }, t, always(rng));
    };
    // his things: the sneakers, the T-shirt (test players own jeans already — owned things do not drop) and his chair
    // (one of his things since 2026-11-27: opened in the room editor, not put into the inventory)
    const chair = async () => (await db.query("SELECT 1 FROM player_unlocks WHERE player_id=$1 AND item_id='piece:chair-datsik'", [p])).length;
    const got = async () => (await things()).length + (await chair());
    for (let i = 0; i < 9; i++) await win(i, 0.99);
    expect(await got()).toBe(0);
    const c = await win(9, 0.99);
    expect(await got()).toBe(1);
    expect(c.result.reward.unlocks.filter((id: string) => !id.startsWith("room:"))).toHaveLength(1);
    // a lucky roll gives one more — never all at once
    await win(10, 0.01);
    expect(await got()).toBe(2);
    await win(11, 0.01);
    expect(await things()).toEqual(["sneakers", "tee-white"]);
    expect(await chair()).toBe(1);
    // nothing opened to buy: the clothes are his already
    const [u] = await db.query("SELECT 1 FROM player_unlocks WHERE player_id=$1 AND item_id IN ('sneakers','tee-white')", [p]);
    expect(u).toBeUndefined();
    // nothing left to drop: no more rolls
    const after = await win(12, 0.01);
    expect((after.result.reward.unlocks ?? []).filter((id: string) => !id.startsWith("room:"))).toEqual([]);
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
    await expect(act(db, b, "achievement_claim", { id: "soloboss-datsik" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    // the common (not solo) win over Датцкоу does not count for player a either
    await expect(act(db, a, "achievement_claim", { id: "soloboss-datsik" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    await give(db, b, "gpu", 2);
    const h1 = await hit(b, "gpu");
    expect(h1.result).toMatchObject({ status: "active", hp: 40 });
    const h2 = await hit(b, "gpu");
    expect(h2.result).toMatchObject({ status: "won", hp: 0 });
    const c = await act(db, b, "fight_claim", { fightId: fb.result.fightId }, T0, always(0.99));
    expect(c.result).toMatchObject({ status: "won", share: 1, key: true });
    // the per-boss badge: Датцкоу beaten solo — collected once, for 2 achievement points; Кедр is still to do
    expect(await achGot(db, b, "soloboss-datsik")).toBe(true); // counted by itself
    await expect(act(db, b, "achievement_claim", { id: "soloboss-datsik" }, T0)).rejects.toMatchObject({ code: "achievement_taken" });
    await expect(act(db, b, "achievement_claim", { id: "soloboss-kedr" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    sb = await act(db, b, "equip", { itemId: "jeans" }, T0);
    expect(sb.state.fight).toBeNull();
  });

  it("the CLOSE statue adds damage while owned (crit power comes from talents only)", async () => {
    const { totalBonus } = await import("../src/content/home.ts");
    expect(totalBonus({}, ["basic"], []).damage).toBe(0);
  });

  it("«Связка ключей»: bosses open without passes and none are spent — but not Вадим and Боцман", async () => {
    const p = await newPlayer(db);
    await give(db, p, "keys-bundle", 1);
    await give(db, p, "key-datsik", 2);
    const r = await act(db, p, "fight_start", { boss: "kedr" }, T0);
    expect(r.state.fight?.bossId).toBe("kedr");
    expect(await qty(db, p, "key-datsik")).toBe(2);
    await act(db, p, "fight_flee", {}, T0).catch(() => {});
    const q = await newPlayer(db);
    await give(db, q, "keys-bundle", 1);
    await expect(act(db, q, "fight_start", { boss: "vadim" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await expect(act(db, q, "fight_start", { boss: "botsman" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    expect((await act(db, q, "fight_start", { boss: "knyaz" }, T0)).state.fight?.bossId).toBe("knyaz");
  });

  it("Фокус and Солнце open with a single key; «Псих» (a mentor) with one of Химик", async () => {
    const p = await newPlayer(db);
    await openRoads(db, p);
    await expect(act(db, p, "fight_start", { boss: "fokus" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await give(db, p, "key-utilizator", 1);
    const r = await act(db, p, "fight_start", { boss: "fokus" }, T0);
    expect(r.state.fight?.bossId).toBe("fokus");
    expect(r.state.fight?.hpMax).toBe(700_000_000);
    const q = await newPlayer(db);
    await db.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1,'night:moonbase',now())", [q]);
    await expect(act(db, q, "fight_start", { boss: "psih", mode: "blat" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await give(db, q, "key-himik", 1);
    const f = await act(db, q, "fight_start", { boss: "psih", mode: "blat" }, T0);
    expect(f.state.fight?.bossId).toBe("psih");
    expect(f.state.fight?.hpMax).toBe(300_000_000);
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

  it("Мугонатор and Командате swapped: Кедр → Мугонатор → Гаркуша → Командате → Бабафей; nobody loses an open boss", async () => {
    const { MIGRATIONS } = await import("../src/server/migrations.ts");
    // had Бабафей open (a key of Мугонатор, the old 5th) and Гаркуша open (3 keys of Командате, the old 3rd)
    const p = await newPlayer(db), q = await newPlayer(db);
    await give(db, p, "key-mugo", 1);
    await give(db, q, "key-bebyakyan", 3);
    await expect(act(db, p, "fight_start", { boss: "babafey" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await expect(act(db, q, "fight_start", { boss: "garkusha" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await db.query(MIGRATIONS.find((m) => m.id === "v2-057-mugo-bebyakyan-swap")!.sql);
    expect((await act(db, p, "fight_start", { boss: "babafey" }, T0)).state.fight?.bossId).toBe("babafey");
    expect((await act(db, q, "fight_start", { boss: "garkusha" }, T0)).state.fight?.bossId).toBe("garkusha");
    // Мугонатор opens with Кедр's keys now
    const r = await newPlayer(db);
    await give(db, r, "key-kedr", 3);
    expect((await act(db, r, "fight_start", { boss: "mugo" }, T0)).state.fight?.bossId).toBe("mugo");
  });

  it("no road: no location has to be cleared, only the previous boss's passes open a boss", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "fight_start", { boss: "kedr" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await db.query("INSERT INTO inventory (player_id, item_id, qty) VALUES ($1,'key-datsik',5)", [p]);
    expect((await act(db, p, "fight_start", { boss: "kedr" }, T0)).state.fight?.bossId).toBe("kedr");
  });

  it("3 keys of a boss open the next boss", async () => {
    const p = await newPlayer(db);
    await openRoads(db, p);
    await expect(act(db, p, "fight_start", { boss: "kedr" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await give(db, p, "key-datsik", 2);
    await expect(act(db, p, "fight_start", { boss: "kedr" }, T0)).rejects.toMatchObject({ code: "boss_locked" });
    await give(db, p, "key-datsik", 3);
    const r = await act(db, p, "fight_start", { boss: "kedr" }, T0);
    expect(r.state.fight?.bossId).toBe("kedr");
  });

  it("passes are spent on entering the fight; a win keeps them spent, a lost or fled fight gives them back", async () => {
    await setBossHp({ kedr: 50 });
    const p = await newPlayer(db);
    await give(db, p, "key-datsik", 4);
    await act(db, p, "fight_start", { boss: "kedr" }, T0);
    expect(await qty(db, p, "key-datsik")).toBe(1);
    // my running fight keeps the boss open in the list
    const { bossList } = await import("../src/server/systems/combat.ts");
    const { loadConfig } = await import("../src/server/config.ts");
    expect((await bossList(db, p, await loadConfig(db), T0)).bosses.find((b) => b.id === "kedr")?.unlocked).toBe(true);
    // fled: the passes come back
    const fled = await act(db, p, "fight_flee", {}, T0 + M);
    expect(fled.result.keysBack).toBe(3);
    expect(await qty(db, p, "key-datsik")).toBe(4);
    // won: they stay spent, and the next fight needs three more
    const f = await act(db, p, "fight_start", { boss: "kedr" }, T0 + 2 * M);
    await give(db, p, "gpu", 1);
    expect((await hit(p, "gpu", T0 + 2 * M)).result.status).toBe("won");
    await act(db, p, "fight_claim", { fightId: f.result.fightId }, T0 + 2 * M, always(0.99));
    expect(await qty(db, p, "key-datsik")).toBe(1);
    await expect(act(db, p, "fight_start", { boss: "kedr" }, T0 + 3 * M)).rejects.toMatchObject({ code: "boss_locked" });
    // 8 hours over: the passes come back
    await give(db, p, "key-datsik", 3);
    await act(db, p, "fight_start", { boss: "kedr" }, T0 + 4 * M);
    expect(await qty(db, p, "key-datsik")).toBe(0);
    await act(db, p, "equip", { itemId: "jeans" }, T0 + 4 * M + 8 * H + 1000);
    expect(await qty(db, p, "key-datsik")).toBe(3);
  });

  it("the fist, the mouse and the candle are free for everyone, with an 8 hour cooldown each", async () => {
    await setBossHp({ datsik: 100000 });
    const p = await newPlayer(db);
    expect([await qty(db, p, "fist"), await qty(db, p, "mouse"), await qty(db, p, "red-candle")]).toEqual([1, 1, 1]);
    await startDatsik(p);
    const r = await hit(p, "fist");
    expect(r.result).toMatchObject({ damage: 20, left: null });
    expect((await hit(p, "mouse")).result).toMatchObject({ damage: 5, left: null });
    expect((await hit(p, "red-candle")).result).toMatchObject({ damage: 12, left: null });
    await expect(hit(p, "fist", T0 + 479 * M)).rejects.toMatchObject({ code: "cooldown" });
    await expect(hit(p, "mouse", T0 + 479 * M)).rejects.toMatchObject({ code: "cooldown" });
    // ready again after 8 hours (the fight itself lasts 8, so it is the next fight's)
    const cds = await db.query<{ item_id: string; ready_at: Date }>("SELECT item_id, ready_at FROM cooldowns WHERE player_id=$1 AND item_id IN ('fist','mouse')", [p]);
    expect(cds.map((c) => new Date(c.ready_at).getTime() - T0)).toEqual([480 * M, 480 * M]);
    expect([await qty(db, p, "fist"), await qty(db, p, "mouse"), await qty(db, p, "red-candle")]).toEqual([1, 1, 1]);
    // the mouse and the candle are no longer sold
    const { OFFERS } = await import("../src/content/shop.ts");
    expect(OFFERS.some((o) => ["mouse", "red-candle"].includes(o.give.item ?? ""))).toBe(false);
  });

  it("a new fight resets the free weapons' rest; the boss leaving resets it too; fleeing does not", async () => {
    await setBossHp({ datsik: 100000 });
    const p = await newPlayer(db);
    await startDatsik(p);
    await hit(p, "fist");
    // fled: no fresh fist in the next fight (no endless flee + restart)
    await act(db, p, "fight_flee", {}, T0 + 2 * M);
    await act(db, p, "fight_start", { boss: "datsik" }, T0 + 3 * M);
    await expect(hit(p, "fist", T0 + 4 * M)).rejects.toMatchObject({ code: "cooldown" });

    // the boss is beaten (by someone else): the fist is rested at once, and the next fight starts with it ready
    await setBossHp({ datsik: 30 });
    const q = await newPlayer(db);
    const k = await newPlayer(db);
    await startDatsik(q, T0 + 10 * M);
    await startDatsik(k, T0 + 10 * M);
    await hit(q, "fist", T0 + 11 * M);
    expect(await db.query("SELECT 1 FROM cooldowns WHERE player_id=$1 AND item_id='fist'", [q])).toHaveLength(1);
    await hit(k, "red-candle", T0 + 12 * M); // 20 + 12 ≥ 30: the boss falls
    expect(await db.query("SELECT 1 FROM cooldowns WHERE player_id=$1 AND item_id='fist'", [q])).toHaveLength(0);

    // the time ran out (the boss left): the rest is gone as well
    await setBossHp({ datsik: 100000 });
    const r = await newPlayer(db);
    await startDatsik(r, T0 + 20 * M);
    await hit(r, "fist", T0 + 21 * M);
    await act(db, r, "fight_start", { boss: "datsik" }, T0 + 20 * M + 8 * 60 * M + M);
    expect((await hit(r, "fist", T0 + 20 * M + 8 * 60 * M + 2 * M)).result.damage).toBeGreaterThan(0);
  });

  it("20 players attacking at the same moment: no damage is lost", async () => {
    await setBossHp({ datsik: 5000 });
    const ps = await Promise.all(Array.from({ length: 20 }, () => newPlayer(db)));
    for (const p of ps) {
      await give(db, p, "keyboard", 5);
      await startDatsik(p);
    }
    await Promise.all(ps.flatMap((p) => [hit(p, "keyboard"), hit(p, "keyboard"), hit(p, "gpu").catch(() => null)]));
    const [b] = await db.query<{ damage_total: number; last_seq: number }>("SELECT damage_total, last_seq FROM bosses WHERE id='datsik'");
    expect(b.damage_total).toBe(20 * 2 * 30);
    expect(b.last_seq).toBe(40);
    for (const p of ps) expect(await qty(db, p, "keyboard")).toBe(3);
  });

  it("the same idempotency key does not hit twice", async () => {
    const p = await newPlayer(db);
    await startDatsik(p);
    await give(db, p, "keyboard", 3);
    await hit(p, "keyboard", T0, { idem: "x1" });
    await hit(p, "keyboard", T0, { idem: "x1" });
    expect(await qty(db, p, "keyboard")).toBe(2);
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
  it("only a rare keyboard drops in the yard of all the weapons", () => {
    const ids = YARD_DROPS.flatMap((d) => d.reward.items?.map((i) => i.id) ?? []);
    for (const w of ["fist", "mouse", "red-candle", "gpu", "rug-pull-gun"]) expect(ids).not.toContain(w);
    expect(ids).toContain("keyboard");
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
    const rub0 = await wallet(db, p, "RUB");
    await act(db, p, "buy", { offerId: "keyboard-1", price: 1 }, T0);
    expect(await wallet(db, p, "RUB")).toBe(rub0 - 4);
    expect(await qty(db, p, "keyboard")).toBe(1);
    await setMoney(db, p, "RUB", 4);
    await expect(act(db, p, "buy", { offerId: "gpu-1" }, T0)).rejects.toMatchObject({ code: "no_money" });
    expect(await qty(db, p, "gpu")).toBe(0);
  });
  it("weapons have no practical stack limit: ×99 999 at once", async () => {
    const p = await newPlayer(db);
    await give(db, p, "keyboard", 9995);
    await setMoney(db, p, "RUB", 100_000_000);
    await act(db, p, "buy", { offerId: "keyboard-1", qty: 99999 }, T0);
    expect(await qty(db, p, "keyboard")).toBe(9995 + 99999);
  });
  it("sells weapons in batches with a discount", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 300000);
    await act(db, p, "buy", { offerId: "keyboard-1", qty: 10 }, T0); // 40 − 2%
    expect(await wallet(db, p, "RUB")).toBe(300000 - 39);
    await act(db, p, "buy", { offerId: "keyboard-1", qty: 1000 }, T0); // 4 000 − 10%
    expect(await wallet(db, p, "RUB")).toBe(300000 - 39 - 3600);
    expect(await qty(db, p, "keyboard")).toBe(1010);
    await expect(act(db, p, "buy", { offerId: "keyboard-1", qty: 7 }, T0)).rejects.toMatchObject({ code: "bad_qty" });
    await expect(act(db, p, "buy", { offerId: "tee-pump", qty: 10 }, T0)).rejects.toMatchObject({ code: "bad_qty" });
  });
  it("idempotent purchase is charged once", async () => {
    const p = await newPlayer(db);
    const rub0 = await wallet(db, p, "RUB");
    await act(db, p, "buy", { offerId: "keyboard-1", idem: "b1" }, T0);
    await act(db, p, "buy", { offerId: "keyboard-1", idem: "b1" }, T0);
    expect(await wallet(db, p, "RUB")).toBe(rub0 - 4);
  });
  it("the exchanger's schedule: a cycle of days with Moscow hours, or always / never", () => {
    const day0 = Date.UTC(2026, 0, 3) - 3 * H; // a Moscow midnight
    const n0 = Math.floor((day0 + 3 * H) / (24 * H));
    const s = { mode: "cycle" as const, every: 2, offset: n0 % 2, from: 12, to: 20 };
    expect(exchangeWindow(day0 + 11 * H, s)).toMatchObject({ open: false, until: day0 + 12 * H });
    expect(exchangeWindow(day0 + 13 * H, s)).toMatchObject({ open: true, until: day0 + 20 * H });
    expect(exchangeWindow(day0 + 21 * H, s)).toMatchObject({ open: false, until: day0 + 2 * 24 * H + 12 * H });
    expect(exchangeWindow(day0 + 24 * H + 13 * H, s).open).toBe(false);
    expect(exchangeWindow(day0, { ...s, mode: "always" }).open).toBe(true);
    expect(exchangeWindow(day0 + 13 * H, { ...s, mode: "closed" }).open).toBe(false);
  });
  it("the exchanger: папиросы and зубы go for жетоны and рубли only; no rate yet — refused", async () => {
    await db.query("DELETE FROM config WHERE key='exchange.schedule'");
    resetConfigCache();
    const p = await newPlayer(db);
    await setMoney(db, p, "PAP", 900);
    let open = T0;
    while (!exchangeWindow(open).open) open += 24 * H;
    await expect(act(db, p, "exchange", { from: "PAP", to: "TOKEN", amount: 900 }, open + 24 * H)).rejects.toMatchObject({ code: "exchange_closed" });
    await expect(act(db, p, "exchange", { from: "PAP", to: "TOKEN", amount: 900 }, open)).rejects.toMatchObject({ code: "no_rate" });
    // the other way and the other currencies are not traded at all
    await expect(act(db, p, "exchange", { from: "RUB", to: "PAP", amount: 100 }, open)).rejects.toMatchObject({ code: "bad_request" });
    await expect(act(db, p, "exchange", { from: "PAP", to: "GOLD", amount: 100 }, open)).rejects.toMatchObject({ code: "bad_request" });
  });
  it("«Строительный ящик»: 8 tokens a spin, one level-0 part by rarity", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "TOKEN", 20);
    const { TOOLBOX_PARTS } = await import("../src/content/toolbox.ts");
    const r = await act(db, p, "toolbox_spin", {}, T0, always(0.01));
    const got = TOOLBOX_PARTS.find((x) => x.id === r.result.itemId)!;
    expect(got.rarity).toBe("epic");
    expect(await qty(db, p, got.id)).toBe(1);
    // the first spin rolled 25% off the next one (6 tokens) for a minute
    expect(r.result.discount.pct).toBe(25);
    const r2 = await act(db, p, "toolbox_spin", {}, T0 + 30_000, always(0.9));
    expect(r2.result.paid).toBe(6);
    expect(await wallet(db, p, "TOKEN")).toBe(6);
    expect(r2.result.discount.pct).toBe(75);
    // the discount burns after its minute: full price again
    await expect(act(db, p, "toolbox_spin", {}, T0 + 30_000 + 2 * 60_000)).rejects.toMatchObject({ code: "no_money" });
  });
  it("craft: parts are not sold in the scheme any more", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "TOKEN", 100);
    await expect(act(db, p, "part_buy", { itemId: "part-nails", qty: 1 }, T0)).rejects.toMatchObject({ code: "not_sold" });
  });
  it("a good talk with the dealer may give a better rate for 2 hours; once a day, only while the exchange works", async () => {
    // the default schedule (the live one from the migration — 11:00–3:00 — is not what these times expect)
    await db.query("DELETE FROM config WHERE key='exchange.schedule'");
    resetConfigCache();
    const p = await newPlayer(db);
    let open = T0;
    while (!exchangeWindow(open).open) open += 24 * H;
    let closed = open;
    while (exchangeWindow(closed).open) closed += 3 * H;
    await expect(act(db, p, "dealer_talk", { answers: [0, 0, 0] }, closed)).rejects.toMatchObject({ code: "exchange_closed" });
    const talk = talkOfDay(new Date(open + 3 * H).toISOString().slice(0, 10), p);
    const best = talk.steps.map((st) => st.answers.findIndex((x) => x.score === 2));
    expect(DEALER_TALKS.length).toBeGreaterThanOrEqual(11);
    for (const t of DEALER_TALKS) for (const st of t.steps) expect(st.answers.map((x) => x.score).sort()).toEqual([0, 1, 2]);
    const r = await act(db, p, "dealer_talk", { answers: best }, open, always(0.1));
    expect(r.result).toMatchObject({ score: talk.steps.length * 2, bonus: 0.1 });
    expect(r.state.dealerTalk).toMatchObject({ talked: true, bonus: 0.1 });
    await expect(act(db, p, "dealer_talk", { answers: best }, open + 60_000)).rejects.toMatchObject({ code: "talked" });
  });
});

describe("locations", () => {
  it("one pass of every location costs the energy of the user's table", () => {
    const pass = [166, 278, 364, 519, 675, 779, 969, 1082, 1307, 1537, 1676, 1935, 2077, 2377, 2651];
    expect(LOCATIONS.map((l) => l.tasks.reduce((a, t) => a + t.energy * t.steps, 0))).toEqual(pass);
    expect(LOCATIONS.map((l) => l.night.reduce((a, t) => a + t.energy * t.steps, 0))).toEqual([223, 356, 470, 635, 848, 986, 1211, 1362, 1660, 1944, 2133, 2434, 2639, 3006, 3346]);
  });
  it("first location tasks take at least 5 steps, later ones more; a task finished before the change is not paid twice", async () => {
    expect(Math.min(...LOCATIONS[0].tasks.map((t) => t.steps))).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < LOCATIONS.length; i++) {
      expect(Math.min(...LOCATIONS[i].tasks.map((t) => t.steps))).toBeGreaterThan(Math.min(...LOCATIONS[i - 1].tasks.map((t) => t.steps)));
    }
    const p = await newPlayer(db);
    await setEnergy(p, 5000, T0);
    const t = LOCATIONS[0].tasks[0];
    // done under the old count (2 steps): the done reward was paid then
    await db.query("INSERT INTO task_progress (player_id, task_id, steps, done_at) VALUES ($1,$2,2,now())", [p, t.id]);
    let last;
    for (let i = 2; i < t.steps; i++) last = await act(db, p, "task", { taskId: t.id }, T0);
    expect(last!.result.steps).toBe(t.steps);
    expect(last!.result.done).toBeNull();
  });
  it("5 tasks, then the location reward opens the next location; every pass pays the same", async () => {
    const p = await newPlayer(db);
    await setEnergy(p, 5000, T0);
    const loc = LOCATIONS[0];
    await expect(act(db, p, "location_claim", { locationId: loc.id }, T0)).rejects.toMatchObject({ code: "not_done" });
    await expect(act(db, p, "task", { taskId: LOCATIONS[1].tasks[0].id }, T0)).rejects.toMatchObject({ code: "location_locked" });
    // tasks open one by one
    await expect(act(db, p, "task", { taskId: loc.tasks[1].id }, T0)).rejects.toMatchObject({ code: "task_locked" });
    let last;
    for (const t of loc.tasks) for (let i = 0; i < t.steps; i++) last = await act(db, p, "task", { taskId: t.id }, T0);
    expect(last!.result.locationComplete).toBe(true);
    await expect(act(db, p, "task", { taskId: loc.tasks[0].id }, T0)).rejects.toMatchObject({ code: "task_done" });
    const usd0 = await wallet(db, p, "PAP");
    const c = await act(db, p, "location_claim", { locationId: loc.id }, T0);
    expect(c.result).toMatchObject({ first: true, opened: "market" });
    expect((await wallet(db, p, "PAP")) - usd0).toBe(300);
    expect(await qty(db, p, "tee-pump")).toBe(0);
    expect(await qty(db, p, "keyboard")).toBeGreaterThanOrEqual(1);
    await act(db, p, "task", { taskId: LOCATIONS[1].tasks[0].id }, T0);
    for (const t of loc.tasks) for (let i = 0; i < t.steps; i++) await act(db, p, "task", { taskId: t.id }, T0);
    const usd1 = await wallet(db, p, "PAP");
    const c2 = await act(db, p, "location_claim", { locationId: loc.id }, T0);
    expect(c2.result.first).toBe(false);
    expect((await wallet(db, p, "PAP")) - usd1).toBe(300);
  });
  it("night road: own tasks, ночной авторитет, the reward in зубы, the day road untouched", async () => {
    const p = await newPlayer(db);
    await setEnergy(p, 5000, T0);
    const loc = LOCATIONS[0];
    expect(loc.night).toHaveLength(loc.tasks.length);
    await expect(act(db, p, "task", { taskId: loc.night[1].id }, T0)).rejects.toMatchObject({ code: "task_locked" });
    await expect(act(db, p, "location_claim", { locationId: loc.id, mode: "night" }, T0)).rejects.toMatchObject({ code: "not_done" });
    let last;
    for (const t of loc.night) for (let i = 0; i < t.steps; i++) last = await act(db, p, "task", { taskId: t.id }, T0);
    expect(last!.result).toMatchObject({ locationComplete: true, mode: "night" });
    const [nr] = await db.query<{ rep: number }>("SELECT rep FROM location_night_rep WHERE player_id=$1 AND location_id=$2", [p, loc.id]);
    expect(Number(nr.rep)).toBeGreaterThan(0);
    expect(await db.query("SELECT 1 FROM location_rep WHERE player_id=$1", [p])).toHaveLength(0);
    const t0 = await wallet(db, p, "TOOTH");
    const c = await act(db, p, "location_claim", { locationId: loc.id, mode: "night" }, T0);
    expect(c.result).toMatchObject({ first: false, opened: null, mode: "night" });
    expect((await wallet(db, p, "TOOTH")) - t0).toBe(300);
    // the day road is still closed for the first time, the next location still shut
    await expect(act(db, p, "task", { taskId: LOCATIONS[1].tasks[0].id }, T0)).rejects.toMatchObject({ code: "location_locked" });
    const view = await locationsView(db, p, T0);
    expect(view[0]).toMatchObject({ clears: 0, done: 0, night: { clears: 1, done: 0 } });
  });
  it("business: the user's table — 2–3 businesses a location, 4…8 cells; a cell 1 100 + 150 a location + 150 a cell", () => {
    expect(LOCATIONS.every((l) => (LOCATION_BIZ[l.id] ?? []).length >= 2)).toBe(true);
    expect(LOCATIONS.map((l) => bizCells(l))).toEqual([4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8]);
    expect([0, 1, 2, 3].map((n) => bizCellCost(LOCATIONS[0], n))).toEqual([1100, 1250, 1400, 1550]);
    expect(bizCellCost(LOCATIONS[14], 0)).toBe(3200);
    for (const l of LOCATIONS) for (const d of LOCATION_BIZ[l.id]) expect(bizPerHour(l, d, bizCells(l))).toBe(d.max);
    expect(LOCATION_BIZ.genesis.map((d) => [d.kind, d.max])).toEqual([["xp", 327], ["loc", 351], ["pap", 435]]);
  });
  it("business: cells for папиросы, each adds its share of the top profit, every hour, a week at most", async () => {
    const p = await newPlayer(db);
    const loc = LOCATIONS[0];
    const [coffee, printer] = LOCATION_BIZ.openspace; // авторитет игроку 120, авторитет локации 160; 4 cells each
    await setMoney(db, p, "PAP", 1_000_000);
    await expect(act(db, p, "business_up", { bizId: coffee.id }, T0)).rejects.toMatchObject({ code: "business_locked" });
    await db.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1,$2,now())", [p, loc.id]);
    await expect(act(db, p, "business_up", { bizId: coffee.id }, T0)).rejects.toMatchObject({ code: "business_locked" });
    await db.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1,$2,now())", [p, `night:${loc.id}`]);
    await expect(act(db, p, "business_claim", {}, T0)).rejects.toMatchObject({ code: "not_yet" });
    await act(db, p, "business_up", { bizId: coffee.id }, T0);
    await act(db, p, "business_up", { bizId: printer.id }, T0);
    expect(await wallet(db, p, "PAP")).toBe(1_000_000 - 2 * 1100);
    let v = (await locationsView(db, p, T0)).find((x) => x.id === loc.id)!.business;
    expect(v.lines[0]).toMatchObject({ cells: 1, perHour: 30, nextPerHour: 60, cost: 1250 });
    expect(v.hour).toEqual({ xp: 30, loc: 40, pap: 0 });
    await expect(act(db, p, "business_claim", {}, T0 + 59 * M)).rejects.toMatchObject({ code: "not_yet" });
    const pap = await wallet(db, p, "PAP");
    const c = await act(db, p, "business_claim", {}, T0 + 3 * H + 20 * M);
    expect(c.result).toMatchObject({ hours: 3, xp: 90, loc: 120, pap: 0 });
    expect(await wallet(db, p, "PAP")).toBe(pap);
    const [lr] = await db.query<{ rep: number }>("SELECT rep FROM location_rep WHERE player_id=$1 AND location_id=$2", [p, loc.id]);
    expect(Number(lr.rep)).toBe(120);
    // the part of the hour already gone is kept: the next hour is due at T0 + 4h
    await expect(act(db, p, "business_claim", {}, T0 + 4 * H - M)).rejects.toMatchObject({ code: "not_yet" });
    expect((await act(db, p, "business_claim", {}, T0 + 4 * H)).result.hours).toBe(1);
    // a month away: only a week is paid
    const c2 = await act(db, p, "business_claim", {}, T0 + 40 * 24 * H);
    expect(c2.result).toMatchObject({ hours: BUSINESS_MAX_HOURS, xp: BUSINESS_MAX_HOURS * 30 });
    // the top: four cells (1 100 + 1 250 + 1 400 + 1 550)
    const before = await wallet(db, p, "PAP");
    for (let i = 1; i < 4; i++) await act(db, p, "business_up", { bizId: coffee.id }, T0 + 41 * 24 * H);
    expect(before - (await wallet(db, p, "PAP"))).toBe(1250 + 1400 + 1550);
    await expect(act(db, p, "business_up", { bizId: coffee.id }, T0 + 41 * 24 * H)).rejects.toMatchObject({ code: "max_level" });
    v = (await locationsView(db, p, T0 + 41 * 24 * H)).find((x) => x.id === loc.id)!.business;
    expect(v.lines[0]).toMatchObject({ cells: 4, perHour: 120, nextPerHour: null, cost: null });
    await setMoney(db, p, "PAP", 0);
    await expect(act(db, p, "business_up", { bizId: printer.id }, T0)).rejects.toMatchObject({ code: "no_money" });
    await expect(act(db, p, "business_up", { bizId: LOCATION_BIZ.market[0].id }, T0)).rejects.toMatchObject({ code: "business_locked" });
  });
  it("business: the profit of all locations is taken in one go", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "PAP", 1_000_000);
    for (const k of [LOCATIONS[0].id, `night:${LOCATIONS[0].id}`, LOCATIONS[1].id, `night:${LOCATIONS[1].id}`]) {
      await db.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1,$2,now())", [p, k]);
    }
    await act(db, p, "business_up", { bizId: "os-coffee" }, T0); // 30 авторитета an hour
    await act(db, p, "business_up", { bizId: "mk-stall" }, T0 + 12 * H); // папиросы 96 / 4 → 24 an hour
    let c = await act(db, p, "business_claim", {}, T0 + 12 * H + 30 * M);
    expect(c.result.parts).toHaveLength(1);
    const pap = await wallet(db, p, "PAP");
    c = await act(db, p, "business_claim", {}, T0 + 14 * H);
    expect(c.result.parts).toHaveLength(2);
    expect(c.result).toMatchObject({ xp: 2 * 30, pap: 2 * 24 });
    expect((await wallet(db, p, "PAP")) - pap).toBe(48);
  });
});

describe("inventory and clans", () => {
  it("only owned clothes can be worn", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "equip", { itemId: "laser-eyes" }, T0)).rejects.toMatchObject({ code: "no_item" });
    await give(db, p, "laser-eyes", 1);
    const r = await act(db, p, "equip", { itemId: "laser-eyes" }, T0);
    expect(r.state.look.equipped.FACE).toBe("laser-eyes"); // laser eyes moved to the face slot
  });
  it("an energy drink at full energy is not drunk (never above the maximum)", async () => {
    const p = await newPlayer(db);
    await give(db, p, "energy-drink", 1);
    await expect(act(db, p, "use", { itemId: "energy-drink" }, T0)).rejects.toMatchObject({ code: "energy_full" });
    expect(await qty(db, p, "energy-drink")).toBe(1);
  });
  it("create, join, leave; the leader role passes on", async () => {
    const a = await newPlayer(db), b = await newPlayer(db);
    const c = await act(db, a, "clan_create", { name: "Хомяки", tag: "HMS", emblem: "bull", color: "#3ddc84" }, T0);
    await act(db, b, "clan_join", { clanId: c.result.clanId }, T0);
    await act(db, a, "clan_accept", { playerId: b }, T0);
    await expect(act(db, b, "clan_create", { name: "Другие", tag: "OTH", emblem: "bull", color: "#3ddc84" }, T0)).rejects.toMatchObject({ code: "in_clan" });
    await act(db, a, "clan_leave", {}, T0);
    const [m] = await db.query<{ role: string }>("SELECT role FROM clan_members WHERE player_id=$1", [b]);
    expect(m.role).toBe("leader");
  });
  it("the leader hands the clan over and stays as a member", async () => {
    const a = await newPlayer(db), b = await newPlayer(db), x = await newPlayer(db);
    const c = await act(db, a, "clan_create", { name: "Совы", tag: "OWL", emblem: "bull", color: "#3ddc84" }, T0);
    await act(db, b, "clan_join", { clanId: c.result.clanId }, T0);
    await act(db, a, "clan_accept", { playerId: b }, T0);
    await expect(act(db, b, "clan_transfer", { playerId: a }, T0)).rejects.toMatchObject({ code: "not_leader" });
    await expect(act(db, a, "clan_transfer", { playerId: x }, T0)).rejects.toMatchObject({ code: "not_member" });
    await act(db, a, "clan_transfer", { playerId: b }, T0);
    const roles = await db.query<{ player_id: number; role: string }>("SELECT player_id, role FROM clan_members WHERE clan_id=$1", [c.result.clanId]);
    expect(Object.fromEntries(roles.map((r) => [r.player_id, r.role]))).toEqual({ [a]: "member", [b]: "leader" });
    const [cl] = await db.query<{ leader_id: number }>("SELECT leader_id FROM clans WHERE id=$1", [c.result.clanId]);
    expect(cl.leader_id).toBe(b);
    await act(db, b, "clan_kick", { playerId: a }, T0);
  });
});

describe("daily login reward", () => {
  it("is gone (the user 2026-11-24)", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "daily_claim", {}, T0)).rejects.toMatchObject({ code: "no_daily" });
  });
});

describe("selling, nickname, slot machine 777", () => {
  it("craft parts sell for папиросы; the retired yard finds and other things do not", async () => {
    const p = await newPlayer(db);
    await give(db, p, "part-nails", 3);
    const pap = await wallet(db, p, "PAP");
    const r = await act(db, p, "sell", { itemId: "part-nails", qty: 2 }, T0);
    expect(r.result).toMatchObject({ got: 100, left: 1, currency: "PAP" });
    expect(await wallet(db, p, "PAP")).toBe(pap + 100);
    await give(db, p, "lost-wallet", 1);
    await expect(act(db, p, "sell", { itemId: "lost-wallet", qty: 1 }, T0)).rejects.toMatchObject({ code: "not_sellable" });
    await expect(act(db, p, "sell", { itemId: "part-nails", qty: 5 }, T0)).rejects.toMatchObject({ code: "no_item" });
    await expect(act(db, p, "sell", { itemId: "fist" }, T0)).rejects.toMatchObject({ code: "not_sellable" });
  });

  it("«Скупка»: everything picked sells in one go, all or nothing", async () => {
    const p = await newPlayer(db);
    await give(db, p, "part-nails", 3);
    await expect(act(db, p, "sell_many", { items: [] }, T0)).rejects.toMatchObject({ code: "nothing" });
    await expect(act(db, p, "sell_many", { items: [{ itemId: "part-nails", qty: 1 }, { itemId: "part-nails", qty: 3 }] }, T0)).rejects.toMatchObject({ code: "no_item" });
    expect(await qty(db, p, "part-nails")).toBe(3);
    const r = await act(db, p, "sell_many", { items: [{ itemId: "part-nails", qty: 2 }] }, T0);
    expect(r.result).toMatchObject({ got: 0, gotPap: 100, count: 2 });
    expect(await qty(db, p, "part-nails")).toBe(1);
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

  it("pigeons: 1 ₽ each, 100 ₽ a day at most — then no pigeons till midnight", async () => {
    const p = await newPlayer(db);
    const rub0 = await wallet(db, p, "RUB");
    let t = T0;
    for (let i = 0; i < 100; i++) {
      const r = await act(db, p, "pigeon_scare", { slot: i % 5 }, t);
      expect(r.result.reward.currencies.RUB).toBe(1);
      t += Math.ceil((11 * M) / 5); // each place is back 5–10 minutes later
    }
    expect(await wallet(db, p, "RUB")).toBe(rub0 + 100);
    const after = await act(db, p, "pigeon_scare", { slot: 0 }, t);
    expect(after.result.reward).toBeNull();
    expect(after.state.pigeons.every((x: number) => x > t)).toBe(true);
  });

  it("slots: 3 spins per 60 minutes, 777 pays the jackpot", async () => {
    const p = await newPlayer(db);
    const rub0 = await wallet(db, p, "RUB");
    const s1 = await act(db, p, "slots_spin", {}, T0, always(0)); // lowest roll → first outcome = jackpot
    expect(s1.result).toMatchObject({ outcome: "jackpot", reels: ["seven", "seven", "seven"], left: 2 });
    expect(await wallet(db, p, "RUB")).toBe(rub0 + 777);
    const s2 = await act(db, p, "slots_spin", {}, T0 + 10 * M, always(0.999));
    expect(s2.result.kind).toBe("miss");
    expect(new Set(s2.result.reels).size).toBe(3);
    await act(db, p, "slots_spin", {}, T0 + 20 * M, always(0.5));
    await expect(act(db, p, "slots_spin", {}, T0 + 30 * M)).rejects.toMatchObject({ code: "slots_limit" });
    const st = await act(db, p, "slots_spin", {}, T0 + 61 * M, always(0.999));
    expect(st.state.slots).toMatchObject({ left: 0, nextAt: T0 + 70 * M });
  });

  it("slots: every spin gives the machine xp, a new level pays", async () => {
    expect(slotLevel(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(slotLevel(100)).toEqual({ level: 2, into: 0, need: 112 });
    expect(slotLevel(212).level).toBe(3);
    const p = await newPlayer(db);
    const s1 = await act(db, p, "slots_spin", {}, T0, always(0));
    expect(s1.result).toMatchObject({ xp: 77, level: { level: 1, into: 77 }, levelUps: [] });
    await act(db, p, "slots_spin", {}, T0 + 1 * M, always(0.999)); // miss: +3 → 80
    const rub = await wallet(db, p, "RUB");
    await db.query("UPDATE players SET slot_xp = 98 WHERE id=$1", [p]);
    const s3 = await act(db, p, "slots_spin", {}, T0 + 2 * M, always(0.999)); // +3 → 101: level 2
    expect(s3.result.levelUps).toHaveLength(1);
    expect(s3.state.slots).toMatchObject({ level: 2, into: 1, need: 112 });
    expect(await wallet(db, p, "RUB")).toBe(rub + 250);
  });
});

describe("the beard", () => {
  it("grows a level a day (3 at most); a shave takes it off, counts the shaves and the longest run", async () => {
    const p = await newPlayer(db);
    await db.query("UPDATE players SET shaved_at=$2 WHERE id=$1", [p, new Date(T0)]);
    await expect(act(db, p, "shave", {}, T0 + 3600_000)).rejects.toMatchObject({ code: "no_beard" });
    const r = await act(db, p, "shave", {}, T0 + 5 * 86_400_000 + 1000);
    expect(r.result).toMatchObject({ days: 5, shaves: 1 });
    const [row] = await db.query<{ beard_best: number }>("SELECT beard_best FROM players WHERE id=$1", [p]);
    expect(Number(row.beard_best)).toBe(5);
  });
});

describe("«Ящик ништяков»", () => {
  it("one box for every 50 achievement points; the points stay; inside — папиросы, жетоны, рубли, зубы, нычки", async () => {
    const { STASH_IDS } = await import("../src/content/stashes.ts");
    const p = await newPlayer(db);
    await db.query("UPDATE players SET ach_points = 120 WHERE id=$1", [p]);
    const a = await act(db, p, "ach_box_open", {}, T0, always(0.5));
    expect(a.result.box).toMatchObject({ points: 120, opened: 1, ready: 1, progress: 20 });
    expect(a.result.reward.currencies).toEqual({ PAP: 2100, TOKEN: 9, RUB: 10, TOOTH: 1750 });
    const stash = (l: { id: string; qty: number }[]) => l.filter((i) => STASH_IDS.includes(i.id)).reduce((n, i) => n + i.qty, 0);
    expect(stash(a.result.reward.items)).toBe(10);
    // no weapons, chips, tickets or craft parts any more
    expect(a.result.reward.items.some((i: { id: string }) => ["keyboard", "gpu", "rug-pull-gun", "poker-chip", "fortune-ticket"].includes(i.id) || i.id.startsWith("part-"))).toBe(false);
    await act(db, p, "ach_box_open", {}, T0, always(0.5));
    await expect(act(db, p, "ach_box_open", {}, T0)).rejects.toMatchObject({ code: "ach_box_empty" });
    // «Открыть все»: every waiting box at once, one reward — the sum
    await db.query("UPDATE players SET ach_points = 270 WHERE id=$1", [p]);
    const all = await act(db, p, "ach_box_open", { all: true }, T0, always(0.5));
    expect(all.result).toMatchObject({ opened: 3, box: { opened: 5, ready: 0 } });
    expect(all.result.reward.currencies).toEqual({ PAP: 6300, TOKEN: 27, RUB: 30, TOOTH: 5250 });
  });

  it("case things: at most one a box; 20 boxes in a row without one — the 21st gives one for sure", async () => {
    const { CASE_THINGS } = await import("../src/content/ach-box.ts");
    const p = await newPlayer(db);
    await db.query("UPDATE players SET ach_points = 10000 WHERE id=$1", [p]);
    const things = (r: { reward: { items: { id: string }[] } }) => r.reward.items.filter((i) => (CASE_THINGS as readonly string[]).includes(i.id));
    // a very lucky roll still gives one thing only
    const lucky = await act(db, p, "ach_box_open", {}, T0, always(0.001));
    expect(things(lucky.result)).toHaveLength(1);
    expect(lucky.result.box.thingMiss).toBe(0);
    // no luck: 20 misses, then the sure one
    for (let i = 1; i <= 20; i++) {
      const r = await act(db, p, "ach_box_open", {}, T0, always(0.99));
      if (i < 20) { expect(things(r.result)).toHaveLength(0); expect(r.result.box.thingMiss).toBe(i); }
      else { expect(things(r.result)).toHaveLength(1); expect(r.result.box.thingMiss).toBe(0); }
    }
  });
});

describe("home: equipment, rooms, look, help", () => {
  it("a room chair costs money and gives no bonus; the old desk, monitors, RGB and computer are gone", async () => {
    await setBossHp({ datsik: 100000 });
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 30000);
    await startDatsik(p);
    await give(db, p, "keyboard", 3);
    const plain = await hit(p, "keyboard");
    expect(plain.result).toMatchObject({ damage: 30, crit: false });
    await act(db, p, "equipment_upgrade", { id: "chair" }, T0);
    for (const id of ["desk", "monitor2", "rgb", "pc"]) await expect(act(db, p, "equipment_upgrade", { id }, T0)).rejects.toMatchObject({ code: "bad_equipment" });
    expect(await wallet(db, p, "RUB")).toBe(30000 - 2500);
    const r = await hit(p, "keyboard"); // the chairs give no crit chance any more (the user 2026-11-22)
    expect(r.result).toMatchObject({ crit: false, damage: 30 });
    // what was bought of the removed things gives nothing
    await db.query("INSERT INTO player_equipment (player_id, equipment_id, level) VALUES ($1, 'pc', 1), ($1, 'rgb', 3)", [p]);
    expect((await hit(p, "keyboard")).result.damage).toBe(30);
  });

  it("talents: the user's curve — 30, 579, 130 212, … 17 345 292 428 for the 1000th; every next talent dearer", () => {
    expect(TALENT_THRESHOLDS.length).toBe(1000);
    expect([1, 10, 100, 250, 500, 750, 1000].map(talentThreshold)).toEqual([30, 579, 130_212, 2_142_543, 18_482_787, 496_562_318, 17_345_292_428]);
    // the user's stretches: from 250 to 500 — 16 340 244 damage
    expect(talentThreshold(500) - talentThreshold(250)).toBe(16_340_244);
    for (let k = 2; k <= 1005; k++) expect(talentThreshold(k) - talentThreshold(k - 1)).toBeGreaterThanOrEqual(talentThreshold(k - 1) - talentThreshold(Math.max(0, k - 2)));
    expect([0, 29, 30, 578, 579, 130_212, 17_345_292_428].map(talentsForDamage)).toEqual([0, 0, 1, 9, 10, 100, 1000]);
    expect(talentsForDamage(talentThreshold(1003))).toBe(1003);
  });

  it("talents: the counter carries over between fights; the weapon tree costs talents and boosts only that weapon", async () => {
    await setBossHp({ datsik: 100000 });
    const p = await newPlayer(db);
    await give(db, p, "keyboard", 200);
    await startDatsik(p);
    const t1 = await hit(p, "keyboard"); // 30: the 1st talent
    expect(t1.result).toMatchObject({ fightDamage: 30, talentDamage: 30, talentsGained: 1 });
    expect(t1.state.player).toMatchObject({ talents: 1, talentDamage: 30 });
    // a new fight goes on from the same counter
    await act(db, p, "fight_flee", {}, T0);
    await startDatsik(p, T0 + M);
    let last = t1;
    const need = talentThreshold(3) - 30;
    for (let i = 0; i < Math.ceil(need / 30); i++) last = await hit(p, "keyboard", T0 + M);
    expect(last.state.fight?.myDamage).toBe(Math.ceil(need / 30) * 30);
    expect(last.state.player.talents).toBe(3);
    // one path drawn as blocks: the three main weapons first — the keyboard's damage is the first stop, «Бицуха I» comes later
    await expect(act(db, p, "talent_up", { weapon: "_biceps", branch: "s1" }, T0 + M)).rejects.toMatchObject({ code: "talent_locked" });
    // inside a block the tops of the columns go in any order, the cell under one waits for it
    await expect(act(db, p, "talent_up", { weapon: "keyboard", branch: "c1" }, T0 + M)).rejects.toMatchObject({ code: "talent_locked" });
    await expect(act(db, p, "talent_up", { weapon: "nope", branch: "n1" }, T0 + M)).rejects.toMatchObject({ code: "bad_talent" });
    const up = await act(db, p, "talent_up", { weapon: "keyboard", branch: "n1" }, T0 + M);
    expect(up.result).toMatchObject({ level: 1, max: 10, talents: 2 });
    expect((await hit(p, "keyboard", T0 + M)).result.damage).toBe(31); // +1 to the knife only
    // the main weapons' block done → «Основа»: the biceps +50 a level
    await db.query("UPDATE player_talents SET level=10 WHERE player_id=$1 AND weapon_id='keyboard'", [p]);
    await db.query("INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,'keyboard','c1',10),($1,'gpu','n1',20),($1,'gpu','c1',10),($1,'rug-pull-gun','n1',10),($1,'rug-pull-gun','c1',10)", [p]);
    const b1 = await act(db, p, "talent_up", { weapon: "_biceps", branch: "s1" }, T0 + M);
    expect(b1.result).toMatchObject({ level: 1, max: 200 }); // up to 200, but 10 close it
    const [bi] = await db.query<{ talent_biceps: number }>("SELECT talent_biceps FROM players WHERE id=$1", [p]);
    expect(bi.talent_biceps).toBe(50);
    // the energy limit grows with «Лимит энергии» (in «Супер таланты», after «Основа», «Сила удара» and «Новый удар»)
    await expect(act(db, p, "talent_up", { weapon: "_energy", branch: "s1" }, T0 + M)).rejects.toMatchObject({ code: "talent_locked" });
    await db.query("UPDATE player_talents SET level=10 WHERE player_id=$1 AND weapon_id='_biceps'", [p]);
    await db.query(`INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,'fist','c1',10),($1,'mouse','c1',10),($1,'red-candle','c1',10),
      ($1,'fist','n1',10),($1,'fist','r1',10),($1,'mouse','n1',10),($1,'mouse','r1',10),($1,'red-candle','n1',10),($1,'red-candle','r1',10),
      ($1,'bat','u1',1),($1,'bat','n1',10),($1,'bat','c1',20),($1,'bat','r1',30),($1,'_energy','s1',14)`, [p]);
    const max0 = b1.state.player.energyMax;
    await db.query("UPDATE players SET talents = talents + 1 WHERE id=$1", [p]);
    const e1 = await act(db, p, "talent_up", { weapon: "_energy", branch: "s1" }, T0 + M);
    expect(e1.state.player.energyMax).toBe(max0 + 15);
    expect([15, 23]).toContain((await hit(p, "mouse", T0 + M)).result.damage); // the mouse has its +10 «Урон» (×1.5 on a crit)
    await db.query("UPDATE players SET talents=0 WHERE id=$1", [p]);
    await expect(act(db, p, "talent_up", { weapon: "_clock", branch: "s1" }, T0 + M)).rejects.toMatchObject({ code: "no_talents" });
    await expect(act(db, p, "talent_up", { weapon: "keyboard", branch: "n1" }, T0 + M)).rejects.toMatchObject({ code: "max_level" });
  });

  it("the path: the user's blocks — 1054 talents; damage, crit, reloads, the bat, biceps, energy, clock, boss fights", async () => {
    const { TALENT_PATH, TALENT_BLOCKS, weaponTalentBonus, talentsSpent, talentExtras, critChanceOf } = await import("../src/content/talents.ts");
    expect(TALENT_BLOCKS.map((b) => b.title)).toEqual(["Специализация в оружии", "Основа", "Сила удара", "Новый удар", "Супер таланты", "Увеличение урона", "Сила автомата", "Энергия", "Оружейник", "Тактика", "Военный", "Ярость"]);
    const full: Record<string, Record<string, number>> = {};
    for (const x of TALENT_PATH) (full[x.target] ??= {})[x.branch] = x.max;
    const b = (w: string) => weaponTalentBonus(full, w);
    // the knife: +10 +100 +500 damage, 10% + 10% crit; the pistol: +20 +150 +100 +100; the gun: +10 +100 +100 +100 +500
    expect([b("keyboard").flat, b("gpu").flat, b("rug-pull-gun").flat, b("fist").flat, b("bat").flat]).toEqual([610, 370, 810, 10, 10]);
    expect(b("keyboard").critChance).toBeCloseTo(0.2 + 0.045);
    expect(b("gpu").critChance).toBeCloseTo(0.3 + 0.045);
    expect(b("rug-pull-gun").critChance).toBeCloseTo(0.26 + 0.045);
    expect(b("bat").critChance).toBeCloseTo(0.2 + 0.045);
    expect([b("fist").cooldownMin, b("bat").cooldownMin, b("gpu").cooldownMin]).toEqual([100, 300, 0]);
    expect(b("fist").critDamage).toBe(0);
    expect(talentExtras(full)).toEqual({ biceps: 10_000, energy: 124, clockMin: 45 + 48 + 38 + 28, bossFights: 2 });
    expect(TALENT_PATH.reduce((n, x) => n + x.max * x.cost, 0)).toBe(1054);
    expect(talentsSpent(full)).toBe(1054);
    expect(critChanceOf(0.45, 0.15)).toBeCloseTo(0.51);
  });

  it("«Удар битой» puts the bat in the inventory; it hits like the free weapons, its reload cut by the talents", async () => {
    await setBossHp({ datsik: 1_000_000 });
    const p = await newPlayer(db);
    const { TALENT_PATH } = await import("../src/content/talents.ts");
    // every block before «Новый удар» closed
    const before = TALENT_PATH.slice(0, TALENT_PATH.findIndex((x) => x.key === "bat:u1"));
    for (const x of before) await db.query("INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,$2,$3,$4)", [p, x.target, x.branch, x.max]);
    await db.query("UPDATE players SET talents = 5 WHERE id=$1", [p]);
    await act(db, p, "talent_up", { weapon: "bat", branch: "u1" }, T0);
    expect((await db.query("SELECT 1 FROM inventory WHERE player_id=$1 AND item_id='bat' AND qty > 0", [p])).length).toBe(1);
    await db.query("INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,'bat','r1',30)", [p]);
    await startDatsik(p);
    const h = await hit(p, "bat");
    expect(h.result.damage).toBeGreaterThan(0);
    // 480 minutes − 300 = three hours
    const [cd] = await db.query<{ ready_at: Date }>("SELECT ready_at FROM cooldowns WHERE player_id=$1 AND item_id='bat'", [p]);
    expect(new Date(cd.ready_at).getTime() - T0).toBe(180 * M);
    await setMoney(db, p, "RUB", 10);
    await act(db, p, "talent_reset", {}, T0 + M);
    expect((await db.query("SELECT 1 FROM inventory WHERE player_id=$1 AND item_id='bat' AND qty > 0", [p])).length).toBe(0);
  });

  it("the 800-talent migration gives «Бицуха II/III» back and counts the biceps ×10", async () => {
    const p = await newPlayer(db);
    await db.query("UPDATE players SET talents = 3, talent_biceps = 170 WHERE id=$1", [p]);
    await db.query("INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,'_biceps','s1',100),($1,'_biceps','s2',30),($1,'_biceps','s3',12)", [p]);
    await db.exec(MIGRATIONS.find((m) => m.id === "v2-070-talents-800")!.sql);
    const [row] = await db.query<{ talents: number; talent_biceps: number }>("SELECT talents, talent_biceps FROM players WHERE id=$1", [p]);
    expect(row).toMatchObject({ talents: 3 + 42, talent_biceps: 1000 });
    expect(await db.query("SELECT 1 FROM player_talents WHERE player_id=$1", [p])).toHaveLength(1);
  });

  it("«Лимит боссов»: every level is one more fight a day", async () => {
    const p = await newPlayer(db);
    await db.query("INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,'_bosses','s1',2)", [p]);
    const { bossList } = await import("../src/server/systems/combat.ts");
    const { loadConfig } = await import("../src/server/config.ts");
    const cfg = await loadConfig(db, T0);
    const list = await bossList(db, p, cfg, T0);
    expect(list.bosses[0].fightsPerDay).toBe(cfg.fight.perDay + 2); // Дацкоу: 7 like the others
    expect(list.bosses[1].fightsPerDay).toBe(cfg.fight.perDay + 2);
  });

  it("the path migration gives the old weapon trees back", async () => {
    const p = await newPlayer(db);
    await db.query("UPDATE players SET talents = 2 WHERE id=$1", [p]);
    await db.query("INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,'fist','n1',10),($1,'fist','n2',10),($1,'fist','n3',4),($1,'gpu','n4',20)", [p]);
    await db.exec(MIGRATIONS.find((m) => m.id === "v2-058-talent-path")!.sql);
    const [row] = await db.query<{ talents: number }>("SELECT talents FROM players WHERE id=$1", [p]);
    expect(row.talents).toBe(2 + 10 + 10 + 8 + 40);
    expect(await db.query("SELECT 1 FROM player_talents")).toHaveLength(0);
  });

  it("the talent reset costs 5 ₽ and gives every spent talent back", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "talent_reset", {}, T0)).rejects.toMatchObject({ code: "nothing_to_reset" });
    await db.query("INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,'_biceps','s1',30),($1,'fist','n1',10),($1,'gpu','n1',3),($1,'fist','r1',4)", [p]);
    await db.query("UPDATE players SET talents = 7, talent_biceps = 30 WHERE id=$1", [p]);
    await setMoney(db, p, "RUB", 4);
    await expect(act(db, p, "talent_reset", {}, T0)).rejects.toMatchObject({ code: "no_money" });
    await setMoney(db, p, "RUB", 12);
    const r = await act(db, p, "talent_reset", {}, T0);
    expect(r.result).toMatchObject({ returned: 30 + 10 + 3 + 4, talents: 7 + 47 });
    const [after] = await db.query<{ talent_biceps: number }>("SELECT talent_biceps FROM players WHERE id=$1", [p]);
    expect(after.talent_biceps).toBe(0);
    expect(r.state.weaponTalents).toEqual({});
    expect(await wallet(db, p, "RUB")).toBe(7);
  });

  it("tree migration: old branches are refunded, mice and candles become one free each", async () => {
    const p = await newPlayer(db), q = await newPlayer(db);
    await db.query("UPDATE players SET talents = 1 WHERE id=$1", [p]);
    // old costs: levels 1–3 → 1 each, 4–6 → 2, 7–9 → 3, 10 → 4: level 4 = 5, level 10 = 22
    await db.query("INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,'fist','dmg',4),($1,'gpu','crit',10)", [p]);
    await give(db, p, "mouse", 5);
    await give(db, p, "red-candle", 3);
    await db.query("DELETE FROM inventory WHERE player_id=$1 AND item_id IN ('mouse','red-candle')", [q]);
    await db.query("INSERT INTO yard_items (player_id, slot, drop_id, spawned_at) VALUES ($1, 0, 'red-candle', now())", [q]);
    const rub = await wallet(db, p, "RUB");
    await db.exec(MIGRATIONS.find((m) => m.id === "v2-024-talent-tree-free-weapons")!.sql);
    const [row] = await db.query<{ talents: number }>("SELECT talents FROM players WHERE id=$1", [p]);
    expect(row.talents).toBe(1 + 5 + 22);
    expect(await db.query("SELECT 1 FROM player_talents")).toHaveLength(0);
    expect(await wallet(db, p, "RUB")).toBe(rub + 4 * 60 + 2 * 100);
    for (const x of [p, q]) expect([await qty(db, x, "mouse"), await qty(db, x, "red-candle")]).toEqual([1, 1]);
    expect(await db.query("SELECT 1 FROM yard_items WHERE drop_id='red-candle'")).toHaveLength(0);
  });

  it("talents migration: computer parts are refunded, damage so far is counted on the new curve", async () => {
    const p = await newPlayer(db);
    // before: 5 talents earned in fights, 3 of them spent on the GPU (levels 1 and 2), 20 000 damage dealt
    await db.query("UPDATE players SET talents = 2 WHERE id=$1", [p]);
    await db.query("INSERT INTO ledger (player_id, kind, key, delta, reason) VALUES ($1,'talent','talent',5,'fight:1')", [p]);
    await db.query("INSERT INTO player_equipment (player_id, equipment_id, level) VALUES ($1,'pc-gpu',2)", [p]);
    await db.query("UPDATE player_stats SET total_damage = 20000, talent_damage = 20000 WHERE player_id=$1", [p]);
    await db.exec(MIGRATIONS.find((m) => m.id === "v2-021-weapon-talents")!.sql);
    const [row] = await db.query<{ talents: number }>("SELECT talents FROM players WHERE id=$1", [p]);
    // 2 left + 3 refunded + (talents for 20 000 on the new curve − 5 already earned)
    expect(row.talents).toBe(2 + 3 + 14 - 5); // 14 talents for 20 000 on the curve of that time
    expect(await db.query("SELECT 1 FROM player_equipment WHERE player_id=$1 AND equipment_id LIKE 'pc-%'", [p])).toHaveLength(0);
  });

  it("tasks hint: the cheapest step left in an open location", async () => {
    const p = await newPlayer(db);
    const st = await act(db, p, "help_seen", { topic: "home" }, T0);
    expect(st.state.tasks).toEqual({ minEnergy: LOCATIONS[0].tasks[0].energy, claimable: false });
    // a cleared location stops calling: only the next, not yet cleared one counts
    await db.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1, 'openspace', $2)", [p, new Date(T0)]);
    const st2 = await act(db, p, "help_seen", { topic: "yard" }, T0);
    const market = LOCATIONS.find((l) => l.id === "market")!;
    expect(st2.state.tasks.minEnergy).toBe(Math.min(...market.tasks.map((t) => t.energy)));
  });

  it("decor: any owned stage of a room thing can stand in the room; an upgrade shows the new one", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 3000);
    await act(db, p, "equipment_upgrade", { id: "chair" }, T0);
    await expect(act(db, p, "decor_set", { id: "chair", stage: 2 }, T0)).rejects.toMatchObject({ code: "locked" });
    const back = await act(db, p, "decor_set", { id: "chair", stage: 0 }, T0); // the old stool
    expect(back.state.home.decor).toEqual({ chair: 0 });
    expect(back.state.home.bonus.critChance).toBe(0); // the chairs give no bonus
    await expect(act(db, p, "decor_set", { id: "rgb", stage: 0 }, T0)).rejects.toMatchObject({ code: "bad_equipment" });
  });

  it("room pieces: chairs are bought one by one, in any order", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 30000);
    // the throne straight away
    const ch = await act(db, p, "piece_buy", { id: "chair", piece: 3 }, T0);
    expect(ch.state.home.decor).toMatchObject({ chair: 3 });
    expect(ch.state.home.bonus.critChance).toBe(0);
    await expect(act(db, p, "piece_buy", { id: "chair", piece: 3 }, T0)).rejects.toMatchObject({ code: "owned" });
    await expect(act(db, p, "piece_buy", { id: "monitor2", piece: 1 }, T0)).rejects.toMatchObject({ code: "bad_equipment" });
    // the editor saves what stands: only owned things
    await expect(act(db, p, "decor_save", { decor: { chair: 1 } }, T0)).rejects.toMatchObject({ code: "locked" });
    const saved = await act(db, p, "decor_save", { decor: { chair: 0 } }, T0);
    expect(saved.state.home.decor).toMatchObject({ chair: 0 });
    expect(saved.state.home.bonus.critChance).toBe(0);
  });

  it("rooms: buy, switch — the rooms give no bonus", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "room_set", { id: "office" }, T0)).rejects.toMatchObject({ code: "room_locked" });
    await setMoney(db, p, "PAP", 1500);
    const b = await act(db, p, "room_buy", { id: "office" }, T0);
    expect(b.state.look.room).toBe("office");
    expect(b.state.home.bonus.critChance).toBe(0);
    const back = await act(db, p, "room_set", { id: "basic" }, T0);
    expect(back.state.look.room).toBe("basic");
    expect(back.state.home.bonus.critChance).toBe(0);
    await expect(act(db, p, "room_buy", { id: "office" }, T0)).rejects.toMatchObject({ code: "room_owned" });
  });

  it("look: only known options are kept; help topics are remembered once", async () => {
    const p = await newPlayer(db);
    const r = await act(db, p, "look_set", { hair: "spiky", hairColor: 5, eyes: 99, skin: 3 }, T0);
    expect(r.state.look.body).toMatchObject({ hair: "spiky", hairColor: 5, eyes: 0, skin: 3, tattoos: [] });
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
    const { itemById } = await import("../src/content/items.ts");
    expect(String(rows[1].info)).toBe(itemById("jeans")!.name);
    expect(String(rows[0].info)).toContain("отказ: Такого товара нет");
  });
  it("edits are applied, written to the ledger and admin_log", async () => {
    const { edit, player } = await import("../src/server/admin.ts");
    const p = await newPlayer(db);
    await edit(db, 777, p, { op: "set_money", currency: "RUB", amount: 12345 });
    await edit(db, 777, p, { op: "set_item", item: "keyboard", qty: 50 });
    await edit(db, 777, p, { op: "set_xp", value: 999 });
    await edit(db, 777, p, { op: "set_talent", weapon: "fist", branch: "n1", level: 3 });
    await edit(db, 777, p, { op: "set_name", value: "Тест" });
    expect(await wallet(db, p, "RUB")).toBe(12345);
    expect(await qty(db, p, "keyboard")).toBe(50);
    await edit(db, 777, p, { op: "set_item", item: "keyboard", qty: 0 });
    expect(await qty(db, p, "keyboard")).toBe(0);
    await expect(edit(db, 777, p, { op: "set_item", item: "fist", qty: 5 })).rejects.toThrow();
    const v = await player(db, p);
    expect(v.player.display_name).toBe("Тест");
    expect(Number(v.player.xp)).toBe(999);
    expect(v.talents).toEqual([{ weapon_id: "fist", branch: "n1", level: 3 }]);
    expect(v.admin.length).toBe(6);
    expect(v.ledger.some((l) => l.reason === "admin:777" && l.key === "keyboard" && Number(l.delta) === -50)).toBe(true);
  });
  it("admin gives a home room (energy bonus too) and can take it back", async () => {
    const { edit, player } = await import("../src/server/admin.ts");
    const { roomsEnergyBonus } = await import("../src/content/home.ts");
    const p = await newPlayer(db);
    await edit(db, 777, p, { op: "give_room", room: "cabinet" });
    await edit(db, 777, p, { op: "give_room", room: "freezer" });
    let v = await player(db, p);
    expect(v.rooms.have).toEqual(["basic", "cabinet", "freezer"]);
    expect(Number(v.player.energy_bonus)).toBe(roomsEnergyBonus(["basic", "cabinet", "freezer"]));
    await edit(db, 777, p, { op: "give_room", room: "freezer", own: false });
    v = await player(db, p);
    expect(v.rooms.have).toEqual(["basic", "cabinet"]);
    await expect(edit(db, 777, p, { op: "give_room", room: "nope" })).rejects.toThrow();
  });
  it("admin adds boss passes on top of what the player has (and can take them away)", async () => {
    const { edit } = await import("../src/server/admin.ts");
    const p = await newPlayer(db);
    await edit(db, 777, p, { op: "add_item", item: "key-datsik", delta: 2 });
    const r = await edit(db, 777, p, { op: "add_item", item: "key-datsik", delta: 3 });
    expect(r).toMatchObject({ from: 2, to: 5 });
    expect(await qty(db, p, "key-datsik")).toBe(5);
    await edit(db, 777, p, { op: "add_item", item: "key-datsik", delta: -9 });
    expect(await qty(db, p, "key-datsik")).toBe(0);
    await expect(edit(db, 777, p, { op: "add_item", item: "key-nope", delta: 1 })).rejects.toThrow();
  });
  it("a banned player cannot act until unbanned", async () => {
    const { edit } = await import("../src/server/admin.ts");
    const p = await newPlayer(db);
    await edit(db, 1, p, { op: "ban", reason: "читы" });
    await expect(act(db, p, "equip", { itemId: "jeans" }, T0)).rejects.toThrow(/заблокирован: читы/);
    await edit(db, 1, p, { op: "unban" });
    await act(db, p, "equip", { itemId: "jeans" }, T0);
  });
  it("«Технические работы»: players get the notice, the admins (by Telegram id) are let in; off — everyone plays", async () => {
    const { maintenanceSet } = await import("../src/server/admin.ts");
    const { maintenanceGate } = await import("../src/server/http.ts");
    const p = await newPlayer(db);
    const a = await newPlayer(db);
    await db.query("UPDATE players SET telegram_id=9001 WHERE id=$1", [a]);
    await db.query("INSERT INTO config (key, value) VALUES ('admins', '[9001]') ON CONFLICT (key) DO UPDATE SET value = excluded.value");
    await maintenanceSet(db, 9001, true, "Чиним двор");
    await expect(maintenanceGate(db, p)).rejects.toMatchObject({ code: "maintenance", message: "Чиним двор" });
    await maintenanceGate(db, a);
    await maintenanceSet(db, 9001, false, undefined);
    await maintenanceGate(db, p);
    await db.query("DELETE FROM config WHERE key IN ('admins', 'maintenance')");
    resetConfigCache();
  });
  it("admin sessions are separate from game sessions", async () => {
    const { issueAdminSession, verifyAdminSession, issueSession } = await import("../src/server/auth.ts");
    expect(verifyAdminSession(issueAdminSession(42))).toBe(42);
    expect(() => verifyAdminSession(issueSession(42))).toThrow();
  });
});

describe("action log texts", () => {
  it("says what was found in the yard and what the 777 paid", async () => {
    const { actionText } = await import("../src/server/action-text.ts");
    expect(actionText("yard_pick", { itemId: 311 }, { name: "Ржавый ключ", reward: { xp: 5, currencies: { RUB: 120 }, items: [], energy: 0 } })).toBe("нашёл «Ржавый ключ» · +120 Рубли, +5 авторитета");
    expect(actionText("slots_spin", {}, { title: "Три биткоина", reels: ["btc", "btc", "btc"], reward: { xp: 0, currencies: { BTC: 10 }, items: [], energy: 0 } })).toBe("Три биткоина [BTC BTC BTC] · +10 BTC");
    expect(actionText("slots_spin", {}, { title: "Мимо", reels: ["btc", "sol", "rub"], reward: null })).toBe("Мимо [BTC SOL RUB] · без выигрыша");
  });
  it("is written for real actions", async () => {
    const { actions } = await import("../src/server/admin.ts");
    const p = await newPlayer(db);
    await act(db, p, "slots_spin", {}, T0);
    const [row] = await actions(db, { playerId: p });
    expect(String(row.info)).toMatch(/\[.+ .+ .+\] · /);
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

describe("admin: reset a player", () => {
  it("wipes the progress back to the starting kit, keeps the account, hands the clan over", async () => {
    const { edit, player } = await import("../src/server/admin.ts");
    const p = await newPlayer(db);
    const other = await newPlayer(db);
    await db.query("UPDATE players SET display_name='Тест-игрок' WHERE id=$1", [p]);
    await setMoney(db, p, "RUB", 50_000);
    await give(db, p, "rug-pull-gun", 40);
    await edit(db, 1, p, { op: "set_xp", value: 123_456 });
    await edit(db, 1, p, { op: "set_talent", weapon: "fist", branch: "n1", level: 4 });
    await act(db, p, "task", { taskId: "os-standup" }, T0);
    const c = await act(db, p, "clan_create", { name: "Сбросники", tag: "SBR", emblem: "skull", color: "#ff4d6d" }, T0);
    const clanId = c.result.clanId;
    await act(db, other, "clan_join", { clanId }, T0);
    await act(db, p, "clan_accept", { playerId: other }, T0);
    const r = await edit(db, 1, p, { op: "reset" });
    expect(r.op).toBe("reset");
    const v = await player(db, p);
    expect(v.player.display_name).toBe("Тест-игрок");
    expect(Number(v.player.xp)).toBe(0);
    expect(v.money.RUB).toBe(500);
    expect(await qty(db, p, "rug-pull-gun")).toBe(0);
    expect(await qty(db, p, "fist")).toBe(1);
    expect(v.talents).toEqual([]);
    expect(v.clan).toBeNull();
    const [cl] = await db.query<{ leader_id: number }>("SELECT leader_id FROM clans WHERE id=$1", [clanId]);
    expect(cl.leader_id).toBe(other);
    expect(v.admin[0].op).toBe("reset");
    // the achievements start over too: the 40 guns from before the reset no longer count
    const { statsFor } = await import("../src/server/systems/achievements.ts");
    expect((await statsFor(db, p))["got:rug-pull-gun"] ?? 0).toBe(0);
    const [pr] = await db.query<{ ach_points: number; help_seen: unknown }>("SELECT ach_points, help_seen FROM players WHERE id=$1", [p]);
    expect([pr.ach_points, pr.help_seen]).toEqual([0, []]);
    // the player plays on as a newcomer
    const s = await act(db, p, "task", { taskId: "os-standup" }, T0 + H);
    expect(s.result.steps).toBe(1);
  });
});

describe("batch hits, extra pass", () => {
  it("×10/×100/×1000 uses that many consumables in one tap, all of them even past the boss's HP (damage is global); free weapons hit once", async () => {
    await setBossHp({ datsik: 1000 });
    const p = await newPlayer(db);
    await give(db, p, "keyboard", 50);
    await startDatsik(p);
    const r = await act(db, p, "attack", { weapon: "keyboard", count: 10 }, T0, always(0.99));
    expect(r.result).toMatchObject({ count: 10, damage: 300, left: 40, hp: 700 });
    // ×100 with 40 left: all 40 hit, the damage over the boss's HP goes on to the other fights
    const w = await act(db, p, "attack", { weapon: "keyboard", count: 100 }, T0, always(0.99));
    expect(w.result).toMatchObject({ count: 40, damage: 1200, status: "won", left: 0 });
    expect(w.state.fight).toBeNull();
    await startDatsik(p, T0 + M);
    await expect(act(db, p, "attack", { weapon: "fist", count: 10 }, T0 + M)).rejects.toMatchObject({ code: "bad_count" });
    await expect(act(db, p, "attack", { weapon: "keyboard", count: 5001 }, T0 + M)).rejects.toMatchObject({ code: "bad_count" });
    const { fightView } = await import("../src/server/systems/combat.ts");
    const v = await fightView(db, p, r.result.fightId, 0, T0);
    expect(v.hits[v.hits.length - 1]).toMatchObject({ count: 10, damage: 300 });
  });

  it("a win gives a second pass with a 10% chance", async () => {
    await setBossHp({ datsik: 10 });
    const p = await newPlayer(db);
    await give(db, p, "keyboard", 5);
    const f1 = await startDatsik(p);
    await hit(p, "keyboard", T0, {}, 0.99);
    await act(db, p, "fight_claim", { fightId: f1.result.fightId }, T0, always(0.99));
    // the pass for the win + 2 from the damage box (the kill dealt over 10 % of his HP)
    expect(await qty(db, p, "key-datsik")).toBe(3);
    const f2 = await startDatsik(p, T0 + M);
    await hit(p, "keyboard", T0 + M, {}, 0.05);
    const c = await act(db, p, "fight_claim", { fightId: f2.result.fightId }, T0 + M, always(0.05));
    expect(c.result.bonusKey).toBe(true);
    expect(await qty(db, p, "key-datsik")).toBe(3 + 2 + 2);
  });
});

describe("yard mini games", () => {
  it("blackjack: hand values, outcomes, side bets", async () => {
    const { handValue, bjOutcome, perfectPairs, twentyOnePlus3, canSplitCards } = await import("../src/content/games.ts");
    const c = (r: number, s = 0) => ({ r, s });
    expect(handValue([c(1), c(13)])).toBe(21);
    expect(handValue([c(1), c(1), c(9)])).toBe(21);
    expect(handValue([c(10), c(9), c(5)])).toBe(24);
    expect(bjOutcome([c(1), c(12)], [c(10), c(9)])).toBe("blackjack");
    expect(bjOutcome([c(1), c(12)], [c(10), c(9)], true)).toBe("win"); // 21 after a split is not a blackjack
    expect(bjOutcome([c(10), c(8)], [c(10), c(6), c(9)])).toBe("win");
    expect(bjOutcome([c(10), c(8)], [c(10), c(8)])).toBe("push");
    expect(bjOutcome([c(10), c(8), c(5)], [c(10), c(8)])).toBe("lose");
    expect(perfectPairs(c(8, 0), c(8, 0))).toBe("perfect");
    expect(perfectPairs(c(8, 1), c(8, 2))).toBe("colored");
    expect(perfectPairs(c(8, 0), c(8, 1))).toBe("mixed");
    expect(perfectPairs(c(8, 0), c(9, 0))).toBeNull();
    expect(twentyOnePlus3(c(7, 1), c(7, 1), c(7, 1))).toBe("suited");
    expect(twentyOnePlus3(c(7, 1), c(7, 2), c(7, 0))).toBe("trips");
    expect(twentyOnePlus3(c(5, 1), c(6, 1), c(7, 1))).toBe("sflush");
    expect(twentyOnePlus3(c(12, 1), c(13, 2), c(1, 0))).toBe("straight");
    expect(twentyOnePlus3(c(2, 3), c(9, 3), c(13, 3))).toBe("flush");
    expect(twentyOnePlus3(c(2, 3), c(9, 1), c(13, 3))).toBeNull();
    expect(canSplitCards([c(10), c(13)])).toBe(true);
    expect(canSplitCards([c(9), c(13)])).toBe(false);
  });

  /** the next cards out of the shoe, in order (the shoe is long enough not to be reshuffled at the deal) */
  const stackShoe = async (pid: number, cards: [number, number][]) => {
    const [seat] = await db.query<{ table_id: number }>("SELECT table_id FROM bj_seats WHERE player_id=$1", [pid]);
    const filler = Array.from({ length: 70 }, (_, i) => ({ r: 2 + (i % 4), s: 3 }));
    const shoe = [...filler, ...cards.map(([r, s]) => ({ r, s })).reverse()];
    await db.query("UPDATE bj_tables SET state = jsonb_set(state, '{shoe}', $2::jsonb) WHERE id=$1", [seat.table_id, JSON.stringify(shoe)]);
  };

  it("blackjack: a solo table — bet, side bet, split, the dealer stands on 17; money adds up", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 100);
    const open = await act(db, p, "bj_open", {}, T0);
    expect(open.result.seat).toBe(0);
    expect(open.result.table.seats.filter(Boolean)).toHaveLength(1);
    await expect(act(db, p, "bj_bet", { bet: 30 }, T0)).rejects.toMatchObject({ code: "bj_bad_bet" });
    // 8♠ to me, 10♥ to the dealer, 8♠ to me (a perfect pair), 7♣ under the dealer; then 3♠ and 2♦ for the split hands
    await stackShoe(p, [[8, 0], [10, 1], [8, 0], [7, 3], [3, 0], [2, 2]]);
    let v = (await act(db, p, "bj_bet", { bet: 5, pp: 2 }, T0 + 1000)).result;
    expect(v.table.phase).toBe("playing"); // the only player at the table: dealt at once
    expect(v.table.dealer).toHaveLength(1);
    expect(v.table.dealerHidden).not.toBeNull();
    expect(v.table.seats[0].side.pp).toBe("perfect");
    expect(v.moves).toMatchObject({ hit: true, stand: true, double: true, split: true });
    expect(await wallet(db, p, "RUB")).toBe(100 - 5 - 2 + 2 * 26);
    v = (await act(db, p, "bj_move", { move: "split" }, T0 + 2000)).result;
    expect(v.table.seats[0].hands.map((h: { cards: unknown[] }) => h.cards.length)).toEqual([2, 2]);
    expect(await wallet(db, p, "RUB")).toBe(140);
    v = (await act(db, p, "bj_move", { move: "stand" }, T0 + 3000)).result;
    expect(v.table.turn).toEqual({ seat: 0, hand: 1 });
    v = (await act(db, p, "bj_move", { move: "stand" }, T0 + 4000)).result;
    expect(v.table.phase).toBe("betting");
    expect(v.table.settled).toBe(true);
    expect(v.table.dealerValue).toBe(17);
    expect(v.table.seats[0].hands.map((h: { outcome: string }) => h.outcome)).toEqual(["lose", "lose"]);
    expect(v.table.seats[0].won).toBe(52);
    expect(await wallet(db, p, "RUB")).toBe(140);
    // the results stay 5 s, then the table is cleared and there are 20 s to bet
    expect(v.table.clearAt).toBe(T0 + 4000 + 5000);
    expect(v.table.deadline).toBe(T0 + 4000 + 5000 + 20_000);
    await expect(act(db, p, "bj_bet", { bet: 10 }, T0 + 5000)).rejects.toMatchObject({ code: "bj_busy" });
    // a natural pays 3:2
    await stackShoe(p, [[1, 0], [10, 1], [13, 2], [7, 3]]);
    v = (await act(db, p, "bj_bet", { bet: 10 }, T0 + 10_000)).result;
    expect(v.table.settled).toBe(true);
    expect(v.table.seats[0].hands[0].outcome).toBe("blackjack");
    expect(await wallet(db, p, "RUB")).toBe(140 - 10 + 25);
    // a free bet: a win pays, the stake is the house's
    await stackShoe(p, [[10, 0], [10, 1], [9, 2], [7, 3]]);
    v = (await act(db, p, "bj_bet", { free: true }, T0 + 16_000)).result;
    expect(v.moves.double).toBe(false);
    v = (await act(db, p, "bj_move", { move: "stand" }, T0 + 17_000)).result;
    expect(v.table.seats[0].hands[0].outcome).toBe("win");
    expect(await wallet(db, p, "RUB")).toBe(155 + 1);
    expect(v.free.left).toBe(2);
    // getting up closes an empty table
    v = (await act(db, p, "bj_leave", {}, T0 + 18_000)).result;
    expect(v.table).toBeNull();
    expect((await db.query("SELECT 1 FROM bj_tables")).length).toBe(0);
  });

  it("blackjack: an ace up offers insurance — 2:1 on a dealer blackjack, lost otherwise; no deal-now, no betting while the table is cleared", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 100);
    await act(db, p, "bj_open", {}, T0);
    await expect(act(db, p, "bj_deal" as never, {}, T0)).rejects.toBeTruthy();
    // me 10♠, the dealer A♥, me 9♦, under the dealer K♣ — a dealer blackjack
    await stackShoe(p, [[10, 0], [1, 1], [9, 2], [13, 3]]);
    let v = (await act(db, p, "bj_bet", { bet: 10 }, T0 + 1000)).result;
    expect(v.table.phase).toBe("insurance");
    expect(v.table.seats[0].ins).toBeNull();
    expect(v.table.deadline).toBe(T0 + 1000 + 10_000);
    await expect(act(db, p, "bj_move", { move: "stand" }, T0 + 1500)).rejects.toMatchObject({ code: "bj_not_turn" });
    v = (await act(db, p, "bj_insure", { take: true }, T0 + 2000)).result;
    // insured 5, paid 15; the hand loses 10 — even
    expect(v.table.settled).toBe(true);
    expect(v.table.seats[0].insPay).toBe(15);
    expect(await wallet(db, p, "RUB")).toBe(100);
    // the next round: an ace up, no dealer blackjack (A♥ + 7♣), no answer in 10 s → no insurance, the moves start
    await stackShoe(p, [[10, 0], [1, 1], [9, 2], [7, 3]]);
    v = (await act(db, p, "bj_bet", { bet: 10 }, T0 + 2000 + 5000 + 1000)).result;
    expect(v.table.phase).toBe("insurance");
    v = (await act(db, p, "bj_move", { move: "stand" }, T0 + 8000 + 11_000)).result;
    expect(v.table.seats[0].ins).toBe(0);
    expect(v.table.seats[0].hands[0].outcome).toBe("win"); // 19 against 18
    expect(await wallet(db, p, "RUB")).toBe(110);
  });

  it("blackjack: clan mates at one table; turns in seat order; a missed move stands by itself", async () => {
    const a = await newPlayer(db), b = await newPlayer(db), x = await newPlayer(db);
    for (const p of [a, b, x]) await setMoney(db, p, "RUB", 50);
    const c = await act(db, a, "clan_create", { name: "Картёжники", tag: "BJK", emblem: "bull", color: "#3ddc84" }, T0);
    await act(db, b, "clan_join", { clanId: c.result.clanId }, T0);
    await act(db, a, "clan_accept", { playerId: b }, T0);
    await act(db, a, "bj_open", {}, T0);
    await expect(act(db, a, "bj_invite", { playerId: x }, T0)).rejects.toMatchObject({ code: "bj_not_clan" });
    const inv = await act(db, a, "bj_invite", { playerId: b }, T0);
    expect(inv.result.clan.find((m: { id: number }) => m.id === b).invited).toBe(true);
    const seen = await act(db, b, "equip", { itemId: "jeans" }, T0 + 1000);
    expect(seen.state.bjInvites).toBe(1);
    const [{ id: inviteId }] = await db.query<{ id: number }>("SELECT id FROM bj_invites WHERE player_id=$1", [b]);
    const joined = (await act(db, b, "bj_join", { inviteId }, T0 + 2000)).result;
    expect(joined.seat).toBe(1);
    // a bets: the deal waits for b
    let v = (await act(db, a, "bj_bet", { bet: 5 }, T0 + 3000)).result;
    expect(v.table.phase).toBe("betting");
    expect(v.table.deadline).toBe(T0 + 3000 + 20_000);
    // a: 10♠ 6♣ (16), b: 9♥ 7♠ (16), the dealer: 10♦ up, 7♥ down; then 10♣ for b
    await stackShoe(a, [[10, 0], [9, 1], [10, 2], [6, 3], [7, 0], [7, 1], [10, 3]]);
    v = (await act(db, b, "bj_bet", { bet: 5 }, T0 + 4000)).result;
    expect(v.table.phase).toBe("playing");
    expect(v.table.turn).toEqual({ seat: 0, hand: 0 });
    await expect(act(db, b, "bj_move", { move: "stand" }, T0 + 5000)).rejects.toMatchObject({ code: "bj_not_turn" });
    // a never moves: 30 s later his hand stands and it is b's turn
    v = (await act(db, b, "bj_move", { move: "hit" }, T0 + 4000 + 31_000)).result;
    // b took 10 on 16 → bust; the dealer stands on 17 against a's 16 — the round is over
    expect(v.table.phase).toBe("betting");
    expect(v.table.seats[1].hands[0].value).toBe(26);
    expect(v.table.seats[1].hands[0].outcome).toBe("lose");
    expect(v.table.seats[0].hands[0].outcome).toBe("lose");
    expect(v.table.dealerValue).toBe(17);
    expect(await wallet(db, a, "RUB")).toBe(45);
    expect(await wallet(db, b, "RUB")).toBe(45);
    // the table stays when one gets up
    await act(db, a, "bj_leave", {}, T0 + 60_000);
    const left = (await act(db, b, "bj_unbet", {}, T0 + 61_000).catch((e) => e)) as { code?: string };
    expect(left.code).toBe("bj_busy");
    const [t] = await db.query<{ state: { seats: unknown[] } }>("SELECT state FROM bj_tables");
    expect(t.state.seats.filter(Boolean)).toHaveLength(1);
  });

  it("blackjack: a player who closed the game (no polls for 40 s) gets up by himself — the stake back, the seat free", async () => {
    const a = await newPlayer(db), b = await newPlayer(db);
    for (const p of [a, b]) await setMoney(db, p, "RUB", 50);
    const c = await act(db, a, "clan_create", { name: "Ушедшие", tag: "GON", emblem: "bull", color: "#3ddc84" }, T0);
    await act(db, b, "clan_join", { clanId: c.result.clanId }, T0);
    await act(db, a, "clan_accept", { playerId: b }, T0);
    await act(db, a, "bj_open", {}, T0);
    await act(db, a, "bj_invite", { playerId: b }, T0);
    const [{ id: inviteId }] = await db.query<{ id: number }>("SELECT id FROM bj_invites WHERE player_id=$1", [b]);
    await act(db, b, "bj_join", { inviteId }, T0 + 1000);
    await act(db, a, "bj_bet", { bet: 5 }, T0 + 2000);
    expect(await wallet(db, a, "RUB")).toBe(45);
    // a is gone; b comes back a minute later — a's stake returns and his seat is free
    const v = (await act(db, b, "bj_bet", { bet: 5 }, T0 + 62_000)).result;
    expect(v.table.seats.filter(Boolean)).toHaveLength(1);
    expect(await wallet(db, a, "RUB")).toBe(50);
    expect(await db.query("SELECT 1 FROM bj_seats WHERE player_id=$1", [a])).toHaveLength(0);
  });

  it("poker: combinations", async () => {
    const { pokerHand, pokerLevel, pokerPay, POKER_HANDS } = await import("../src/content/games.ts");
    for (const h of POKER_HANDS) expect(pokerHand(h.sample).hand).toBe(h.id);
    const c = (r: number, s = 0) => ({ r, s });
    expect(pokerHand([c(1, 0), c(2, 1), c(3, 2), c(4, 3), c(5, 0)]).hand).toBe("straight"); // wheel
    expect(pokerHand([c(1, 0), c(2, 0), c(3, 0), c(4, 0), c(5, 0)]).hand).toBe("sflush");
    expect(pokerHand([c(11, 0), c(12, 1), c(13, 2), c(1, 3), c(2, 0)]).hand).toBe("high"); // no wrap-around
    expect(pokerHand([c(7, 0), c(7, 1), c(9, 2), c(2, 3), c(4, 0)]).used).toEqual([0, 1]);
    const { pokerCheats, pokerXpFor } = await import("../src/content/games.ts");
    expect(pokerLevel(0).level).toBe(0);
    expect(pokerLevel(10).level).toBe(1);
    expect(pokerLevel(20).level).toBe(1);
    expect(pokerLevel(21).level).toBe(2);
    expect(pokerXpFor(20)).toBe(390);
    expect(pokerLevel(1e9)).toMatchObject({ level: 1000, to: null });
    expect(pokerLevel(pokerXpFor(500)).level).toBe(500);
    expect([0, 9, 10, 14, 15, 29, 30, 49, 50, 74, 75, 99, 100, 1000].map(pokerCheats)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    // the prizes are the same at every poker level
    expect([0, 10, 80].map((lv) => pokerPay("pair", lv).currencies?.RUB)).toEqual([20, 20, 20]);
    expect(pokerPay("high", 5)).toEqual({ items: [{ id: "poker-sticker", qty: 100 }] });
  });

  it("poker: a case for stickers — authority, roubles, dollars; a piece of its set at 30%", async () => {
    const p = await newPlayer(db);
    await give(db, p, "poker-sticker", 1200);
    await expect(act(db, p, "poker_case", { n: 3 }, T0)).rejects.toMatchObject({ code: "no_stickers" });
    const r = await act(db, p, "poker_case", { n: 2 }, T0, always(0.1));
    expect(r.result.tattoo).toMatch(/^tat-pk-bluff-/);
    expect(r.result.reward.xp).toBeGreaterThanOrEqual(2000);
    expect(r.result.reward.currencies.RUB).toBeGreaterThanOrEqual(700);
    expect(await qty(db, p, "poker-sticker")).toBe(200);
    const { pokerPay } = await import("../src/content/games.ts");
    expect(pokerPay("quads", 20).currencies?.GOLD).toBe(600);
    expect(pokerPay("high", 0).items?.[0]).toEqual({ id: "poker-sticker", qty: 100 });
  });

  it("poker: «Сбросить лимит» — 1500 слитков for another 25 hands, only when the hands are over, at most 3 a day", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "GOLD", 10_000);
    const { moscowDay } = await import("../src/server/core.ts");
    await expect(act(db, p, "poker_reset", {}, T0)).rejects.toMatchObject({ code: "poker_has_left" });
    // 25 hands played today (as rows), the limit is reached
    for (let i = 0; i < 25; i++) await db.query("INSERT INTO games (player_id, kind, day, paid, status, state, created_at, updated_at) VALUES ($1,'poker',$2,true,'done','{}',$3,$3)", [p, moscowDay(T0), new Date(T0)]);
    await expect(act(db, p, "poker_play", {}, T0)).rejects.toMatchObject({ code: "poker_limit" });
    const r = await act(db, p, "poker_reset", {}, T0);
    expect(r.result.poker).toMatchObject({ left: 25, resets: 1, resetsMax: 3 });
    expect(await wallet(db, p, "GOLD")).toBe(10_000 - 1500);
    await act(db, p, "poker_play", {}, T0, always(0.1));
    await db.query("UPDATE players SET poker_resets=3 WHERE id=$1", [p]);
    await expect(act(db, p, "poker_reset", {}, T0)).rejects.toMatchObject({ code: "poker_resets_max" });
    // a new day starts over
    expect((await act(db, p, "poker_play", {}, T0 + 86_400_000, always(0.1))).result.poker.resets).toBe(0);
  });

  it("poker: 5 слитков a hand, 25 a day, poker xp grows; a «Фишка» pays for a hand instead", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "GOLD", 500);
    let xp = 0;
    for (let i = 0; i < 24; i++) {
      const r = await act(db, p, "poker_play", {}, T0 + i * 1000, always(0.37));
      expect(r.result.cards).toHaveLength(5);
      xp += r.result.gainedXp;
      expect(r.result.poker.xp).toBe(xp);
      expect(r.result.poker.played).toBe(i + 1);
    }
    const charges = await db.query<{ delta: number }>("SELECT delta FROM ledger WHERE player_id=$1 AND reason='game:poker'", [p]);
    expect(charges).toHaveLength(24);
    expect(Number(charges[0].delta)).toBe(-5);
    // no chip: an error; with a chip the 25th hand costs no money
    await expect(act(db, p, "poker_play", { chip: true }, T0 + 30_000)).rejects.toMatchObject({ code: "no_chip" });
    await give(db, p, "poker-chip", 2);
    const usd = await wallet(db, p, "GOLD");
    const c = await act(db, p, "poker_play", { chip: true }, T0 + 31_000, always(0.37));
    expect(await qty(db, p, "poker-chip")).toBe(1);
    expect(c.result.poker.chips).toBe(1);
    expect(await wallet(db, p, "GOLD")).toBe(Math.round((usd + (c.result.reward?.currencies?.GOLD ?? 0)) * 100) / 100);
    // a chip hand does not use up the day's money hands, and chips play on past the limit
    expect(c.result.poker.left).toBe(1);
    const last = await act(db, p, "poker_play", {}, T0 + 32_000, always(0.37));
    await expect(act(db, p, "poker_play", {}, T0 + 33_000)).rejects.toMatchObject({ code: "poker_limit" });
    const over = await act(db, p, "poker_play", { chip: true }, T0 + 34_000, always(0.37));
    expect(await qty(db, p, "poker-chip")).toBe(0);
    expect(over.result.poker.left).toBe(0);
    // the weekly mini-game rating counted the poker xp
    const [w] = await db.query<{ poker: number }>("SELECT poker FROM game_weekly WHERE player_id=$1", [p]);
    expect(Number(w.poker)).toBe(xp + c.result.gainedXp + last.result.gainedXp + over.result.gainedXp);
  });

  it("the zonk roach pays once per 10 minutes, the daily zonk record gets its prize the next day", async () => {
    const p = await newPlayer(db);
    const rub = await wallet(db, p, "RUB");
    const a = await act(db, p, "roach_squash", {}, T0, always(0.5));
    expect(a.result.reward.currencies.RUB).toBe(15);
    expect((await act(db, p, "roach_squash", {}, T0 + 5 * M, always(0.5))).result.reward).toBeNull();
    const c = await act(db, p, "roach_squash", {}, T0 + 11 * M, always(0.01));
    expect(c.result.reward.items.filter((i: { id: string }) => !i.id.startsWith("part-"))).toEqual([{ id: "poker-chip", qty: 1 }]); // a craft part may come too
    expect(await wallet(db, p, "RUB")).toBe(rub + 30);
    // a zonk game given up still counts its xp for the weekly mini-game rating
    await act(db, p, "game_start", { game: "zonk", level: 1 }, T0 + 12 * M, always(0.5));
    await act(db, p, "zonk_give_up", {}, T0 + 13 * M);
    const [zw] = await db.query<{ zonk: number }>("SELECT zonk FROM game_weekly WHERE player_id=$1", [p]);
    expect(Number(zw.zonk)).toBe(1);
    // a finished zonk game today → tomorrow the best player has a prize waiting
    const q = await newPlayer(db);
    const day = new Date(T0 + 3 * H).toISOString().slice(0, 10);
    await db.query("INSERT INTO games (player_id, kind, day, paid, status, state, result, created_at, updated_at) VALUES ($1,'zonk',$2,false,'done','{}',$3,$4,$4)",
      [q, day, JSON.stringify({ points: 3500, won: false }), new Date(T0)]);
    const next = await act(db, q, "equip", { itemId: "jeans" }, T0 + 24 * H);
    expect(next.state.prizes.map((x: { title: string }) => x.title)).toEqual(["Рекорд дня в зонке: 3500 очков"]);
    // settled once: nobody gets it twice
    const again = await act(db, p, "equip", { itemId: "jeans" }, T0 + 25 * H);
    expect(again.state.prizes.filter((x: { title: string }) => x.title.startsWith("Рекорд дня"))).toHaveLength(0);
  });

  it("zonk hints: off at the start, 2 ₽ once a game to switch on, then free on and off", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 10);
    const g = await act(db, p, "game_start", { game: "zonk", level: 1 }, T0, always(0.5));
    expect(g.result.game?.hints ?? g.result.hints ?? false).toBe(false);
    const on = await act(db, p, "zonk_hints", { on: true }, T0 + M);
    expect(on.result).toMatchObject({ hints: true, hintsPaid: true });
    expect(await wallet(db, p, "RUB")).toBe(8);
    await act(db, p, "zonk_hints", { on: false }, T0 + 2 * M);
    const again = await act(db, p, "zonk_hints", { on: true }, T0 + 3 * M);
    expect(again.result.hints).toBe(true);
    expect(await wallet(db, p, "RUB")).toBe(8);
  });

  it("the newcomer's gift comes once", async () => {
    const p = await newPlayer(db);
    const g = await act(db, p, "starter_gift", {}, T0);
    expect(g.result.reward.items).toEqual(expect.arrayContaining([{ id: "poker-chip", qty: 3 }]));
    expect(g.state.helpSeen).toContain("first-steps");
    await expect(act(db, p, "starter_gift", {}, T0)).rejects.toMatchObject({ code: "gift_taken" });
  });

  it("poker: from level 10 a card on the table can be swapped (шулерство), the last swap counts the hand", async () => {
    const { pokerXpFor } = await import("../src/content/games.ts");
    const p = await newPlayer(db);
    await setMoney(db, p, "GOLD", 100);
    await db.query("UPDATE players SET poker_xp=$2 WHERE id=$1", [p, pokerXpFor(15)]);
    const d = await act(db, p, "poker_play", {}, T0, always(0.37));
    expect(d.result).toMatchObject({ phase: "draw", swapsLeft: 2 });
    expect(d.state.poker.active).toMatchObject({ swapsLeft: 2 });
    // no second hand while this one waits
    await expect(act(db, p, "poker_play", {}, T0)).rejects.toMatchObject({ code: "poker_open" });
    const usd = await wallet(db, p, "GOLD");
    const s1 = await act(db, p, "poker_swap", { index: 4 }, T0, always(0.37));
    expect(s1.result).toMatchObject({ phase: "draw", swapsLeft: 1, swapped: [4] });
    expect(s1.result.cards[4]).not.toEqual(d.result.cards[4]);
    expect(s1.result.cards.slice(0, 4)).toEqual(d.result.cards.slice(0, 4));
    expect(await wallet(db, p, "GOLD")).toBe(usd);
    // the last swap does not count the hand: the new card is shown first
    const s2 = await act(db, p, "poker_swap", { index: 0 }, T0, always(0.37));
    expect(s2.result).toMatchObject({ phase: "draw", swapsLeft: 0, swapped: [4, 0] });
    await expect(act(db, p, "poker_swap", { index: 1 }, T0)).rejects.toMatchObject({ code: "no_swaps" });
    const s3 = await act(db, p, "poker_stand", {}, T0, always(0.37));
    expect(s3.result).toMatchObject({ phase: "done", swapped: [4, 0], cards: s2.result.cards });
    expect(s3.state.poker.active).toBeNull();
    await expect(act(db, p, "poker_swap", { index: 0 }, T0)).rejects.toMatchObject({ code: "no_game" });
    // stand keeps the cards
    const d2 = await act(db, p, "poker_play", {}, T0 + 1000, always(0.37));
    const st = await act(db, p, "poker_stand", {}, T0 + 1000, always(0.37));
    expect(st.result).toMatchObject({ phase: "done", cards: d2.result.cards, swapped: [] });
    expect(st.result.poker.played).toBe(2);
  });

  it("poker: not enough gold", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "GOLD", 2);
    await expect(act(db, p, "poker_play", {}, T0)).rejects.toBeTruthy();
    const n = await db.query("SELECT 1 FROM games WHERE player_id=$1 AND kind='poker'", [p]);
    expect(n).toHaveLength(0);
  });

  it("zonk: scoring rules", async () => {
    const { zonkScore, zonkHasScore } = await import("../src/content/games.ts");
    expect(zonkScore([1])).toBe(100);
    expect(zonkScore([5, 5])).toBe(100);
    expect(zonkScore([1, 1, 1])).toBe(1000);
    expect(zonkScore([4, 4, 4, 4])).toBe(800);
    expect(zonkScore([1, 2, 3, 4, 5, 6])).toBe(1500);
    expect(zonkScore([2, 2, 3, 3, 6, 6])).toBe(750);
    expect(zonkScore([2, 3])).toBeNull();
    expect(zonkScore([1, 2])).toBeNull();
    expect(zonkHasScore([2, 3, 4, 6, 6, 2])).toBe(false);
    expect(zonkHasScore([2, 2, 2, 3])).toBe(true);
    const { zonkGroups } = await import("../src/content/games.ts");
    expect(zonkGroups([1, 5, 1, 1])).toEqual([{ dice: [1, 1, 1], points: 1000 }, { dice: [5], points: 50 }]);
    expect(zonkGroups([5, 1, 5])).toEqual([{ dice: [1], points: 100 }, { dice: [5], points: 50 }, { dice: [5], points: 50 }]);
    expect(zonkGroups([4, 4, 4, 4, 2])).toEqual([{ dice: [4, 4, 4, 4], points: 800 }, { dice: [2], points: null }]);
    expect(zonkGroups([6, 5, 4, 3, 2, 1])).toEqual([{ dice: [1, 2, 3, 4, 5, 6], points: 1500 }]);
    for (const d of [[1, 1, 5], [3, 3, 3, 1], [5, 5, 5, 5, 5], [2, 2, 3, 3, 4, 4]]) expect(zonkGroups(d).reduce((t, x) => t + (x.points ?? 0), 0)).toBe(zonkScore(d));
  });

  it("zonk: levels — reach the target in 10 attempts; save from 300 points; win pays, a miss or giving up gives the consolation", async () => {
    const { ZONK_LEVELS } = await import("../src/content/games.ts");
    const p = await newPlayer(db);
    // rng 0 → every die shows 1: six ones. The first level-1 game of the day is free
    const g = await act(db, p, "game_start", { game: "zonk", level: 1 }, T0, always(0));
    expect(g.result).toMatchObject({ roll: [1, 1, 1, 1, 1, 1], level: 1, target: 4000, paid: false });
    await expect(act(db, p, "zonk_move", { pick: [0, 0], then: "roll" }, T0, always(0))).rejects.toMatchObject({ code: "bad_pick" });
    // one die (100) is not enough to save
    await expect(act(db, p, "zonk_move", { pick: [0], then: "bank" }, T0, always(0))).rejects.toMatchObject({ code: "bank_min" });
    const rub = await wallet(db, p, "RUB");
    let b = await act(db, p, "zonk_move", { pick: [0, 1, 2], then: "bank" }, T0, always(0));
    expect(b.result).toMatchObject({ status: "active", round: 2, rounds: 10, total: 1000, last: { points: 1000, zonk: false } });
    for (let i = 2; i <= 4; i++) b = await act(db, p, "zonk_move", { pick: [0, 1, 2], then: "bank" }, T0, always(0));
    // 4000 reached after the 4th attempt: the choice is asked; the prize waits for the end
    expect(b.result).toMatchObject({ status: "active", total: 4000, reached: true, ask: true });
    expect(await wallet(db, p, "RUB")).toBe(rub);
    await expect(act(db, p, "zonk_move", { pick: [0, 1, 2], then: "bank" }, T0, always(0))).rejects.toMatchObject({ code: "zonk_ask" });
    // «Продолжить»: the attempts left are played for the record at the player's own risk, the prize does not grow
    const c = await act(db, p, "zonk_choice", { go: "continue" }, T0, always(0));
    expect(c.result).toMatchObject({ status: "active", ask: false, cont: true });
    b = await act(db, p, "zonk_move", { pick: [0, 1, 2], then: "bank" }, T0, always(0));
    expect(b.result.total).toBe(5000);
    b = await act(db, p, "zonk_give_up", {}, T0, always(0));
    expect(b.result).toMatchObject({ status: "done", total: 5000, result: { outcome: "win", won: true, points: 5000, xp: 10 } });
    expect(await wallet(db, p, "RUB")).toBe(rub);
    expect(await qty(db, p, "matches")).toBe(150); // level 1 pays спички
    expect(b.state.games.zonk).toMatchObject({ xp: 10, level: 0, record: { points: 5000, playerId: p, day: "today" } });
    // the second level-1 game today costs roubles
    await setMoney(db, p, "RUB", 5);
    await expect(act(db, p, "game_start", { game: "zonk", level: 1 }, T0 + M)).rejects.toMatchObject({ code: "no_money" });
    // level 2: 30 ₽; giving up ends it as not passed: only 1 xp, no consolation money
    await setMoney(db, p, "RUB", 30);
    const g2 = await act(db, p, "game_start", { game: "zonk", level: 2 }, T0 + M, always(0));
    expect(g2.result).toMatchObject({ level: 2, target: 5500, paid: true });
    expect(await wallet(db, p, "RUB")).toBe(0);
    const up = await act(db, p, "zonk_give_up", {}, T0 + M, always(0));
    expect(up.result).toMatchObject({ status: "done", result: { outcome: "gave_up", won: false, xp: 1 } });
    expect(await wallet(db, p, "RUB")).toBe(0);
    expect(up.state.games.zonk.xp).toBe(11);
    await expect(act(db, p, "game_start", { game: "zonk", level: 6 }, T0 + M)).rejects.toMatchObject({ code: "bad_level" });
  });

  it("zonk: after «Продолжить» two zonks in a row cost 1000; below the target at the end — not passed, no prize", async () => {
    const { ZONK_LEVELS } = await import("../src/content/games.ts");
    const p = await newPlayer(db);
    await act(db, p, "game_start", { game: "zonk", level: 1 }, T0, always(0));
    const rub = await wallet(db, p, "RUB");
    for (let i = 1; i <= 4; i++) await act(db, p, "zonk_move", { pick: [0, 1, 2], then: "bank" }, T0, always(0));
    await act(db, p, "zonk_choice", { go: "continue" }, T0, always(0));
    // the dice 2 3 4 6 6 2 again and again: every attempt after this one is a zonk
    const faces = [2, 3, 4, 6, 6, 2];
    let k = 0;
    const zonks = () => (faces[k++ % faces.length] - 1) / 6 + 0.01;
    const b = await act(db, p, "zonk_move", { pick: [0, 1, 2], then: "bank" }, T0, zonks);
    // 5000, then 5 zonks: the 2nd and the 4th cost 1000 each → 3000 < 4000
    expect(b.result).toMatchObject({ status: "done", total: 3000, result: { won: false, points: 3000 } });
    expect(await wallet(db, p, "RUB")).toBe(rub + (ZONK_LEVELS[0].fail.currencies?.RUB ?? 0));
  });

  it("upgrader: ×2/×4/×8 or 15/30/70%; a win gives an upgraded thing worth stake × multiplier, sold for that price", async () => {
    const { upgradeChanceOf, upgradeMode, upgradeTarget } = await import("../src/content/games.ts");
    expect(upgradeChanceOf(upgradeMode("x2")!.mult)).toBeCloseTo(0.45, 4);
    expect(upgradeChanceOf(upgradeMode("x8")!.mult)).toBeCloseTo(0.1125, 4);
    expect(upgradeChanceOf(upgradeMode("c70")!.mult)).toBeCloseTo(0.7, 4);
    expect(upgradeTarget(240)).toBe("rug-pull-gun");
    const p = await newPlayer(db);
    await give(db, p, "spinner", 4);
    // lose: the stake burns, nothing comes
    const lose = await act(db, p, "upgrade", { stake: "spinner", qty: 1, mode: "x2" }, T0, always(0.99));
    expect(lose.result).toMatchObject({ won: false, uid: null });
    expect(await qty(db, p, "spinner")).toBe(3);
    // win: 2 spinners (120 ₽) ×2 → an upgraded thing worth 240 ₽ (the dearest item not above that)
    const win = await act(db, p, "upgrade", { stake: "spinner", qty: 2, mode: "x2" }, T0, always(0.01));
    expect(win.result).toMatchObject({ won: true, stakeValue: 120, value: 240, target: upgradeTarget(240) });
    expect(win.state.upgraded).toEqual([{ uid: win.result.uid, itemId: upgradeTarget(240), value: 240 }]);
    expect(await qty(db, p, "spinner")).toBe(1);
    // the upgraded thing can go again: 240 ×4 = 960
    const again = await act(db, p, "upgrade", { uid: win.result.uid, mode: "x4" }, T0, always(0.01));
    expect(again.result).toMatchObject({ won: true, stakeValue: 240, value: 960, target: upgradeTarget(960) });
    expect(again.state.upgraded).toHaveLength(1);
    // sold for its own price
    const rub = await wallet(db, p, "RUB");
    await act(db, p, "up_sell", { uid: again.result.uid }, T0);
    expect(await wallet(db, p, "RUB")).toBe(rub + 960);
    await expect(act(db, p, "up_sell", { uid: again.result.uid }, T0)).rejects.toMatchObject({ code: "no_item" });
    // an upgraded weapon can only be sold, not taken back into the fight
    await give(db, p, "keyboard", 1);
    const kb = await act(db, p, "upgrade", { stake: "keyboard", qty: 1, mode: "c70" }, T0, always(0.01));
    await expect(act(db, p, "up_take", { uid: kb.result.uid }, T0)).rejects.toMatchObject({ code: "sell_only" });
    expect(await qty(db, p, "keyboard")).toBe(0);
    await expect(act(db, p, "upgrade", { stake: "spinner", qty: 1, mode: "x3" }, T0)).rejects.toMatchObject({ code: "bad_upgrade" });
    await expect(act(db, p, "upgrade", { stake: "jeans", qty: 1, mode: "x2" }, T0)).rejects.toMatchObject({ code: "bad_upgrade" });
  });
});

describe("clan requests", () => {
  it("a request waits for the leader; it can be cancelled; one at a time; own clan drops it", async () => {
    const a = await newPlayer(db), b = await newPlayer(db), c = await newPlayer(db);
    const ca = await act(db, a, "clan_create", { name: "Альфы", tag: "ALF", emblem: "bull", color: "#3ddc84" }, T0);
    const cc = await act(db, c, "clan_create", { name: "Сигмы", tag: "SIG", emblem: "moon", color: "#3ddc84" }, T0);
    const r = await act(db, b, "clan_join", { clanId: ca.result.clanId }, T0);
    expect(r.result.requested).toBe(true);
    expect(r.state.clan).toBeNull();
    expect(r.state.clanRequests.mine).toMatchObject({ clanId: ca.result.clanId });
    await expect(act(db, b, "clan_join", { clanId: cc.result.clanId }, T0)).rejects.toMatchObject({ code: "request_elsewhere" });
    const la = await act(db, a, "equip", { itemId: "jeans" }, T0);
    expect(la.state.clanRequests.waiting).toBe(1);
    const { clanRequests } = await import("../src/server/systems/clans.ts");
    expect(await clanRequests(db, ca.result.clanId, a)).toHaveLength(1);
    expect(await clanRequests(db, ca.result.clanId, b)).toBeNull();
    // only the leader answers
    await expect(act(db, c, "clan_accept", { playerId: b }, T0)).rejects.toMatchObject({ code: "no_request" });
    await act(db, b, "clan_cancel", {}, T0);
    await expect(act(db, a, "clan_accept", { playerId: b }, T0)).rejects.toMatchObject({ code: "no_request" });
    // apply elsewhere, get rejected, apply again, get accepted
    await act(db, b, "clan_join", { clanId: cc.result.clanId }, T0);
    await act(db, c, "clan_reject", { playerId: b }, T0);
    await act(db, b, "clan_join", { clanId: cc.result.clanId }, T0);
    const ok = await act(db, c, "clan_accept", { playerId: b }, T0);
    expect(ok.result.accepted).toBe(true);
    const [m] = await db.query<{ clan_id: number }>("SELECT clan_id FROM players WHERE id=$1", [b]);
    expect(m.clan_id).toBe(cc.result.clanId);
    // creating a clan drops a pending request
    const d = await newPlayer(db);
    await act(db, d, "clan_join", { clanId: ca.result.clanId }, T0);
    await act(db, d, "clan_create", { name: "Дельты", tag: "DLT", emblem: "moon", color: "#3ddc84" }, T0);
    expect(await clanRequests(db, ca.result.clanId, a)).toHaveLength(0);
  });
});

describe("a won fight pays at once", () => {
  it("the reward is granted with the player's next request, the victory card only shows it", async () => {
    await setBossHp({ datsik: 10 });
    const a = await newPlayer(db), b = await newPlayer(db);
    await act(db, a, "fight_start", { boss: "datsik" }, T0);
    const fb = await act(db, b, "fight_start", { boss: "datsik" }, T0);
    await give(db, a, "keyboard", 1);
    expect((await hit(a, "keyboard")).result.status).toBe("won");
    // the killer has his already
    const [ra] = await db.query<{ wins: number }>("SELECT wins FROM boss_damage WHERE player_id=$1 AND boss_id='datsik'", [a]);
    expect(Number(ra.wins)).toBe(1);
    const rub = await wallet(db, b, "RUB");
    await act(db, b, "equip", { itemId: "jeans" }, T0); // any request
    expect(await wallet(db, b, "RUB")).toBeGreaterThan(rub);
    expect(await qty(db, b, "key-datsik")).toBeGreaterThanOrEqual(1);
    const [fr] = await db.query<{ seen: boolean; reward: unknown }>("SELECT seen, reward FROM fights WHERE id=$1", [fb.result.fightId]);
    expect(fr.reward).toBeTruthy();
    expect(fr.seen).toBe(false); // the card is still to be shown
    const keys = await qty(db, b, "key-datsik");
    const c = await act(db, b, "fight_claim", { fightId: fb.result.fightId }, T0);
    expect(c.result.status).toBe("won");
    expect(await qty(db, b, "key-datsik")).toBe(keys); // nothing twice
  });
});

describe("boss slayer badges", () => {
  it("«Боссы»: a boss beaten not in a solo fight; a solo win does not count", async () => {
    const p = await newPlayer(db);
    const fight = (solo: boolean) => db.query("INSERT INTO fights (player_id, boss_id, hp_max, start_total, start_seq, started_at, ends_at, day, status, my_damage, solo) VALUES ($1,'datsik',10,0,0,now(),now(),'2020-01-01','won',10,$2)", [p, solo]);
    await expect(act(db, p, "achievement_claim", { id: "team-datsik" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    await fight(true);
    await expect(act(db, p, "achievement_claim", { id: "team-datsik" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    await fight(false);
    const r = await act(db, p, "achievement_claim", { id: "team-datsik" }, T0);
    expect(r.result.reward.achPoints).toBe(2);
    await expect(act(db, p, "achievement_claim", { id: "team-kedr" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
  });
});

describe("нычки", () => {
  it("stashes drop again and pile up; four of a set are collected for the set reward, again and again; medals at 1 / 10", async () => {
    const p = await newPlayer(db);
    // rng 0 → the chance hits and the first stash of the location drops — again and again
    const r = await act(db, p, "task", { taskId: "os-standup" }, T0, always(0));
    expect(r.result.stash).toBe("stash-sneaker");
    await act(db, p, "task", { taskId: "os-standup" }, T0, always(0));
    expect(await qty(db, p, "stash-sneaker")).toBe(2);
    await expect(act(db, p, "stash_collect", { set: "stash-set-1" }, T0)).rejects.toMatchObject({ code: "set_incomplete" });
    expect(await qty(db, p, "stash-sneaker")).toBe(2); // nothing taken on a refusal
    for (const id of ["stash-cigs", "stash-noodles", "stash-can"]) await give(db, p, id, 1);
    const rub = await wallet(db, p, "PAP");
    const c = await act(db, p, "stash_collect", { set: "stash-set-1" }, T0);
    expect(c.result.count).toBe(1);
    expect(c.state.stashSets).toEqual({ 1: 1 });
    expect(await wallet(db, p, "PAP")).toBe(rub + 100); // a set pays папиросы
    expect([await qty(db, p, "stash-sneaker"), await qty(db, p, "stash-cigs")]).toEqual([1, 0]);
    // the collection gathered once: 5 points; ten times: 20
    expect(await achGot(db, p, "stashset-1-1")).toBe(true);
    await expect(act(db, p, "achievement_claim", { id: "stashset-1-2" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    await db.query("UPDATE stash_sets SET count = 10 WHERE player_id=$1 AND set_n=1", [p]);
    expect((await act(db, p, "achievement_claim", { id: "stashset-1-2" }, T0)).result.reward.achPoints).toBe(20);
    const { itemById } = await import("../src/content/items.ts");
    expect(itemById("stash-radio")?.category).toBe("stash");
  });
});

describe("нычки v2", () => {
  it("four sets in every location; stashes come for spent energy (chance per energy, a sure find at the pity), not for closing", async () => {
    const { stashSetsByLocation, STASH_SETS } = await import("../src/content/stashes.ts");
    expect(STASH_SETS).toHaveLength(44);
    const { LOCATIONS } = await import("../src/content/locations.ts");
    expect(LOCATIONS).toHaveLength(15);
    // the first eleven have their own four sets; the four new ones (2026-11-20) borrow from all of them for now
    for (const l of LOCATIONS.slice(0, 11)) expect(stashSetsByLocation(l.id)).toHaveLength(4);
    // every stash has its picture, every set its set picture
    const { existsSync } = await import("node:fs");
    for (const s of STASH_SETS) {
      expect(existsSync(`public/assets/stash/set-${s.n}.webp`)).toBe(true);
      for (const i of s.items) expect(existsSync(`public/assets/items/${i.id}.webp`)).toBe(true);
    }
    const p = await newPlayer(db);
    const loc = LOCATIONS.find((l) => l.id === "openspace")!;
    for (const t of loc.tasks) await db.query("INSERT INTO task_progress (player_id, task_id, steps) VALUES ($1,$2,$3)", [p, t.id, t.steps]);
    const r = await act(db, p, "location_claim", { locationId: "openspace" }, T0, always(0.99));
    expect(r.result.stash).toBeNull();
    // the chance of a step is its energy × 1%: rng 0.99 never hits, the meter fills up to the sure find
    const { STASH_PITY, stashChance } = await import("../src/content/stashes.ts");
    expect(stashChance(3)).toBeCloseTo(0.2);
    await setEnergy(p, 5000, T0);
    let found: string | null = null, spent = 0;
    while (!found && spent <= STASH_PITY + 10) {
      const s = await act(db, p, "task", { taskId: "os-standup" }, T0, always(0.99));
      spent += loc.tasks[0].energy;
      found = s.result.stash;
      if (s.result.steps >= s.result.need) await db.query("UPDATE task_progress SET steps=0, done_at=now() WHERE player_id=$1", [p]);
    }
    expect(found).toMatch(/^stash-/);
    expect(spent).toBe(Math.ceil(STASH_PITY / loc.tasks[0].energy) * loc.tasks[0].energy);
    expect(stashSetsByLocation("openspace").some((s) => s.items.some((i) => i.id === found))).toBe(true);
    const [m] = await db.query<{ stash_energy: number }>("SELECT stash_energy FROM players WHERE id=$1", [p]);
    expect(Number(m.stash_energy)).toBe(0);
  });
});

describe("thing or room", () => {
  it("a «Блатной» win gives the boss's thing or his room, not both (both only with 5% luck)", async () => {
    await setBossHp({ kedr: 10 });
    const p = await newPlayer(db);
    await give(db, p, "key-datsik", 3);
    await give(db, p, "keyboard", 1);
    const f = await act(db, p, "fight_start", { boss: "kedr", mode: "blat" }, T0);
    await hit(p, "keyboard", T0, {}, 0.3);
    // 0.3: the thing (70%) and the room (50%) both come up, no 5% luck — the coin keeps one
    const c = await act(db, p, "fight_claim", { fightId: f.result.fightId }, T0, always(0.3));
    const u: string[] = c.result.reward.unlocks;
    expect(u.filter((id) => id.startsWith("room:")).length + u.filter((id) => !id.startsWith("room:") && id !== "hand-drum").length).toBe(1);
  });
});

describe("Неоновая хата", () => {
  it("drops from Кедр (15% per win with the pass), then is bought for 2000 папирос (no energy bonus)", async () => {
    await setBossHp({ kedr: 10 });
    const p = await newPlayer(db);
    await setMoney(db, p, "PAP", 5000);
    await expect(act(db, p, "room_buy", { id: "neon" }, T0)).rejects.toMatchObject({ code: "room_locked" });
    await give(db, p, "key-datsik", 3);
    await give(db, p, "keyboard", 1);
    const f = await act(db, p, "fight_start", { boss: "kedr", mode: "blat" }, T0);
    await hit(p, "keyboard");
    const c = await act(db, p, "fight_claim", { fightId: f.result.fightId }, T0, always(0.03));
    expect(c.result.reward.unlocks).toContain("room:neon");
    const b = await act(db, p, "room_buy", { id: "neon" }, T0);
    expect(b.state.player.energyMax).toBe(50);
    expect(await wallet(db, p, "PAP")).toBeLessThan(5000);
  });
});

describe("room pity", () => {
  it("a boss room drops for sure on the 10th win in a row without luck", async () => {
    await setBossHp({ kedr: 10 });
    const p = await newPlayer(db);
    await give(db, p, "key-datsik", 100);
    await give(db, p, "keyboard", 30);
    const D = 24 * H;
    const win = async (i: number) => {
      const t = T0 + Math.floor(i / 5) * D + (i % 5) * M;
      const f = await act(db, p, "fight_start", { boss: "kedr", mode: "blat" }, t);
      await hit(p, "keyboard", t, {}, 0.99);
      return act(db, p, "fight_claim", { fightId: f.result.fightId }, t, always(0.99));
    };
    for (let i = 0; i < 9; i++) expect((await win(i)).result.reward.unlocks ?? []).not.toContain("room:neon");
    expect((await win(9)).result.reward.unlocks).toContain("room:neon");
  });
});

describe("Бутылка Командате", () => {
  it("is held in the hand slot and opens from Командате for sure after 10 unlucky wins", async () => {
    await setBossHp({ bebyakyan: 10 });
    const p = await newPlayer(db);
    // the other things of his are owned: only the bottle is left to drop
    for (const it of ["tee-pump", "jacket-komandate", "pants-komandate", "sneakers-komandate"]) await give(db, p, it, 1);
    // and his chair (one of his things) is opened already
    await db.query("INSERT INTO player_unlocks (player_id, item_id, boss_id, at) VALUES ($1,'piece:chair-bebyakyan','bebyakyan',now())", [p]);
    await give(db, p, "key-garkusha", 100);
    await give(db, p, "keyboard", 30);
    const D = 24 * H;
    let opened: string[] = [];
    for (let i = 0; i < 10 && !opened.includes("bottle-komandate"); i++) {
      const t = T0 + Math.floor(i / 5) * D + (i % 5) * M;
      const f = await act(db, p, "fight_start", { boss: "bebyakyan", mode: "blat" }, t);
      await hit(p, "keyboard", t, {}, 0.99);
      const c = await act(db, p, "fight_claim", { fightId: f.result.fightId }, t, always(0.99));
      opened = c.result.reward.unlocks ?? [];
      if (i < 9) expect(opened).not.toContain("bottle-komandate");
    }
    expect(opened).toContain("bottle-komandate");
    await give(db, p, "bottle-komandate", 1);
    const e = await act(db, p, "equip", { itemId: "bottle-komandate" }, T0 + 3 * D);
    expect(e.state.look.equipped.HAND).toBe("bottle-komandate");
    const u = await act(db, p, "unequip", { slot: "HAND" }, T0 + 3 * D);
    expect(u.state.look.equipped.HAND).toBeUndefined();
  });
});

describe("boss sets and «Дела»", () => {
  it("the whole set of Командате (worn or not) adds +70 to the knife; the case shows it", async () => {
    const p = await newPlayer(db);
    await give(db, p, "keyboard", 5);
    await startDatsik(p);
    const plain = await hit(p, "keyboard", T0);
    for (const it of ["bottle-komandate", "jacket-komandate", "pants-komandate"]) await give(db, p, it, 1);
    const three = await hit(p, "keyboard", T0 + 1000);
    expect(three.result.damage).toBe(plain.result.damage);
    await give(db, p, "sneakers-komandate", 1);
    const full4 = await hit(p, "keyboard", T0 + 2000);
    expect(full4.result.damage).toBe(plain.result.damage + 70);
    expect(full4.state.setBonus).toEqual({ keyboard: 70 });
    const { profileView } = await import("../src/server/systems/state.ts");
    const { loadConfig } = await import("../src/server/config.ts");
    const prof = await profileView(db, p, p, await loadConfig(db), T0);
    const kom = prof.cases.find((c: { id: string }) => c.id === "bebyakyan")!;
    expect(kom.set).toMatchObject({ weapon: "keyboard", damage: 70, have: 4, total: 4 });
    expect(kom.closed).toBe(false);
    const dat = prof.cases.find((c: { id: string }) => c.id === "datsik")!;
    expect(dat.bestHit).toBe(full4.result.damage);
  });
});

describe("the clan boss of the week", () => {
  it("members hit it, a non-member cannot; when it falls everyone who hit gets a prize by share", async () => {
    const a = await newPlayer(db), b = await newPlayer(db), x = await newPlayer(db);
    const c = await act(db, a, "clan_create", { name: "Боссобои", tag: "BSB", emblem: "bull", color: "#3ddc84" }, T0);
    await act(db, b, "clan_join", { clanId: c.result.clanId }, T0);
    await act(db, a, "clan_accept", { playerId: b }, T0);
    await expect(act(db, x, "clan_boss_hit", { weapon: "fist" }, T0)).rejects.toMatchObject({ code: "no_clan" });
    const h1 = await act(db, a, "clan_boss_hit", { weapon: "red-candle" }, T0, always(0.99));
    expect(h1.result.damage).toBe(12);
    expect(h1.state.clanBoss).toMatchObject({ hpMax: 75_000, hp: 75_000 - 12, killed: false });
    // the fist rests 5 hours after a hit, here too
    await act(db, b, "clan_boss_hit", { weapon: "fist" }, T0, always(0.99));
    await expect(act(db, b, "clan_boss_hit", { weapon: "fist" }, T0 + 1000)).rejects.toMatchObject({ code: "cooldown" });
    // almost dead: a's next hit kills it
    await db.query("UPDATE clan_boss SET damage = hp_max - 5 WHERE clan_id=$1", [c.result.clanId]);
    const k = await act(db, a, "clan_boss_hit", { weapon: "mouse" }, T0 + 2000, always(0.99));
    expect(k.result.killed).toBe(true);
    await expect(act(db, a, "clan_boss_hit", { weapon: "fist" }, T0 + 3000)).rejects.toMatchObject({ code: "clan_boss_down" });
    const prizes = await db.query<{ player_id: number; title: string }>("SELECT player_id, title FROM prizes ORDER BY player_id");
    expect(prizes.map((p) => p.player_id).sort()).toEqual([a, b].sort());
    expect(prizes[0].title).toContain("Клановый босс");
  });
});

describe("авторитет локации", () => {
  it("every step adds a third of its authority (rounded) to the location; the one with the most is the leader", async () => {
    const a = await newPlayer(db), b = await newPlayer(db);
    await setEnergy(a, 500, T0);
    await setEnergy(b, 500, T0);
    const t = LOCATIONS[0].tasks[0];
    const r = await act(db, a, "task", { taskId: t.id }, T0);
    expect(r.result.locRep).toBe(Math.round(r.result.step.xp / 3));
    for (let i = 0; i < 2; i++) await act(db, b, "task", { taskId: t.id }, T0);
    const { locationsView } = await import("../src/server/systems/locations.ts");
    const v = await locationsView(db, a);
    const os = v.find((x) => x.id === "openspace")!;
    expect(os.rep).toBe(r.result.locRep);
    expect(os.leader).toMatchObject({ id: b, rep: r.result.locRep * 2 });
    expect(v.find((x) => x.id === "market")!.rep).toBe(0);
  });
});

describe("daily tops of blackjack and poker", () => {
  it("blackjack by the day's winnings, poker by the day's best hand (equal hands: who was first)", async () => {
    const { dayTop, addBjDaily } = await import("../src/server/systems/minigame-extras.ts");
    const { moscowDay } = await import("../src/server/core.ts");
    const a = await newPlayer(db), b = await newPlayer(db), c = await newPlayer(db);
    const ctx = (pid: number) => ({ q: db, pid, now: T0 } as unknown as Parameters<typeof addBjDaily>[0]);
    await addBjDaily(ctx(a), 12);
    await addBjDaily(ctx(a), -4);
    await addBjDaily(ctx(b), 20);
    await addBjDaily(ctx(c), -3);
    const bj = await dayTop(db, c, "bj", "today", T0);
    expect(bj.top.map((r) => [r.id, r.value])).toEqual([[b, 20], [a, 8]]);
    expect(bj.me).toMatchObject({ place: null, value: -3 });
    const day = moscowDay(T0);
    const hand = (pid: number, outcome: string, at: number) => db.query(
      "INSERT INTO games (player_id, kind, day, paid, status, state, result, created_at, updated_at) VALUES ($1,'poker',$2,true,'done','{}',$3,$4,$4)",
      [pid, day, JSON.stringify({ outcome }), new Date(at)]);
    await hand(a, "pair", T0); await hand(a, "full", T0 + 1000);
    await hand(b, "full", T0 + 500);
    await hand(c, "flush", T0);
    const pk = await dayTop(db, a, "poker", "today", T0);
    expect(pk.top.map((r) => [r.id, r.hand])).toEqual([[b, "full"], [a, "full"], [c, "flush"]]);
    expect(pk.me).toMatchObject({ place: 2, hand: "full" });
    expect((await dayTop(db, a, "poker", "yesterday", T0)).top).toHaveLength(0);
  });
});

describe("бицуха, наезд, харкнуть", () => {
  it("biceps pumped once an hour per visitor; more biceps wins a fight (+5 папирос), a minute between fights, 1000 a day; a spit leaves a message", async () => {
    const a = await newPlayer(db), b = await newPlayer(db), c = await newPlayer(db);
    await expect(act(db, a, "social_pump", { to: a }, T0)).rejects.toMatchObject({ code: "social_self" });
    expect((await act(db, a, "social_pump", { to: b }, T0)).result.biceps).toBe(1);
    await expect(act(db, a, "social_pump", { to: b }, T0 + 1000)).rejects.toMatchObject({ code: "pump_wait" });
    expect((await act(db, c, "social_pump", { to: b }, T0)).result.biceps).toBe(2);
    // a (0) on b (2): a loses; b (2) on a (0): b wins 50 ₽
    const f1 = await act(db, a, "social_fight", { to: b }, T0, always(0.5)); // 0 against 2: 1% luck
    expect(f1.result).toMatchObject({ won: false, mine: 0, theirs: 2 });
    await expect(act(db, a, "social_fight", { to: b }, T0 + 1000)).rejects.toMatchObject({ code: "fight_wait" });
    const pap = await wallet(db, b, "PAP");
    expect((await act(db, b, "social_fight", { to: a }, T0, always(0.5))).result.won).toBe(true);
    // luck: the weaker one wins now and then (0 against 2 — 1%)
    const lucky = await act(db, c, "social_fight", { to: b }, T0, always(0.001));
    expect(lucky.result).toMatchObject({ won: true, chance: 0.01 });
    expect(await wallet(db, b, "PAP")).toBe(pap + 5);
    // a minute later — again; after 1000 fights on him today — no more
    expect((await act(db, a, "social_fight", { to: b }, T0 + 61_000, always(0.5))).result.won).toBe(false);
    await db.query("INSERT INTO social_log (from_id, to_id, kind, day, at, won) SELECT $1, $2, 'fight', day, at, false FROM social_log WHERE from_id=$1 AND to_id=$2 AND kind='fight' LIMIT 1", [a, b]);
    await db.query("INSERT INTO social_log (from_id, to_id, kind, day, at, won) SELECT from_id, to_id, kind, day, at, won FROM social_log, generate_series(1, 998) WHERE from_id=$1 AND to_id=$2 AND kind='fight' LIMIT 998", [a, b]);
    await expect(act(db, a, "social_fight", { to: b }, T0 + 200_000)).rejects.toMatchObject({ code: "fight_day" });
    // an hour later the same player can be pumped again
    expect((await act(db, a, "social_pump", { to: b }, T0 + H)).result.biceps).toBe(3);
    await act(db, c, "social_spit", { to: a }, T0);
    await expect(act(db, c, "social_spit", { to: a }, T0 + 1000)).rejects.toMatchObject({ code: "spit_wait" });
    const s = await act(db, a, "equip", { itemId: "jeans" }, T0 + 2000);
    const kinds = s.state.notes.map((n: { kind: string }) => n.kind);
    expect(kinds).toEqual(["spit", "fight"]);
    expect(s.state.notes.every((n: { unread: boolean }) => n.unread)).toBe(true);
    const r = await act(db, a, "notes_read", {}, T0 + 3000);
    expect(r.state.notes.some((n: { unread: boolean }) => n.unread)).toBe(false);
  });
});

describe("режимы боя и медали боссов", () => {
  it("×1 / ×3 / ×6 HP by mode; a win gives no blasts (taken out of the game)", async () => {
    await setBossHp({ datsik: 1000 });
    for (const [mode, k] of [["pacan", 1], ["blat", 3], ["avtor", 6]] as const) {
      const p = await newPlayer(db);
      const f = await act(db, p, "fight_start", { boss: "datsik", mode }, T0);
      expect(f.result.hpMax).toBe(1000 * k);
    }
    const p = await newPlayer(db);
    await setBossHp({ datsik: 10 });
    const f = await startDatsik(p);
    await give(db, p, "rug-pull-gun", 1);
    await hit(p, "rug-pull-gun");
    const won = await act(db, p, "fight_claim", { fightId: f.result.fightId }, T0, always(0.99));
    expect(won.result.reward.medal).toBeUndefined();
    expect(won.state.setBonus ?? {}).toEqual({});
  });
});

describe("zonk duels", () => {
  it("call, accept, both play: a draw gives the stakes back; a duel left unplayed goes to the one who played", async () => {
    const a = await newPlayer(db), b = await newPlayer(db);
    await setMoney(db, a, "RUB", 50);
    await setMoney(db, b, "RUB", 50);
    const c = await act(db, a, "duel_create", { to: b, stake: 5 }, T0);
    expect(await wallet(db, a, "RUB")).toBe(45);
    // b is told in Telegram (the sender skips him while he is in the game)
    const [n] = await db.query<{ kind: string; meta: { duelId: number; stake: number } }>("SELECT kind, meta FROM notifications WHERE player_id=$1 AND kind='duel_call'", [b]);
    expect(n.meta).toMatchObject({ duelId: c.result.duelId, stake: 5 });
    // a finds b among the rivals by name
    const { duelRivals } = await import("../src/server/systems/duels.ts");
    const [bn] = await db.query<{ display_name: string }>("SELECT display_name FROM players WHERE id=$1", [b]);
    expect((await duelRivals(db, a, bn.display_name, T0)).players.some((x) => x.id === b)).toBe(true);
    await expect(act(db, a, "duel_play", { id: c.result.duelId }, T0)).rejects.toMatchObject({ code: "duel_not_playing" });
    await act(db, b, "duel_answer", { id: c.result.duelId, answer: "accept" }, T0);
    expect(await wallet(db, b, "RUB")).toBe(45);
    const g = await act(db, a, "duel_play", { id: c.result.duelId }, T0, always(0.01));
    expect(g.result).toMatchObject({ duel: c.result.duelId, rounds: 5 });
    await act(db, a, "zonk_give_up", {}, T0);
    await act(db, b, "duel_play", { id: c.result.duelId }, T0, always(0.01));
    const end = await act(db, b, "zonk_give_up", {}, T0);
    // 0 : 0 — a draw, both stakes back; every attempt is in the view (a give-up writes no attempts)
    expect(end.state.duels[0]).toMatchObject({ status: "done", won: null, rivalPoints: 0, myPoints: 0 });
    expect(Array.isArray(end.state.duels[0].myRounds)).toBe(true);
    // the result goes to the one who is not looking
    const [done] = await db.query("SELECT 1 FROM notifications WHERE player_id=$1 AND kind='duel_done'", [a]);
    expect(done).toBeTruthy();
    expect(await wallet(db, a, "RUB")).toBe(50);
    expect(await wallet(db, b, "RUB")).toBe(50);
    // the second one: b never plays — after a day a gets the pot (minus 5%)
    const d = await act(db, a, "duel_create", { to: b, stake: 10 }, T0 + 1000);
    await act(db, b, "duel_answer", { id: d.result.duelId, answer: "accept" }, T0 + 2000);
    await act(db, a, "duel_play", { id: d.result.duelId }, T0 + 3000, always(0.01));
    await act(db, a, "zonk_give_up", {}, T0 + 4000);
    const later = await act(db, a, "equip", { itemId: "jeans" }, T0 + 25 * H);
    expect(later.state.duels.find((x: { id: number }) => x.id === d.result.duelId)).toMatchObject({ status: "done", won: true, pot: 19 });
    expect(await wallet(db, a, "RUB")).toBe(59);
    // a call nobody answers: the stake comes back after a day
    const e = await act(db, a, "duel_create", { to: b, stake: 1 }, T0 + 26 * H);
    await act(db, a, "equip", { itemId: "jeans" }, T0 + 51 * H);
    const [row] = await db.query<{ status: string }>("SELECT status FROM duels WHERE id=$1", [e.result.duelId]);
    expect(row.status).toBe("expired");
    expect(await wallet(db, a, "RUB")).toBe(59);
  });
});

describe("Нервные пальцы", () => {
  it("the first win over Кедр gives the drumming hand at once; it is worn in the hand slot", async () => {
    await setBossHp({ kedr: 10 });
    const p = await newPlayer(db);
    await give(db, p, "key-datsik", 100);
    await give(db, p, "keyboard", 30);
    await expect(act(db, p, "buy", { offerId: "hand-drum" }, T0)).rejects.toMatchObject({ code: "bad_offer" });
    const f = await act(db, p, "fight_start", { boss: "kedr", mode: "blat" }, T0);
    await hit(p, "keyboard");
    const c = await act(db, p, "fight_claim", { fightId: f.result.fightId }, T0, always(0.99));
    expect(c.result.reward.unlocks).toContain("hand-drum");
    expect(await qty(db, p, "hand-drum")).toBe(1); // given, nothing to buy
    const e = await act(db, p, "equip", { itemId: "hand-drum" }, T0 + M);
    expect(e.state.look.equipped.HAND).toBe("hand-drum");
  });
});

describe("Боксёрская", () => {
  it("drops from Командате, costs 4000 папирос; the fist stays as it is", async () => {
    await setBossHp({ bebyakyan: 10 });
    const p = await newPlayer(db);
    await setMoney(db, p, "PAP", 5000);
    await give(db, p, "key-garkusha", 3);
    await give(db, p, "keyboard", 1);
    const f = await act(db, p, "fight_start", { boss: "bebyakyan", mode: "blat" }, T0);
    await hit(p, "keyboard");
    const c = await act(db, p, "fight_claim", { fightId: f.result.fightId }, T0, always(0.03));
    expect(c.result.reward.unlocks).toContain("room:boxing");
    await act(db, p, "room_buy", { id: "boxing" }, T0);
    expect(await wallet(db, p, "PAP")).toBe(5000 + (c.result.reward.currencies?.PAP ?? 0) - 4000);
    await setBossHp({ datsik: 1000 });
    await startDatsik(p, T0 + M);
    expect((await hit(p, "fist", T0 + M)).result.damage).toBe(20);
  });
});

describe("нычки между игроками", () => {
  it("a player asks for up to 6 stashes; others send them from their own, at most 6 a day each", async () => {
    const a = await newPlayer(db), b = await newPlayer(db);
    await expect(act(db, a, "stash_wish", { items: ["stash-cigs", "stash-can", "stash-bread", "stash-soap", "stash-radio", "stash-coffee", "stash-book"] }, T0)).rejects.toMatchObject({ code: "too_many" });
    await expect(act(db, a, "stash_wish", { items: ["keyboard"] }, T0)).rejects.toMatchObject({ code: "bad_item" });
    await act(db, a, "stash_wish", { items: ["stash-cigs", "stash-can"] }, T0);
    await expect(act(db, b, "stash_gift", { to: a, itemId: "stash-cigs" }, T0)).rejects.toMatchObject({ code: "no_item" });
    await give(db, b, "stash-cigs", 10);
    await give(db, b, "stash-bread", 1);
    await expect(act(db, b, "stash_gift", { to: a, itemId: "stash-bread" }, T0)).rejects.toMatchObject({ code: "not_wished" });
    await expect(act(db, b, "stash_gift", { to: b, itemId: "stash-cigs" }, T0)).rejects.toMatchObject({ code: "bad_request" });
    for (let i = 0; i < 6; i++) await act(db, b, "stash_gift", { to: a, itemId: "stash-cigs" }, T0);
    await expect(act(db, b, "stash_gift", { to: a, itemId: "stash-cigs" }, T0)).rejects.toMatchObject({ code: "gift_limit" });
    // the gifts wait in «Сообщения» until accepted
    expect(await qty(db, a, "stash-cigs")).toBe(0);
    expect(await qty(db, b, "stash-cigs")).toBe(4);
    const box = await act(db, a, "stash_accept", { id: (await db.query<{ id: number }>("SELECT id FROM stash_gifts WHERE to_id=$1 ORDER BY id LIMIT 1", [a]))[0].id }, T0);
    expect(box.state.stashInbox).toHaveLength(5);
    expect(await qty(db, a, "stash-cigs")).toBe(1);
    await act(db, a, "stash_accept", {}, T0);
    expect(await qty(db, a, "stash-cigs")).toBe(6);
    await expect(act(db, a, "stash_accept", {}, T0)).rejects.toMatchObject({ code: "no_gift" });
    // a new Moscow day: the limit is back
    await act(db, b, "stash_gift", { to: a, itemId: "stash-cigs" }, T0 + 24 * H);
    const s = await act(db, a, "stash_wish", { items: ["stash-cigs"] }, T0 + 24 * H);
    expect(s.state.stashWish).toEqual(["stash-cigs"]);
    expect(s.state.stashInbox[0]).toMatchObject({ fromId: b, itemId: "stash-cigs" });
    expect(s.state.stashGifts[0]).toMatchObject({ fromId: b, itemId: "stash-cigs" });
  });
});

describe("upgrader spins", () => {
  it("3 free spins a Moscow day, then 500 ₽ a spin; no money — no spin, the stake stays", async () => {
    const p = await newPlayer(db);
    await give(db, p, "spinner", 10);
    await setMoney(db, p, "RUB", 600);
    for (let i = 0; i < 3; i++) {
      const r = await act(db, p, "upgrade", { stake: "spinner", qty: 1, mode: "x2" }, T0, always(0.99));
      expect(r.result.paid).toBe(false);
    }
    expect(await wallet(db, p, "RUB")).toBe(600);
    const paid = await act(db, p, "upgrade", { stake: "spinner", qty: 1, mode: "x2" }, T0, always(0.99));
    expect(paid.result.paid).toBe(true);
    expect(paid.state.upgradeSpins).toMatchObject({ freeLeft: 0, price: { currency: "RUB", amount: 500 } });
    expect(await wallet(db, p, "RUB")).toBe(100);
    await expect(act(db, p, "upgrade", { stake: "spinner", qty: 1, mode: "x2" }, T0)).rejects.toMatchObject({ code: "no_money" });
    expect(await qty(db, p, "spinner")).toBe(6);
    const next = await act(db, p, "upgrade", { stake: "spinner", qty: 1, mode: "x2" }, T0 + 24 * H, always(0.99));
    expect(next.result.paid).toBe(false);
  });
});

describe("«Крафт»", () => {
  it("makes a thing from 5×5 parts, puts it in the stash: its bonus works (energy, biceps, weapon damage); out again — gone", async () => {
    const p = await newPlayer(db);
    for (const id of ["part-board", "part-nails", "part-scotch", "part-rope", "part-sandpaper"]) await give(db, p, id, 5);
    await expect(act(db, p, "craft_make", { itemId: "craft-flamethrower" }, T0)).rejects.toMatchObject({ code: "no_item" });
    const m = await act(db, p, "craft_make", { itemId: "craft-nail-bat" }, T0);
    expect(m.result).toMatchObject({ itemId: "craft-nail-bat" });
    expect(await qty(db, p, "craft-nail-bat")).toBe(1);
    expect(await qty(db, p, "part-board")).toBe(0);
    // the cells are closed until bought
    await expect(act(db, p, "craft_put", { itemId: "craft-nail-bat" }, T0)).rejects.toMatchObject({ code: "boxes_full" });
    await expect(act(db, p, "craft_box_buy", {}, T0)).rejects.toMatchObject({ code: "need_talents" });
    await db.query("INSERT INTO player_stats (player_id, total_damage, talent_damage) VALUES ($1, 100, 100) ON CONFLICT (player_id) DO UPDATE SET total_damage = 100, talent_damage = 100", [p]);
    await setMoney(db, p, "RUB", 1500);
    const b = await act(db, p, "craft_box_buy", {}, T0); // the first cell: 1 000 ₽
    expect(b.result).toMatchObject({ slot: 0, price: 1000, open: 1 });
    expect(b.state.craftBoxesOpen).toBe(1);
    await expect(act(db, p, "craft_box_buy", {}, T0)).rejects.toMatchObject({ code: "need_talents" }); // the second needs 5 talents
    await expect(act(db, p, "craft_put", { itemId: "craft-nail-bat", slot: 1 }, T0)).rejects.toMatchObject({ code: "box_locked" });
    const put = await act(db, p, "craft_put", { itemId: "craft-nail-bat" }, T0);
    expect(put.result).toMatchObject({ slot: 0 });
    expect(put.state.craftBoxes[0]).toBe("craft-nail-bat");
    expect(put.state.setBonus.fist).toBe(3);
    const [row] = await db.query<{ talent_biceps: number }>("SELECT talent_biceps FROM players WHERE id=$1", [p]);
    expect(row.talent_biceps).toBe(50);
    await expect(act(db, p, "craft_put", { itemId: "craft-nail-bat" }, T0)).rejects.toMatchObject({ code: "boxes_full" }); // one open cell, taken
    const out = await act(db, p, "craft_take", { slot: 0 }, T0);
    expect(out.state.craftBoxes[0]).toBe(null);
    expect(await qty(db, p, "craft-nail-bat")).toBe(1);
    const [row2] = await db.query<{ talent_biceps: number }>("SELECT talent_biceps FROM players WHERE id=$1", [p]);
    expect(row2.talent_biceps).toBe(0);
  });

  it("a level-3 thing is not a weapon (for now): it only adds damage in the stash", async () => {
    await setBossHp({ datsik: 100000 });
    const p = await newPlayer(db);
    await give(db, p, "craft3-railgun", 1);
    await startDatsik(p);
    await expect(hit(p, "craft3-railgun")).rejects.toMatchObject({ code: "bad_weapon" });
  });

  it("the dealer sells no parts but takes them back; a thing is taken apart; parts are asked for and sent ×5", async () => {
    const p = await newPlayer(db);
    await setMoney(db, p, "TOKEN", 10000);
    const id = "part-nails";
    // the dealer sells no parts any more (the toolbox in the shop gives them for tokens)
    await expect(act(db, p, "dealer_buy", { itemId: id, qty: 1 }, T0)).rejects.toMatchObject({ code: "not_sold" });
    await give(db, p, id, 5);
    const pap = await wallet(db, p, "PAP");
    const sold = await act(db, p, "sell", { itemId: id, qty: 5 }, T0);
    expect(sold.result).toMatchObject({ got: 250, currency: "PAP" }); // parts go for папиросы
    expect(await wallet(db, p, "PAP")).toBe(pap + 250);
    for (const pid of ["part-board", "part-nails", "part-scotch", "part-rope", "part-sandpaper"]) await give(db, p, pid, 5);
    await act(db, p, "craft_make", { itemId: "craft-nail-bat" }, T0);
    const sp = await act(db, p, "craft_split", { itemId: "craft-nail-bat" }, T0, always(0.5));
    expect(sp.result.back).toHaveLength(5);
    expect(await qty(db, p, "part-board")).toBe(2);
    const q = await newPlayer(db);
    await act(db, q, "stash_wish", { items: ["part-board"] }, T0);
    await give(db, p, "part-board", 10);
    const g = await act(db, p, "stash_gift", { to: q, itemId: "part-board", qty: 5 }, T0);
    expect(g.result).toMatchObject({ qty: 5 });
    await act(db, q, "stash_accept", {}, T0);
    expect(await qty(db, q, "part-board")).toBe(5);
  });
});

describe("Тося", () => {
  it("a pie costs 8 bars and holds only roubles, weapons, tokens and tickets in their ranges; he comes and goes", async () => {
    const { rollPie, tosyaPrice, tosyaVisit, tosyaPies } = await import("../src/content/tosya.ts");
    let s = 1;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) {
      const pie = rollPie(rng);
      expect(Object.keys(pie.currencies!).sort()).toEqual(["RUB", "TOKEN"]);
      expect(pie.currencies!.RUB).toBeGreaterThanOrEqual(90);
      expect(pie.currencies!.RUB).toBeLessThanOrEqual(150);
      expect(pie.currencies!.TOKEN).toBeGreaterThanOrEqual(40);
      expect(pie.currencies!.TOKEN).toBeLessThanOrEqual(50);
      const t = pie.items!.find((x) => x.id === "fortune-ticket")!.qty;
      expect(t).toBeGreaterThanOrEqual(5);
      expect(t).toBeLessThanOrEqual(9);
      const w = pie.items!.filter((x) => x.id !== "fortune-ticket");
      for (const x of w) expect(x.qty).toBeGreaterThan(0);
      const wt = w.reduce((a, x) => a + x.qty, 0);
      expect(wt).toBeGreaterThanOrEqual(60);
      expect(wt).toBeLessThanOrEqual(95);
      expect(pie.xp ?? 0).toBe(0);
    }
    expect([0, 1, 2, 3, 4].map((b) => tosyaPrice(b, 5))).toEqual([8, 8, 8, 8, 8]);
    expect(tosyaVisit(T0, { mode: "off", at: 0 })).toBeNull();
    // started by hand: here for 3 hours, a new start is a new visit
    expect(tosyaVisit(T0 + 3600_000, { mode: "run", at: T0 })).toMatchObject({ id: `run-${T0}`, endsAt: T0 + 3 * 3600_000 });
    expect(tosyaVisit(T0 + 3600_000, { mode: "run", at: T0 + 60_000 })!.id).not.toBe(`run-${T0}`);
    const p = tosyaPies(7, "x");
    expect(p).toBeGreaterThanOrEqual(3);
    expect(p).toBeLessThanOrEqual(5);
  });
  it("buys pies off the tray for gold bars, each one once", async () => {
    await db.query("INSERT INTO config (key, value) VALUES ('tosya', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [JSON.stringify({ mode: "run", at: T0 - 60_000 })]);
    resetConfigCache();
    const p = await newPlayer(db);
    await setMoney(db, p, "GOLD", 1000);
    const r1 = await act(db, p, "tosya_buy", { slot: 0 }, T0);
    const pies = r1.state.tosya!.pies;
    expect(r1.result.price).toBe(8);
    await expect(act(db, p, "tosya_buy", { slot: 0 }, T0)).rejects.toMatchObject({ code: "tosya_taken" });
    const r2 = await act(db, p, "tosya_buy", { slot: 1 }, T0);
    expect(r2.result.price).toBe(8);
    expect(await wallet(db, p, "GOLD")).toBeGreaterThanOrEqual(1000 - r1.result.price - r2.result.price);
    expect(r2.state.tosya!.taken).toBe(3);
    // a pie may hold one of Тося's tattoos (50%), never the same twice
    const tats = [...r1.result.reward.items, ...r2.result.reward.items].filter((i: { id: string }) => /^tat-(oven|maid|yakuza)-/.test(i.id));
    expect(tats.length).toBeLessThanOrEqual(2);
    if (tats.length === 2) expect(tats[0].id).not.toBe(tats[1].id);
    await db.query("DELETE FROM config WHERE key='tosya'");
    resetConfigCache();
  });
});

describe("admin broadcast", () => {
  it("queues the message for every player with Telegram and notifications on", async () => {
    const { broadcast } = await import("../src/server/admin.ts");
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    await db.query("UPDATE players SET telegram_id = 700000 + id WHERE id IN ($1,$2)", [a, b]);
    await db.query("UPDATE players SET notify_on=false WHERE id=$1", [b]);
    const r = await broadcast(db, 1, "Новый ивент!", false);
    expect(r.queued).toBeGreaterThanOrEqual(1);
    const rows = await db.query<{ player_id: number; meta: { text: string } }>("SELECT player_id, meta FROM notifications WHERE kind='broadcast'");
    expect(rows.some((x) => x.player_id === a && x.meta.text === "Новый ивент!")).toBe(true);
    expect(rows.some((x) => x.player_id === b)).toBe(false);
    await expect(broadcast(db, 1, "  ", false)).rejects.toMatchObject({ code: "bad_request" });
  });
});

describe("gifts limit", () => {
  it("one player gets at most 6 pieces a day from one sender — stashes and parts together", async () => {
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    const c = await newPlayer(db);
    await give(db, a, "part-gear", 20);
    for (const to of [b, c]) await act(db, to, "stash_wish", { items: ["part-gear"] }, T0);
    const r1 = await act(db, a, "stash_gift", { to: b, itemId: "part-gear", qty: 5 }, T0);
    expect(r1.result).toMatchObject({ qty: 5, left: 1 });
    // ×5 with one left sends one
    const r2 = await act(db, a, "stash_gift", { to: b, itemId: "part-gear", qty: 5 }, T0);
    expect(r2.result).toMatchObject({ qty: 1, left: 0 });
    await expect(act(db, a, "stash_gift", { to: b, itemId: "part-gear", qty: 1 }, T0)).rejects.toMatchObject({ code: "gift_limit" });
    // another player has his own 6
    expect((await act(db, a, "stash_gift", { to: c, itemId: "part-gear", qty: 5 }, T0)).result.qty).toBe(5);
    // the next Moscow day — again
    expect((await act(db, a, "stash_gift", { to: b, itemId: "part-gear", qty: 1 }, T0 + 24 * 3600_000)).result.qty).toBe(1);
  });
});

describe("admin funnel", () => {
  it("counts the newcomers' steps", async () => {
    const { funnel } = await import("../src/server/admin.ts");
    const p = await newPlayer(db);
    await db.query("UPDATE players SET telegram_id = 900000 + id, created_at = now() - interval '3 days' WHERE id=$1", [p]);
    await db.query("INSERT INTO action_log (player_id, type, ok, at) VALUES ($1,'yard_pick',true, now() - interval '3 days' + interval '5 minutes'), ($1,'task',true, now() - interval '2 days' + interval '1 hour')", [p]);
    const f = await funnel(db, 30);
    expect(f.players).toBeGreaterThanOrEqual(1);
    expect(f.steps.find((s) => s.id === "yard")!.hour).toBeGreaterThanOrEqual(1);
    expect(f.day1).toBeGreaterThanOrEqual(1);
  });
});

describe("Новичок", () => {
  it("a chain of tasks for the first 3 days: done by the action log, claimed in order, then the chest", async () => {
    const { NEWBIE_TASKS } = await import("../src/content/newbie.ts");
    const p = await newPlayer(db);
    await db.query("UPDATE players SET created_at=$2 WHERE id=$1", [p, new Date(T0 - 60_000)]);
    const st = async () => (await act(db, p, "help_seen", { topic: "zonk" }, T0)).state.newbie!;
    let v = await st();
    expect(v.tasks).toHaveLength(NEWBIE_TASKS.length);
    expect(v.tasks[0]).toMatchObject({ id: "yard3", have: 0, n: 3, claimed: false });
    await expect(act(db, p, "newbie_claim", { id: "yard3" }, T0)).rejects.toMatchObject({ code: "newbie_not_done" });
    await db.query("INSERT INTO action_log (player_id, type, ok, at) VALUES ($1,'yard_pick',true,$2),($1,'yard_pick',true,$2),($1,'yard_pick',true,$2),($1,'task',true,$2),($1,'task',true,$2),($1,'task',true,$2)", [p, new Date(T0)]);
    v = await st();
    expect(v.tasks[0].have).toBe(3);
    // in order: the second one waits for the first
    await expect(act(db, p, "newbie_claim", { id: "task3" }, T0)).rejects.toMatchObject({ code: "newbie_order" });
    const r = await act(db, p, "newbie_claim", { id: "yard3" }, T0);
    expect(r.result.reward.xp).toBe(900);
    await expect(act(db, p, "newbie_claim", { id: "yard3" }, T0)).rejects.toMatchObject({ code: "newbie_claimed" });
    await act(db, p, "newbie_claim", { id: "task3" }, T0);
    await expect(act(db, p, "newbie_claim", { id: "chest" }, T0)).rejects.toMatchObject({ code: "newbie_not_done" });
    // after 3 days the event is gone
    expect((await act(db, p, "help_seen", { topic: "poker" }, T0 + 3 * 24 * 3600_000)).state.newbie).toBeNull();
  });
});

describe("exchanger overnight", () => {
  it("11 → 3: open from 11:00 till 3:00 at night every day (Moscow)", async () => {
    const { cleanSchedule, exchangeWindow, exchangeScheduleText } = await import("../src/content/currencies.ts");
    const s = cleanSchedule({ mode: "cycle", every: 1, offset: 0, from: 11, to: 3 });
    expect(s.to).toBe(27);
    const msk = (d: string, h: number) => Date.parse(`${d}T00:00:00Z`) + (h - 3) * 3600_000;
    expect(exchangeWindow(msk("2026-11-05", 10), s).open).toBe(false);
    expect(exchangeWindow(msk("2026-11-05", 12), s)).toMatchObject({ open: true, until: msk("2026-11-06", 3) });
    expect(exchangeWindow(msk("2026-11-06", 2), s)).toMatchObject({ open: true, until: msk("2026-11-06", 3) });
    expect(exchangeWindow(msk("2026-11-06", 4), s)).toMatchObject({ open: false, until: msk("2026-11-06", 11) });
    expect(exchangeScheduleText(s)).toBe("каждый день · с 11:00 до 03:00 ночи по Москве");
  });
});

describe("«Комбо»", () => {
  it("a day's hidden sequence per boss and mode: right hits add up, a wrong one starts over; done — the payout by «Забрать»", async () => {
    const { COMBO_FREE } = await import("../src/content/combo.ts");
    const { comboSequence } = await import("../src/server/systems/combo.ts");
    const { moscowDay } = await import("../src/server/core.ts");
    const day = moscowDay(T0);
    const seq = await comboSequence(db, day, "garkusha", "pacan");
    expect(seq).toHaveLength(6);
    expect(seq.every((h) => COMBO_FREE.includes(h))).toBe(true); // «Пацанский»: the hand hits only
    // «Блатной» / «Авторитетный»: every weapon 1–2 times (never more than the payout gives back), the rest hand hits and the bat
    for (const m of ["blat", "avtor"] as const) for (const b of ["garkusha", "solntse", "vadim"]) {
      const sq = await comboSequence(db, day, b, m);
      for (const w of ["keyboard", "gpu", "rug-pull-gun"]) {
        const n = sq.filter((h) => h === w).length;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(2);
      }
      expect(sq.every((h) => [...COMBO_FREE, "bat", "keyboard", "gpu", "rug-pull-gun"].includes(h))).toBe(true);
    }
    expect(await comboSequence(db, day, "garkusha", "pacan")).toEqual(seq); // one for everybody
    expect(await comboSequence(db, moscowDay(T0 + 24 * H), "garkusha", "pacan")).not.toEqual(seq); // a new one tomorrow
    expect(await comboSequence(db, day, "botsman", "avtor")).toHaveLength(16);

    // the weak bosses (before Гаркуша): no combo at all
    const w = await newPlayer(db);
    expect((await act(db, w, "fight_start", { boss: "datsik", combo: "pacan" }, T0)).result.combo).toBeNull();

    const p = await newPlayer(db);
    await give(db, p, "keys-bundle", 1);
    await give(db, p, "keyboard", 10);
    await act(db, p, "fight_start", { boss: "garkusha", combo: "pacan" }, T0);
    const hit = async (w: string) => {
      await db.query("DELETE FROM cooldowns WHERE player_id=$1", [p]);
      return (await act(db, p, "attack", { weapon: w }, T0, always(0.99))).result.combo;
    };
    // a wrong first hit: nothing
    const wrong = COMBO_FREE.find((h) => h !== seq[0])!;
    expect((await hit(wrong)).progress).toBe(0);
    let c = await hit(seq[0]);
    expect(c).toMatchObject({ progress: 1, guessed: [seq[0]], last: "right" });
    // a miss after two right: back to zero, the two guessed stay shown (grey)
    c = await hit(seq[1]);
    c = await hit(COMBO_FREE.find((h) => h !== seq[2] && h !== seq[0])!);
    expect(c).toMatchObject({ progress: 0, guessed: [], known: seq.slice(0, 2), last: "wrong" });
    c = await hit(seq[0]);
    expect(c).toMatchObject({ progress: 1, known: seq.slice(0, 2) });
    const xp0 = Number((await db.query<{ xp: number }>("SELECT xp FROM players WHERE id=$1", [p]))[0].xp);
    const kb0 = await qty(db, p, "keyboard");
    for (let i = 1; i < seq.length; i++) c = await hit(seq[i]);
    // done: the payout is already his, the window only shows it
    expect(c).toMatchObject({ progress: 6, done: true, claimed: true });
    expect(Number((await db.query<{ xp: number }>("SELECT xp FROM players WHERE id=$1", [p]))[0].xp)).toBeGreaterThanOrEqual(xp0 + 800);
    expect(await qty(db, p, "keyboard")).toBeGreaterThan(kb0);
    // done in this fight: more hits change nothing
    expect((await hit(wrong)).done).toBe(true);
    await expect(act(db, p, "combo_claim", { boss: "garkusha", mode: "pacan" }, T0)).rejects.toMatchObject({ code: "combo_none" });
    // the achievement: Гаркуша's «Пацанское» done once
    expect(await achGot(db, p, "combo-garkusha-pacan-1")).toBe(true);
    // a new fight with him in the same combo mode: from zero again, the hits known (grey), and it pays again
    await act(db, p, "fight_flee", {}, T0);
    await act(db, p, "fight_flee", {}, T0).catch(() => undefined);
    const f2 = await act(db, p, "fight_start", { boss: "garkusha", combo: "pacan" }, T0 + M);
    expect(f2.result.combo).toBe("pacan");
    c = await hit(seq[0]);
    expect(c).toMatchObject({ progress: 1, done: false, runs: 1, known: seq });
    const kb1 = await qty(db, p, "keyboard");
    for (let i = 1; i < seq.length; i++) c = await hit(seq[i]);
    expect(c).toMatchObject({ done: true, runs: 2 });
    expect(await qty(db, p, "keyboard")).toBeGreaterThan(kb1);
  });

  it("the admin's «Комбо»: today's and tomorrow's sequences, the weak bosses not there", async () => {
    const { combosAdmin, comboSequence } = await import("../src/server/systems/combo.ts");
    const { moscowDay } = await import("../src/server/core.ts");
    const a = await combosAdmin(db, T0);
    expect(a.days.map((d) => d.day)).toEqual([moscowDay(T0), moscowDay(T0 + 24 * H)]);
    expect(a.days[0].bosses.some((b) => b.id === "datsik" || b.id === "mugo")).toBe(false);
    const g = a.days[0].bosses.find((b) => b.id === "garkusha")!;
    expect(g.modes.find((m) => m.mode === "blat")!.seq).toEqual(await comboSequence(db, moscowDay(T0), "garkusha", "blat"));
  });

  it("«Дополнительная награда»: 5 % and 10 % of the fight's HP — the first bosses' passes, the others' tattoos of the mode's set", async () => {
    const { bonusReached, bossBonus } = await import("../src/content/boss-bonus.ts");
    expect(bossBonus("datsik", 1000, "pacan").map((s) => s.damage)).toEqual([50, 100]);
    expect(bossBonus("datsik", 1000, "pacan").map((s) => s.reward.items)).toEqual([[{ id: "key-datsik", qty: 1 }], [{ id: "key-datsik", qty: 1 }]]);
    expect(bonusReached("datsik", 1000, "pacan", 49)).toHaveLength(0);
    expect(bonusReached("datsik", 1000, "pacan", 100)).toHaveLength(2);
    // a later boss: a tattoo of his «Пацанский» set for each stage; «Блатной» has no tattoo set — no box
    const v = bossBonus("vadim", 2000, "pacan");
    expect(v.map((s) => s.damage)).toEqual([100, 200]);
    expect(v.every((s) => !!s.set)).toBe(true);
    expect(bossBonus("vadim", 2000, "blat")).toEqual([]);
    // Солнце: 3 % for 1 000 roubles first, then the tattoos at 5 % and 10 % (he has a tattoo set in every mode)
    expect(bossBonus("solntse", 2000, "pacan").map((s) => s.damage)).toEqual([60, 100, 200]);
    expect(bossBonus("solntse", 2000, "pacan")[0].reward).toEqual({ currencies: { RUB: 1000 } });
    // the set complete (or one piece left — the win's own): no tattoo stages
    expect(bossBonus("solntse", 2000, "pacan", () => true).map((s) => s.damage)).toEqual([60]);
    expect(bossBonus("vadim", 2000, "pacan", () => true)).toEqual([]);
  });

  it("the payout by the mode (the user's table)", async () => {
    const { rollComboReward } = await import("../src/content/combo.ts");
    let s = 7;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 30; i++) {
      const a = rollComboReward("avtor", rng);
      expect(a.xp).toBeGreaterThanOrEqual(2600);
      expect(a.xp).toBeLessThanOrEqual(3700);
      expect(a.currencies).toMatchObject({ RUB: 12 });
      const stash = a.items!.filter((x) => x.id.startsWith("stash-")).reduce((t, x) => t + x.qty, 0);
      expect(stash).toBeGreaterThanOrEqual(25);
      expect(stash).toBeLessThanOrEqual(35);
      const parts = a.items!.filter((x) => x.id.startsWith("part-")).reduce((t, x) => t + x.qty, 0);
      expect(parts).toBeGreaterThanOrEqual(5);
      expect(parts).toBeLessThanOrEqual(8);
    }
  });
});
