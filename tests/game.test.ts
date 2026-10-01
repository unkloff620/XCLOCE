import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/server/db.ts";
import * as G from "../src/server/game.ts";
import { ATTACKS_PER_DAY, DAMAGE_MULT, avgHit, rollHit } from "../src/shared/economy.ts";
import { ITEMS } from "../src/shared/items.ts";
import { BOSSES } from "../src/shared/content.ts";
import { always, bal, freshDb, newPlayer, qty } from "./helpers.ts";

let db: Db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db.close(); });
let clock = Date.UTC(2026, 9, 1, 10, 0, 0); // a Thursday
const t = () => (clock += 1_000);

describe("hit math", () => {
  it("damage scales with power, crits double it", () => {
    expect(rollHit(100, always(0.5))).toEqual({ dmg: 100 * DAMAGE_MULT, crit: false });
    expect(rollHit(100, always(0.01)).crit).toBe(true);
    expect(avgHit(200)).toBeGreaterThan(avgHit(100));
  });
});

const hit = (pid: number, boss = 1, at = t(), weapon = G.FISTS) => db.tx((tx) => G.doHit(tx, pid, boss, weapon, at, always(0.5)));
const settle = (pid: number) => db.tx((tx) => G.lockPlayer(tx, pid, t()));
const fightOf = (pid: number, boss = 1) => db.tx((tx) => G.bossFight(tx, pid, boss, clock));

describe("shared bosses", () => {
  it("boss #1 is open, others locked; locked bosses cannot be hit", async () => {
    const pid = await newPlayer(db);
    const st = await db.tx((tx) => G.getState(tx, pid, clock));
    expect(st.bosses.map((b) => b.unlocked)).toEqual([true, false, false, false, false, false, false, false, false, false]);
    expect(st.bosses[0]).toMatchObject({ hp: BOSSES[0].hp, hpMax: BOSSES[0].hp });
    expect(st.weapons.map((w) => w.id)).toEqual([G.FISTS]);
    await expect(hit(pid, 2)).rejects.toMatchObject({ code: "boss_locked" });
  });

  it("HP is shared; the kill splits the reward by damage and gives keys to the killer and big hitters", async () => {
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    const rubA = await bal(db, a, "RUB");
    const rubB = await bal(db, b, "RUB");
    const h1 = await hit(a);
    expect(h1).toMatchObject({ dmg: 300, hp: 600, killed: false, attemptsLeft: ATTACKS_PER_DAY - 1 });
    await hit(a);
    const seenByB = await fightOf(b);
    expect(seenByB.hp).toBe(300);
    expect(seenByB.damage).toEqual([expect.objectContaining({ id: a, damage: 600, hits: 2 })]);
    const kill = await hit(b);
    expect(kill).toMatchObject({ killed: true, hp: 0 });
    expect(kill.kill).toMatchObject({ killer: true, key: true, amount: 300 });
    expect(await bal(db, b, "RUB")).toBe(rubB + 300);
    expect(await qty(db, b, "key-1")).toBe(1);
    // A's share is paid on A's next action
    expect(await bal(db, a, "RUB")).toBe(rubA);
    await settle(a);
    expect(await bal(db, a, "RUB")).toBe(rubA + 600);
    expect(await qty(db, a, "key-1")).toBe(1);
    await settle(a); // paid only once
    expect(await bal(db, a, "RUB")).toBe(rubA + 600);
    const fresh = await fightOf(a);
    expect(fresh).toMatchObject({ hp: BOSSES[0].hp, damage: [] });
    expect(fresh.lastKill).toMatchObject({ killerId: b, myReward: { amount: 600, key: true, killer: false } });
    const st = await db.tx((tx) => G.getState(tx, a, clock));
    expect(st.bosses[0].wins).toBe(1);
  });

  it("small contributors get a share but no key", async () => {
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    for (const pid of [a, b]) await db.query("INSERT INTO player_bosses (player_id, boss_index, unlocked) VALUES ($1, 5, TRUE)", [pid]);
    await db.query("UPDATE players SET power_bonus = 5000 WHERE id=$1", [b]);
    await hit(a, 5);
    const k = await hit(b, 5);
    expect(k.killed).toBe(true);
    await settle(a);
    expect(await qty(db, a, "key-5")).toBe(0);
    const f = await fightOf(a, 5);
    expect(f.lastKill?.myReward).toMatchObject({ key: false, share: 300 / BOSSES[4].hp });
  });

  it("hits are limited to 7 per day per boss and come back the next day", async () => {
    const pid = await newPlayer(db);
    for (let i = 0; i < ATTACKS_PER_DAY; i++) await hit(pid);
    await expect(hit(pid)).rejects.toMatchObject({ code: "no_attempts" });
    expect(await qty(db, pid, "key-1")).toBe(2); // killed on hits 3 and 6
    const again = await hit(pid, 1, clock + 24 * 3_600_000);
    expect(again.attemptsLeft).toBe(ATTACKS_PER_DAY - 1);
  });

  it("3 keys from boss #1 unlock boss #2 and are consumed", async () => {
    const pid = await newPlayer(db);
    for (let i = 0; i < 6; i++) await hit(pid);
    await expect(db.tx((tx) => G.unlockBoss(tx, pid, 2, t()))).rejects.toMatchObject({ code: "no_keys" });
    for (let i = 0; i < 3; i++) await hit(pid, 1, clock + 24 * 3_600_000 + i * 1000);
    const day2 = clock + 24 * 3_600_000 + 10_000;
    const st0 = await db.tx((tx) => G.getState(tx, pid, day2));
    expect(st0.bosses[1].canUnlock).toBe(true);
    await db.tx((tx) => G.unlockBoss(tx, pid, 2, day2 + 1_000));
    expect(await qty(db, pid, "key-1")).toBe(0);
    const st = await db.tx((tx) => G.getState(tx, pid, day2 + 2_000));
    expect(st.bosses[1].unlocked).toBe(true);
  });

  it("weapons: only owned ones can be used and they add damage", async () => {
    const pid = await newPlayer(db);
    const w = ITEMS.find((i) => i.kind === "weapon")!;
    await expect(hit(pid, 1, t(), w.id)).rejects.toMatchObject({ code: "no_item" });
    await db.query("INSERT INTO inventory (player_id, item_type, item_id, quantity) VALUES ($1,'item',$2,1)", [pid, w.id]);
    const r = await hit(pid, 1, t(), w.id);
    expect(r.dmg).toBe((100 + (w.power ?? 0)) * DAMAGE_MULT);
    const st = await db.tx((tx) => G.getState(tx, pid, clock));
    expect(st.weapons.map((x) => x.id)).toEqual([G.FISTS, w.id]);
  });
});

