import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/server/db.ts";
import * as G from "../src/server/game.ts";
import { ATTACKS_PER_DAY } from "../src/shared/economy.ts";
import { BOSSES, LOCATIONS } from "../src/shared/content.ts";
import { always, bal, freshDb, newPlayer, qty } from "./helpers.ts";

let db: Db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db.close(); });
let clock = Date.UTC(2026, 9, 1, 10, 0, 0); // a Thursday
const t = () => (clock += 1_000);

const H = 3_600_000;
const start = (pid: number, boss = 1, at = t()) => db.tx((tx) => G.startFight(tx, pid, boss, at));
const hit = (pid: number, weapon = "fists", at = t()) => db.tx((tx) => G.hitFight(tx, pid, weapon, at));
const view = (pid: number) => db.tx((tx) => G.fightView(tx, pid, clock));
const claim = (pid: number, at = t()) => db.tx((tx) => G.claimFight(tx, pid, at, always(0.99)));
const give = (pid: number, item: string, n = 1) => db.query("INSERT INTO inventory (player_id, item_type, item_id, quantity) VALUES ($1,'item',$2,$3) ON CONFLICT (player_id, item_type, item_id) DO UPDATE SET quantity = inventory.quantity + $3", [pid, item, n]);
const openBoss = (pid: number, n: number) => db.query("INSERT INTO player_bosses (player_id, boss_index, unlocked) VALUES ($1,$2,TRUE) ON CONFLICT (player_id, boss_index) DO UPDATE SET unlocked = TRUE", [pid, n]);

