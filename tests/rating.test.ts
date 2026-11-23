import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "../src/server/db.ts";
import { achGot, act, always, freshDb, give, H, newPlayer, wallet } from "./helpers.ts";
import { nextMoscowMidnight, weekKey, weekStart } from "../src/server/core.ts";
import { ratingView } from "../src/server/systems/rating.ts";
import { profileView } from "../src/server/systems/state.ts";
import { loadConfig } from "../src/server/config.ts";
import { WEEKLY_PRIZES } from "../src/content/achievements.ts";

const D = 24 * H;
let db: Db;
let T0: number;
beforeEach(async () => {
  db = await freshDb();
  // Wednesday noon MSK, two weeks ahead: far from the migration's "previous week"
  T0 = weekStart(nextMoscowMidnight(Date.now())) + 14 * D + 2 * D + 12 * H;
});

describe("weeks", () => {
  it("a Moscow week starts on Monday 00:00 MSK", () => {
    const mon = weekStart(T0);
    expect(new Date(mon + 3 * H).getUTCDay()).toBe(1);
    expect(new Date(mon + 3 * H).getUTCHours()).toBe(0);
    expect(weekKey(mon)).toBe(weekKey(mon + 7 * D - 1));
    expect(weekKey(mon + 7 * D)).not.toBe(weekKey(mon));
  });
});