describe("market tasks, shop, inventory", () => {
  it("tasks spend energy and grant currency, xp and power", async () => {
    const pid = await newPlayer(db);
    const before = await db.tx((tx) => G.getState(tx, pid, clock));
    const r = await db.tx((tx) => G.doTask(tx, pid, "t-chat", t()));
    expect(r.reward.amount).toBe(350);
    const after = await db.tx((tx) => G.getState(tx, pid, clock));
    expect(after.player.energy).toBe(before.player.energy - 5);
    expect(after.player.power).toBeGreaterThan(before.player.power);
    await expect(db.tx((tx) => G.doTask(tx, pid, "t-mining", t()))).rejects.toMatchObject({ code: "locked" });
    await db.query("UPDATE players SET energy = 3 WHERE id = $1", [pid]);
    await expect(db.tx((tx) => G.doTask(tx, pid, "t-chat", t()))).rejects.toMatchObject({ code: "no_energy" });
  });

  it("buying and equipping a weapon raises power; duplicate purchase is idempotent", async () => {
    const pid = await newPlayer(db);
    const p0 = (await db.tx((tx) => G.getState(tx, pid, clock))).player.power;
    await db.tx((tx) => G.shopBuy(tx, pid, "w-paper-fan", "k1", t()));
    await db.tx((tx) => G.shopBuy(tx, pid, "w-paper-fan", "k1", t()));
    expect(await qty(db, pid, "w-paper-fan")).toBe(1);
    await expect(db.tx((tx) => G.shopBuy(tx, pid, "w-paper-fan", "k2", t()))).rejects.toMatchObject({ code: "owned" });
    const e = await db.tx((tx) => G.equip(tx, pid, "w-paper-fan", t()));
    expect(e.power).toBe(p0 + 20);
    const u = await db.tx((tx) => G.unequip(tx, pid, "weapon", t()));
    expect(u.power).toBe(p0);
    await expect(db.tx((tx) => G.equip(tx, pid, "w-ban-hammer", t()))).rejects.toMatchObject({ code: "not_owned" });
  });

  it("consumables restore energy and chests give loot", async () => {
    const pid = await newPlayer(db);
    await db.query("UPDATE players SET energy = 10 WHERE id=$1", [pid]);
    await db.tx((tx) => G.shopBuy(tx, pid, "x-energy", undefined, t()));
    await db.tx((tx) => G.useItem(tx, pid, "x-energy", t()));
    expect((await db.tx((tx) => G.getState(tx, pid, clock))).player.energy).toBe(40);
    await db.query("INSERT INTO inventory (player_id, item_type, item_id, quantity) VALUES ($1,'item','x-chest',1)", [pid]);
    const c = await db.tx((tx) => G.useItem(tx, pid, "x-chest", t(), always(0.01)));
    expect(c.loot?.reward).toMatchObject({ currency: "RUB", amount: 5_000 });
    expect(await qty(db, pid, "x-chest")).toBe(0);
  });

  it("daily reward and daily missions pay once", async () => {
    const pid = await newPlayer(db);
    const r = await db.tx((tx) => G.claimDaily(tx, pid, t()));
    expect(r.day).toBe(1);
    await expect(db.tx((tx) => G.claimDaily(tx, pid, t()))).rejects.toMatchObject({ code: "daily_cooldown" });
    await db.tx((tx) => G.claimMission(tx, pid, "m-login", t()));
    await expect(db.tx((tx) => G.claimMission(tx, pid, "m-login", t()))).rejects.toMatchObject({ code: "claimed" });
    await expect(db.tx((tx) => G.claimMission(tx, pid, "m-tasks5", t()))).rejects.toMatchObject({ code: "not_done" });
  });

  it("idle income accrues up to the cap and is claimable", async () => {
    const pid = await newPlayer(db);
    await db.query("UPDATE players SET idle_claimed_at = $2 WHERE id=$1", [pid, new Date(clock - 20 * 3_600_000)]);
    const r = await db.tx((tx) => G.claimIdle(tx, pid, clock));
    expect(r.amount).toBe(400 * 8); // capped at 8 h
    await expect(db.tx((tx) => G.claimIdle(tx, pid, clock))).rejects.toMatchObject({ code: "idle_empty" });
  });
});