describe("personal fights with global damage", () => {
  it("boss #1 is open, others locked; fists are always available", async () => {
    const pid = await newPlayer(db);
    const st = await db.tx((tx) => G.getState(tx, pid, clock));
    expect(st.bosses.map((b) => b.unlocked)).toEqual([true, false, false, false, false, false, false, false, false, false]);
    expect(st.weapons).toEqual([{ id: "fists", name: "Кулаки", dmg: 20, cooldownMin: 60, qty: null }]);
    expect(st.fight).toBeNull();
    await expect(start(pid, 2)).rejects.toMatchObject({ code: "boss_locked" });
    await expect(hit(pid)).rejects.toMatchObject({ code: "no_fight" });
  });

  it("fist deals 20 damage and recharges for 1 hour", async () => {
    const pid = await newPlayer(db);
    await start(pid);
    const h1 = await hit(pid);
    expect(h1).toMatchObject({ dmg: 20, hp: BOSSES[0].hp - 20, won: false });
    await expect(hit(pid)).rejects.toMatchObject({ code: "cooldown" });
    const h2 = await hit(pid, "fists", h1.readyAt + 1_000);
    expect(h2.hp).toBe(BOSSES[0].hp - 40);
  });

  it("every player's damage hits every active fight, whatever boss they fight", async () => {
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    await openBoss(b, 2);
    await start(b, 2);
    await hit(b); // before A's fight — does not count for A
    await start(a, 1);
    expect((await view(a))?.hp).toBe(BOSSES[0].hp);
    await hit(b, "fists", clock + 2 * H);
    const v = await view(a);
    expect(v?.hp).toBe(BOSSES[0].hp - 20);
    expect(v?.damage).toEqual([expect.objectContaining({ id: b, damage: 20, hits: 1, boss_index: 2 })]);
    expect((await view(b))?.hp).toBe(BOSSES[1].hp - 40);
  });

  it("victory window → claim pays reward + key, ends the fight and resets cooldowns", async () => {
    const pid = await newPlayer(db);
    await give(pid, "w-diamond-fist");
    const rub0 = await bal(db, pid, "RUB");
    await start(pid);
    await hit(pid); // fist goes on cooldown
    const k = await hit(pid, "w-diamond-fist");
    expect(k).toMatchObject({ won: true, hp: 0 });
    await expect(hit(pid, "w-diamond-fist", clock + 5 * H)).rejects.toMatchObject({ code: "boss_dead" });
    await expect(start(pid, 1)).rejects.toMatchObject({ code: "fight_result" });
    expect((await db.tx((tx) => G.getState(tx, pid, clock))).fight).toMatchObject({ won: true, lost: false, bossIndex: 1 });
    expect(await qty(db, pid, "w-diamond-fist")).toBe(0); // consumed
    const r = await claim(pid);
    expect(r).toMatchObject({ outcome: "win", bossIndex: 1, key: "key-1", myDamage: 3520 });
    expect(await bal(db, pid, "RUB")).toBe(rub0 + BOSSES[0].reward.amount);
    expect(await qty(db, pid, "key-1")).toBe(1);
    const st = await db.tx((tx) => G.getState(tx, pid, clock));
    expect(st.fight).toBeNull();
    expect(st.bosses[0].wins).toBe(1);
    await expect(claim(pid)).rejects.toMatchObject({ code: "no_fight" });
    await start(pid);
    await expect(hit(pid)).resolves.toMatchObject({ dmg: 20 }); // fist cooldown was reset
  });

  it("a boss killed by other players' damage can be claimed without hitting", async () => {
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    await start(a, 1);
    await openBoss(b, 3);
    await give(b, "w-diamond-fist");
    await start(b, 3);
    await hit(b, "w-diamond-fist");
    expect((await view(a))?.won).toBe(true);
    await expect(claim(a)).resolves.toMatchObject({ myDamage: 0, key: "key-1" });
    expect((await view(b))?.won).toBe(false); // boss #3 has more HP
  });

  it("weapons are spent one per hit and have no cooldown", async () => {
    const pid = await newPlayer(db);
    await give(pid, "w-paper-fan", 2);
    await start(pid);
    await expect(hit(pid, "w-paper-fan")).resolves.toMatchObject({ dmg: 40, hp: BOSSES[0].hp - 40 });
    await expect(hit(pid, "w-paper-fan")).resolves.toMatchObject({ hp: BOSSES[0].hp - 80 });
    await expect(hit(pid, "w-paper-fan")).rejects.toMatchObject({ code: "no_item" });
    expect(await qty(db, pid, "w-paper-fan")).toBe(0);
    expect((await db.tx((tx) => G.getState(tx, pid, clock))).weapons.map((w) => w.id)).toEqual(["fists"]);
  });

  it("a fight lasts 8 hours: then it is lost, later hits do not count", async () => {
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    const t0 = clock + 1_000;
    await start(a, 1, t0);
    await hit(a, "fists", t0 + 1_000);
    await expect(hit(a, "fists", t0 + 8 * H + 5_000)).rejects.toMatchObject({ code: "fight_over" });
    await give(b, "w-diamond-fist");
    await start(b, 1, t0 + 9 * H);
    await hit(b, "w-diamond-fist", t0 + 9 * H + 1_000); // after A's fight ended — must not kill A's boss
    const st = await db.tx((tx) => G.getState(tx, a, t0 + 9 * H + 2_000));
    expect(st.fight).toMatchObject({ lost: true, won: false, hp: BOSSES[0].hp - 20 });
    const r = await db.tx((tx) => G.claimFight(tx, a, t0 + 9 * H + 3_000));
    expect(r).toMatchObject({ outcome: "lose", reward: null, key: null });
    expect(await qty(db, a, "key-1")).toBe(0);
    expect((await db.tx((tx) => G.getState(tx, a, t0 + 9 * H + 4_000))).fight).toBeNull();
  });

  it("one fight at a time, fleeing ends it, 7 fights per boss per day", async () => {
    const pid = await newPlayer(db);
    await openBoss(pid, 2);
    await start(pid, 1);
    await expect(start(pid, 2)).rejects.toMatchObject({ code: "in_fight" });
    await db.tx((tx) => G.fleeFight(tx, pid, t()));
    for (let i = 1; i < ATTACKS_PER_DAY; i++) {
      await start(pid, 1);
      await db.tx((tx) => G.fleeFight(tx, pid, t()));
    }
    await expect(start(pid, 1)).rejects.toMatchObject({ code: "no_attempts" });
    await expect(start(pid, 1, clock + 24 * H)).resolves.toMatchObject({ already: false });
  });

  it("3 keys from boss #1 unlock boss #2 and are consumed", async () => {
    const pid = await newPlayer(db);
    await give(pid, "w-diamond-fist", 3);
    for (let i = 0; i < 3; i++) {
      await start(pid);
      await hit(pid, "w-diamond-fist");
      await claim(pid);
    }
    expect((await db.tx((tx) => G.getState(tx, pid, clock))).bosses[1].canUnlock).toBe(true);
    await db.tx((tx) => G.unlockBoss(tx, pid, 2, t()));
    expect(await qty(db, pid, "key-1")).toBe(0);
    expect((await db.tx((tx) => G.getState(tx, pid, clock))).bosses[1].unlocked).toBe(true);
  });
});

