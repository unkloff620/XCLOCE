import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/server/db.ts";
import * as G from "../src/server/game.ts";
import { ATTACKS_PER_DAY, KEYS_TO_UNLOCK, simulateBattle, winChance } from "../src/shared/economy.ts";
import { BOSSES } from "../src/shared/content.ts";
import { always, bal, freshDb, newPlayer, qty } from "./helpers.ts";

let db: Db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db.close(); });
let clock = Date.UTC(2026, 9, 1, 10, 0, 0); // a Thursday
const t = () => (clock += 1_000);

describe("battle math", () => {
  it("win chance grows with power and the simulation respects it", () => {
    expect(winChance(100, 900)).toBeGreaterThan(0.9);
    expect(winChance(100, 2_000)).toBeLessThan(0.01);
    expect(simulateBattle(100, 900, always(0.5)).win).toBe(true);
    expect(simulateBattle(100, 5_000, always(0.99)).win).toBe(false);
  });
});

describe("bosses", () => {
  it("boss #1 is open, others locked; locked bosses cannot be attacked", async () => {
    const pid = await newPlayer(db);
    const st = await db.tx((tx) => G.getState(tx, pid, clock));
    expect(st.bosses.map((b) => b.unlocked)).toEqual([true, false, false, false, false, false, false, false, false, false]);
    expect(st.bosses).toHaveLength(10);
    await expect(db.tx((tx) => G.doAttack(tx, pid, 2, t()))).rejects.toMatchObject({ code: "boss_locked" });
  });

  it("a win pays reward, key, xp and power; attacks are limited to 7 per day per boss", async () => {
    const pid = await newPlayer(db);
    const rub0 = await bal(db, pid, "RUB");
    const r = await db.tx((tx) => G.doAttack(tx, pid, 1, t(), always(0.5)));
    expect(r.win).toBe(true);
    expect(await qty(db, pid, "key-1")).toBe(1);
    expect(await bal(db, pid, "RUB")).toBe(rub0 + BOSSES[0].reward.amount);
    for (let i = 1; i < ATTACKS_PER_DAY; i++) await db.tx((tx) => G.doAttack(tx, pid, 1, t(), always(0.5)));
    await expect(db.tx((tx) => G.doAttack(tx, pid, 1, t(), always(0.5)))).rejects.toMatchObject({ code: "no_attempts" });
    const st = await db.tx((tx) => G.getState(tx, pid, clock));
    expect(st.bosses[0]).toMatchObject({ wins: ATTACKS_PER_DAY, attemptsLeft: 0 });
    // next UTC day — attempts are back
    const tomorrow = clock + 24 * 3_600_000;
    const again = await db.tx((tx) => G.doAttack(tx, pid, 1, tomorrow, always(0.5)));
    expect(again.attemptsLeft).toBe(ATTACKS_PER_DAY - 1);
  });

  it("3 keys from boss #1 unlock boss #2 and are consumed", async () => {
    const pid = await newPlayer(db);
    for (let i = 0; i < KEYS_TO_UNLOCK - 1; i++) await db.tx((tx) => G.doAttack(tx, pid, 1, t(), always(0.5)));
    await expect(db.tx((tx) => G.unlockBoss(tx, pid, 2, t()))).rejects.toMatchObject({ code: "no_keys" });
    await db.tx((tx) => G.doAttack(tx, pid, 1, t(), always(0.5)));
    const st0 = await db.tx((tx) => G.getState(tx, pid, clock));
    expect(st0.bosses[1].canUnlock).toBe(true);
    await db.tx((tx) => G.unlockBoss(tx, pid, 2, t()));
    expect(await qty(db, pid, "key-1")).toBe(0);
    const st = await db.tx((tx) => G.getState(tx, pid, clock));
    expect(st.bosses[1].unlocked).toBe(true);
    await expect(db.tx((tx) => G.unlockBoss(tx, pid, 3, t()))).rejects.toMatchObject({ code: "no_keys" });
  });

  it("a loss uses an attempt and gives only partial xp", async () => {
    const pid = await newPlayer(db);
    await db.query("INSERT INTO player_bosses (player_id, boss_index, unlocked) VALUES ($1, 5, TRUE)", [pid]);
    const r = await db.tx((tx) => G.doAttack(tx, pid, 5, t(), always(0.5)));
    expect(r.win).toBe(false);
    expect(r.key).toBeNull();
    expect(r.attemptsLeft).toBe(ATTACKS_PER_DAY - 1);
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