describe("clans", () => {
  it("create, request, accept, kick, power sum and disband", async () => {
    const [leader, a, b] = [await newPlayer(db), await newPlayer(db), await newPlayer(db)];
    await db.query("UPDATE balances SET amount = 50000 WHERE currency='RUB'");
    const { clanId } = await db.tx((tx) => G.createClan(tx, leader, "Doge Army", "DOGE", "much wow", t()));
    await expect(db.tx((tx) => G.createClan(tx, a, "doge army", "DG", "", t()))).rejects.toMatchObject({ code: "clan_exists" });
    await db.tx((tx) => G.requestJoin(tx, a, clanId, t()));
    await db.tx((tx) => G.requestJoin(tx, b, clanId, t()));
    await expect(db.tx((tx) => G.decideRequest(tx, a, b, true, t()))).rejects.toMatchObject({ code: "not_leader" });
    await db.tx((tx) => G.decideRequest(tx, leader, a, true, t()));
    await db.tx((tx) => G.decideRequest(tx, leader, b, false, t()));
    let c = (await db.tx((tx) => G.clanDetails(tx, clanId, leader)))!;
    expect(c.members.map((m) => m.id).sort()).toEqual([leader, a].sort());
    expect(c.requests).toHaveLength(0);
    expect(c.power).toBe(c.members.reduce((s, m) => s + m.power, 0));
    await db.tx((tx) => G.kickMember(tx, leader, a, t()));
    c = (await db.tx((tx) => G.clanDetails(tx, clanId, leader)))!;
    expect(c.members).toHaveLength(1);
    await db.tx((tx) => G.disbandClan(tx, leader, t()));
    expect(await db.tx((tx) => G.clanDetails(tx, clanId, leader))).toBeNull();
    const st = await db.tx((tx) => G.getState(tx, leader, clock));
    expect(st.clan).toBeNull();
  });
});