describe("market locations", () => {
  it("task steps spend energy and advance progress; finishing a location pays its reward and opens the next", async () => {
    const pid = await newPlayer(db);
    const loc = LOCATIONS[0];
    const rub0 = await bal(db, pid, "RUB");
    const r = await db.tx((tx) => G.doTask(tx, pid, loc.tasks[0].id, t()));
    expect(r).toMatchObject({ progress: 1, target: loc.tasks[0].target, done: false, locationComplete: false, reward: loc.tasks[0].reward });
    expect((await db.tx((tx) => G.getState(tx, pid, clock))).player.energy).toBe(100 - loc.tasks[0].energy);
    expect(await bal(db, pid, "RUB")).toBe(rub0 + loc.tasks[0].reward.amount);
    await expect(db.tx((tx) => G.doTask(tx, pid, LOCATIONS[1].tasks[0].id, t()))).rejects.toMatchObject({ code: "locked" });
    await expect(db.tx((tx) => G.claimLocation(tx, pid, loc.id, t()))).rejects.toMatchObject({ code: "not_complete" });
    await db.query("UPDATE players SET energy = 5000 WHERE id=$1", [pid]);
    let last = r;
    for (const task of loc.tasks) {
      const already = task === loc.tasks[0] ? 1 : 0;
      for (let i = already; i < task.target; i++) last = await db.tx((tx) => G.doTask(tx, pid, task.id, t()));
    }
    expect(last).toMatchObject({ done: true, locationComplete: true });
    await expect(db.tx((tx) => G.doTask(tx, pid, loc.tasks[0].id, t()))).rejects.toMatchObject({ code: "task_done" });
    const before = await bal(db, pid, "RUB");
    const c = await db.tx((tx) => G.claimLocation(tx, pid, loc.id, t()));
    expect(c).toMatchObject({ clears: 1 });
    expect(await bal(db, pid, "RUB")).toBe(before + loc.reward.price.amount);
    expect(await qty(db, pid, "x-chest")).toBe(1);
    const st = await db.tx((tx) => G.getState(tx, pid, clock));
    expect(st.locations.clears[loc.id]).toBe(1);
    expect(st.locations.progress[loc.tasks[0].id]).toBeUndefined(); // replayable
    await expect(db.tx((tx) => G.doTask(tx, pid, LOCATIONS[1].tasks[0].id, t()))).resolves.toMatchObject({ progress: 1 });
    await db.query("UPDATE players SET energy = 0 WHERE id=$1", [pid]);
    await expect(db.tx((tx) => G.doTask(tx, pid, loc.tasks[0].id, t()))).rejects.toMatchObject({ code: "no_energy" });
  });
});