describe("rating", () => {
  it("hits add to this week's damage; the board is sorted; my place is known", async () => {
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    for (const p of [a, b]) {
      await give(db, p, "keyboard", 5);
      await act(db, p, "fight_start", { boss: "datsik" }, T0);
    }
    await act(db, a, "attack", { weapon: "keyboard" }, T0, always(0.99));
    await act(db, b, "attack", { weapon: "keyboard" }, T0, always(0.99));
    await act(db, b, "attack", { weapon: "keyboard" }, T0, always(0.99));
    const v = await ratingView(db, a, await loadConfig(db), T0);
    expect(v.damage.map((r) => [r.id, r.value])).toEqual([[b, 60], [a, 30]]);
    expect(v.me.damage).toEqual({ value: 30, place: 2 });
  });

  it("a finished week is settled once: top-10 prizes, frames for the leaders, prizes collected by the winners", async () => {
    const prev = weekKey(T0 - 7 * D);
    const ids: number[] = [];
    for (let i = 0; i < 12; i++) {
      const p = await newPlayer(db);
      ids.push(p);
      await db.query("INSERT INTO weekly_stats (week, player_id, damage, hits) VALUES ($1,$2,$3,1)", [prev, p, 1000 - i * 10]);
    }
    const s = await act(db, ids[0], "equip", { itemId: "jeans" }, T0);
    expect(s.state.prizes).toHaveLength(1);
    expect(s.state.prizes[0].title).toContain("1 место");
    // settling again changes nothing
    await act(db, ids[0], "equip", { itemId: "jeans" }, T0 + H);
    const [{ n }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM prizes");
    expect(n).toBe(10);
    const eleventh = await act(db, ids[10], "equip", { itemId: "jeans" }, T0);
    expect(eleventh.state.prizes).toHaveLength(0);

    const xp0 = Number((await db.query<{ xp: number }>("SELECT xp FROM players WHERE id=$1", [ids[0]]))[0].xp);
    const c = await act(db, ids[0], "prize_claim", { id: s.state.prizes[0].id }, T0);
    expect(Number((await db.query<{ xp: number }>("SELECT xp FROM players WHERE id=$1", [ids[0]]))[0].xp)).toBe(xp0 + (WEEKLY_PRIZES[0].xp ?? 0));
    expect(c.state.prizes).toHaveLength(0);
    await expect(act(db, ids[0], "prize_claim", { id: s.state.prizes[0].id }, T0)).rejects.toMatchObject({ code: "prize_taken" });
    // someone else's prize cannot be taken
    const [other] = await db.query<{ id: number }>("SELECT id FROM prizes WHERE player_id=$1", [ids[1]]);
    await expect(act(db, ids[0], "prize_claim", { id: other.id }, T0)).rejects.toMatchObject({ code: "prize_taken" });

    const v = await ratingView(db, ids[0], await loadConfig(db), T0);
    expect(v.lastWinners.map((w) => w.id)).toEqual(ids.slice(0, 3));
    const prof = await profileView(db, ids[5], ids[0], await loadConfig(db), T0);
    expect(prof.frame).toBe("gold");
    expect((await profileView(db, ids[0], ids[1], await loadConfig(db), T0)).frame).toBe("silver");
    expect((await profileView(db, ids[0], ids[11], await loadConfig(db), T0)).frame).toBeNull();
  });

  it("the top-10 clans of the week: every member gets a prize", async () => {
    const prev = weekKey(T0 - 7 * D);
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    await setMoneyAll(a);
    await act(db, a, "clan_create", { name: "Альфа", tag: "ALF", emblem: "skull", color: "#ff4d6d" }, T0 - 8 * D);
    const [{ clan_id }] = await db.query<{ clan_id: number }>("SELECT clan_id FROM players WHERE id=$1", [a]);
    await act(db, b, "clan_join", { clanId: clan_id }, T0 - 8 * D);
    await act(db, a, "clan_accept", { playerId: b }, T0 - 8 * D);
    await db.query("INSERT INTO weekly_stats (week, player_id, damage) VALUES ($1,$2,500)", [prev, a]);
    const r = await act(db, b, "equip", { itemId: "jeans" }, T0);
    expect(r.state.prizes.map((p: { title: string }) => p.title)).toEqual(["Клан «Альфа» — 1 место недели"]);
  });
});

async function setMoneyAll(pid: number) {
  for (const c of ["RUB", "PAP", "TOOTH", "TOKEN", "GOLD"]) await db.query("UPDATE wallets SET amount=100000 WHERE player_id=$1 AND currency=$2", [pid, c]);
}

describe("achievements and someone's profile", () => {
  it("a position is collected once, only when reached, for achievement points; the profile shows them and the room", async () => {
    const p = await newPlayer(db);
    const pts = async () => Number((await db.query<{ n: number }>("SELECT ach_points AS n FROM players WHERE id=$1", [p]))[0].n);
    await expect(act(db, p, "achievement_claim", { id: "damage-1" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    await give(db, p, "keyboard", 10);
    await act(db, p, "fight_start", { boss: "datsik" }, T0);
    for (let i = 0; i < 10; i++) await act(db, p, "attack", { weapon: "keyboard" }, T0, always(0.99));
    const viewer = await newPlayer(db);
    let prof = await profileView(db, viewer, p, await loadConfig(db), T0);
    const dealt = prof.achievements.find((a) => a.id === "damage-1")!;
    expect(dealt.done).toBe(false);
    expect(dealt.progress).toBeGreaterThan(0);
    // 1 000 damage dealt in all: the first position, not the second
    await db.query("UPDATE player_stats SET total_damage = 1000 WHERE player_id=$1", [p]);
    await expect(act(db, p, "achievement_claim", { id: "damage-2" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    // counted by itself with the next game state, its point with it
    const before = await pts();
    await act(db, p, "equip", { itemId: "jeans" }, T0);
    expect(await achGot(db, p, "damage-1")).toBe(true);
    expect(await achGot(db, p, "damage-2")).toBe(false);
    expect(await pts()).toBeGreaterThanOrEqual(before + 1);
    await expect(act(db, p, "achievement_claim", { id: "damage-1" }, T0)).rejects.toMatchObject({ code: "achievement_taken" });

    prof = await profileView(db, viewer, p, await loadConfig(db), T0);
    expect(prof.self).toBe(false);
    expect(prof.wallet).toBeNull();
    expect(prof.achievements.find((a) => a.id === "damage-1")).toMatchObject({ done: true, claimed: true });
    expect(prof.room).toMatchObject({ id: "basic" });
  });

  it("new achievements: the money collected, a clan created and left", async () => {
    const p = await newPlayer(db);
    const ach = async (id: string) => (await profileView(db, p, p, await loadConfig(db), T0)).achievements.find((a) => a.id === id);
    await db.query("INSERT INTO ledger (player_id, kind, key, delta, reason) VALUES ($1,'currency','GOLD',3,'test'), ($1,'currency','GOLD',-3,'test')", [p]);
    expect(await ach("earn-gold-1")).toMatchObject({ progress: 2, done: true });
    expect(await ach("earn-gold-2")).toMatchObject({ progress: 3, done: false });
    await act(db, p, "clan_create", { name: "Бета", tag: "BET", emblem: "skull", color: "#ff4d6d" }, T0);
    expect(await ach("clan-create")).toMatchObject({ done: true });
    expect(await ach("clan-leave")).toMatchObject({ done: false });
    await act(db, p, "clan_leave", {}, T0);
    expect(await achGot(db, p, "clan-leave")).toBe(true);
  });

  it("«за сутки» in the profile: money, weapons, authority and damage gained in the last 24 hours", async () => {
    const p = await newPlayer(db);
    const viewer = await newPlayer(db);
    await give(db, p, "keyboard", 3);
    await act(db, p, "fight_start", { boss: "datsik" }, T0);
    await act(db, p, "attack", { weapon: "keyboard" }, T0, always(0.99));
    await give(db, p, "part-nails", 1);
    await act(db, p, "sell", { itemId: "part-nails", qty: 1 }, T0);
    const mine = await profileView(db, p, p, await loadConfig(db), T0);
    expect(mine.day.PAP).toBe(50);
    expect(mine.day.damage).toBeGreaterThan(0);
    // a day later it is gone
    expect((await profileView(db, p, p, await loadConfig(db), T0 + 25 * 3_600_000)).day).toEqual({});
    // someone else sees no money or energy of his
    const other = await profileView(db, viewer, p, await loadConfig(db), T0);
    expect(Object.keys(other.day).some((k) => ["RUB", "PAP", "keyboard"].includes(k))).toBe(false);
    expect(other.arsenal).toEqual([]);
    // weapons: only what came in counts (spent on the hit — not), and each has its hit and its day's growth
    expect(mine.day.keyboard).toBeUndefined();
    const kb = mine.arsenal.find((w: { id: string }) => w.id === "keyboard")!;
    expect(kb.dmg).toBeGreaterThan(0);
    expect(kb.dmgDay).toBe(0);
  });

  it("clan settings: only the leader edits name, emblem, colour and description", async () => {
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    await act(db, a, "clan_create", { name: "Альфа", tag: "ALF", emblem: "skull", color: "#ff4d6d" }, T0);
    const [{ clan_id }] = await db.query<{ clan_id: number }>("SELECT clan_id FROM players WHERE id=$1", [a]);
    await act(db, b, "clan_join", { clanId: clan_id }, T0);
    await act(db, a, "clan_accept", { playerId: b }, T0);
    await expect(act(db, b, "clan_edit", { name: "Бета", emblem: "moon", color: "#3ddc84", description: "x" }, T0)).rejects.toMatchObject({ code: "not_leader" });
    await act(db, a, "clan_edit", { name: "Бета", emblem: "moon", color: "#3ddc84", description: "Бьём боссов по вечерам" }, T0);
    const [c] = await db.query<{ name: string; emblem: string; description: string }>("SELECT name, emblem, description FROM clans WHERE id=$1", [clan_id]);
    expect(c).toEqual({ name: "Бета", emblem: "moon", description: "Бьём боссов по вечерам" });
  });

  it("the best login streak is remembered after the streak breaks", async () => {
    const p = await newPlayer(db);
    for (let i = 0; i < 3; i++) await act(db, p, "daily_claim", {}, T0 + i * D);
    await act(db, p, "daily_claim", {}, T0 + 6 * D);
    const [d] = await db.query<{ streak: number; best_streak: number }>("SELECT streak, best_streak FROM daily_login WHERE player_id=$1", [p]);
    expect(d).toMatchObject({ streak: 1, best_streak: 3 });
  });
});

describe("clan level", () => {
  it("clan level from the clan's own experience (only «Захват»): 1 500 000 × n / 38 from n to n+1, up to level 50", async () => {
    const { clanLevelInfo, clanLevelAt } = await import("../src/content/clans.ts");
    expect(clanLevelInfo(0).level).toBe(1);
    // the step from n to n+1 is 1 500 000 × n / 38
    expect(clanLevelAt(2)).toBe(39_474);
    expect(clanLevelAt(3) - clanLevelAt(2)).toBe(78_947);
    expect(clanLevelAt(39) - clanLevelAt(38)).toBe(1_500_000);
    expect(clanLevelInfo(clanLevelAt(10) - 1).level).toBe(9);
    // the top is level 50
    expect(clanLevelInfo(1e12)).toMatchObject({ level: 50, max: true });
    for (let x = 1; x < clanLevelAt(50); x *= 1.7) { const l = clanLevelInfo(x); expect(x).toBeGreaterThanOrEqual(l.from); expect(x).toBeLessThan(l.to); }
  });

});
