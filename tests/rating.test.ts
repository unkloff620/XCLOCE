import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "../src/server/db.ts";
import { act, always, freshDb, give, H, newPlayer, wallet } from "./helpers.ts";
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
      await give(db, p, "red-candle", 5);
      await act(db, p, "fight_start", { boss: "datsik" }, T0);
    }
    await act(db, a, "attack", { weapon: "red-candle" }, T0, always(0.99));
    await act(db, b, "attack", { weapon: "red-candle" }, T0, always(0.99));
    await act(db, b, "attack", { weapon: "red-candle" }, T0, always(0.99));
    const v = await ratingView(db, a, await loadConfig(db), T0);
    expect(v.damage.map((r) => [r.id, r.value])).toEqual([[b, 100], [a, 50]]);
    expect(v.me.damage).toEqual({ value: 50, place: 2 });
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

    const usd = await wallet(db, ids[0], "USD");
    const c = await act(db, ids[0], "prize_claim", { id: s.state.prizes[0].id }, T0);
    expect(await wallet(db, ids[0], "USD")).toBe(usd + (WEEKLY_PRIZES[0].currencies?.USD ?? 0));
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

  it("the top-3 clans of the week: every member gets a prize", async () => {
    const prev = weekKey(T0 - 7 * D);
    const a = await newPlayer(db);
    const b = await newPlayer(db);
    await setMoneyAll(a);
    await act(db, a, "clan_create", { name: "Альфа", tag: "ALF", emblem: "skull", color: "#ff4d6d" }, T0 - 8 * D);
    const [{ clan_id }] = await db.query<{ clan_id: number }>("SELECT clan_id FROM players WHERE id=$1", [a]);
    await act(db, b, "clan_join", { clanId: clan_id }, T0 - 8 * D);
    await db.query("INSERT INTO weekly_stats (week, player_id, damage) VALUES ($1,$2,500)", [prev, a]);
    const r = await act(db, b, "equip", { itemId: "jeans" }, T0);
    expect(r.state.prizes.map((p: { title: string }) => p.title)).toEqual(["Клан «Альфа» — 1 место недели"]);
  });
});

async function setMoneyAll(pid: number) {
  for (const c of ["RUB", "USD", "SOL", "BTC"]) await db.query("UPDATE wallets SET amount=100000 WHERE player_id=$1 AND currency=$2", [pid, c]);
}

describe("achievements and someone's profile", () => {
  it("a badge is collected once, only when reached; the profile shows badges and the room", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "achievement_claim", { id: "first-blood" }, T0)).rejects.toMatchObject({ code: "achievement_not_done" });
    await act(db, p, "fight_start", { boss: "datsik" }, T0);
    const hit = await act(db, p, "attack", { weapon: "fist" }, T0, always(0.99));
    expect(hit.state.achievementsReady).toBe(1);
    const rub = await wallet(db, p, "RUB");
    const r = await act(db, p, "achievement_claim", { id: "first-blood" }, T0);
    expect(await wallet(db, p, "RUB")).toBe(rub + 200);
    expect(r.state.achievementsReady).toBe(0);
    await expect(act(db, p, "achievement_claim", { id: "first-blood" }, T0)).rejects.toMatchObject({ code: "achievement_taken" });

    const viewer = await newPlayer(db);
    const prof = await profileView(db, viewer, p, await loadConfig(db));
    expect(prof.self).toBe(false);
    expect(prof.wallet).toBeNull();
    expect(prof.achievements.find((a) => a.id === "first-blood")).toMatchObject({ done: true, claimed: true });
    expect(prof.room).toMatchObject({ id: "basic" });
  });

  it("the best login streak is remembered after the streak breaks", async () => {
    const p = await newPlayer(db);
    for (let i = 0; i < 3; i++) await act(db, p, "daily_claim", {}, T0 + i * D);
    await act(db, p, "daily_claim", {}, T0 + 6 * D);
    const [d] = await db.query<{ streak: number; best_streak: number }>("SELECT streak, best_streak FROM daily_login WHERE player_id=$1", [p]);
    expect(d).toMatchObject({ streak: 1, best_streak: 3 });
  });
});