describe("yard", () => {
  it("an item appears every 5 s, lies 30 s, can be picked once and pays its reward", async () => {
    const pid = await newPlayer(db);
    const now = Math.floor(clock / 5_000) * 5_000 + 2_500;
    const v = await db.tx((tx) => G.yardView(tx, pid, now));
    expect(v.items).toHaveLength(6);
    const it = v.items[v.items.length - 1];
    expect(it).toEqual(G.yardItem(pid, it.slot));
    const rub0 = await bal(db, pid, "RUB");
    await db.query("UPDATE players SET energy = 10, energy_updated_at = $2 WHERE id=$1", [pid, new Date(now)]);
    const r = await db.tx((tx) => G.yardPick(tx, pid, it.slot, now));
    expect(r.kind).toBe(it.kind);
    if (it.reward.rub) expect(await bal(db, pid, "RUB")).toBe(rub0 + it.reward.rub);
    if (it.reward.energy) expect((await db.tx((tx) => G.getState(tx, pid, now))).player.energy).toBe(10 + it.reward.energy);
    if (it.reward.item) expect(await qty(db, pid, it.reward.item)).toBe(1);
    await expect(db.tx((tx) => G.yardPick(tx, pid, it.slot, now))).rejects.toMatchObject({ code: "yard_taken" });
    await expect(db.tx((tx) => G.yardPick(tx, pid, it.slot, now + 60_000))).rejects.toMatchObject({ code: "yard_gone" });
    await expect(db.tx((tx) => G.yardPick(tx, pid, it.slot + 5, now))).rejects.toMatchObject({ code: "yard_gone" });
    expect((await db.tx((tx) => G.yardView(tx, pid, now))).items).toHaveLength(5);
  });

  it("has a daily pickup limit", async () => {
    const pid = await newPlayer(db);
    const now = Math.floor(clock / 5_000) * 5_000 + 1_000;
    const cur = Math.floor(now / 5_000);
    for (let i = 0; i < 100; i++) await db.query("INSERT INTO yard_pickups (player_id, slot, item, created_at) VALUES ($1,$2,'beer',$3)", [pid, cur - 1000 - i, new Date(now)]);
    await expect(db.tx((tx) => G.yardPick(tx, pid, cur, now))).rejects.toMatchObject({ code: "yard_limit" });
    expect((await db.tx((tx) => G.yardView(tx, pid, now))).items).toHaveLength(0);
  });
});

describe("profile", () => {
  it("nickname can be changed once per 24h and must be unique", async () => {
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    await expect(db.tx((tx) => G.renamePlayer(tx, a, "ab", t()))).rejects.toMatchObject({ code: "bad_name" });
    await db.tx((tx) => G.renamePlayer(tx, a, "  Doge   King ", t()));
    expect((await db.tx((tx) => G.getState(tx, a, clock))).player.name).toBe("Doge King");
    await expect(db.tx((tx) => G.renamePlayer(tx, a, "Doge Queen", t()))).rejects.toMatchObject({ code: "rename_cooldown" });
    await expect(db.tx((tx) => G.renamePlayer(tx, b, "doge king", t()))).rejects.toMatchObject({ code: "name_taken" });
    await expect(db.tx((tx) => G.renamePlayer(tx, a, "Doge Queen", clock + 25 * H))).resolves.toMatchObject({ name: "Doge Queen" });
  });
});

describe("shop, inventory", () => {
  it("gear: equipping raises power, duplicate purchase is idempotent; weapons are stackable consumables", async () => {
    const pid = await newPlayer(db);
    const p0 = (await db.tx((tx) => G.getState(tx, pid, clock))).player.power;
    await db.tx((tx) => G.shopBuy(tx, pid, "h-cap", "k1", t()));
    await db.tx((tx) => G.shopBuy(tx, pid, "h-cap", "k1", t()));
    expect(await qty(db, pid, "h-cap")).toBe(1);
    await expect(db.tx((tx) => G.shopBuy(tx, pid, "h-cap", "k2", t()))).rejects.toMatchObject({ code: "owned" });
    const e = await db.tx((tx) => G.equip(tx, pid, "h-cap", t()));
    expect(e.power).toBe(p0 + 10);
    const u = await db.tx((tx) => G.unequip(tx, pid, "hat", t()));
    expect(u.power).toBe(p0);
    await db.tx((tx) => G.shopBuy(tx, pid, "w-paper-fan", "k3", t()));
    await db.tx((tx) => G.shopBuy(tx, pid, "w-paper-fan", "k4", t()));
    expect(await qty(db, pid, "w-paper-fan")).toBe(2);
    await expect(db.tx((tx) => G.equip(tx, pid, "w-paper-fan", t()))).rejects.toMatchObject({ code: "not_gear" });
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
