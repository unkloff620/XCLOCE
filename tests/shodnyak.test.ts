import { describe, expect, it } from "vitest";
import { settleWeeks } from "../src/server/systems/rating.ts";
import { act, freshDb, newPlayer, setMoney, wallet } from "./helpers.ts";
import type { Db } from "../src/server/db.ts";
import { SHOD_PRIZES } from "../src/content/shodnyak.ts";

const T = Date.UTC(2026, 10, 18, 12); // Wednesday
const NEXT = Date.UTC(2026, 10, 23, 12); // next Monday
async function clanPlayer(db: Db, name: string) {
  const p = await newPlayer(db);
  const [c] = await db.query<{ id: number }>("INSERT INTO clans (name, tag, emblem, color, leader_id) VALUES ($1, $1, 'skull', '#f00', $2) RETURNING id", [name, p]);
  await db.query("INSERT INTO clan_members (player_id, clan_id, role) VALUES ($1,$2,'leader')", [p, c.id]);
  await db.query("UPDATE players SET clan_id=$2 WHERE id=$1", [p, c.id]);
  return { p, clan: Number(c.id) };
}

describe("«Сходняк»", () => {
  it("3 free slots, more for gold bars; damage fills the task; Monday the top clan gets the prize and the boost", async () => {
    const db = await freshDb();
    const a = await clanPlayer(db, "Альфа");
    const b = await clanPlayer(db, "Бета");
    for (const id of ["dmg-10000", "dmg-50000", "kill-datsik"]) await act(db, a.p, "shod_take", { id }, T);
    await expect(act(db, a.p, "shod_take", { id: "dmg-100000" }, T)).rejects.toMatchObject({ code: "shod_full" });
    await expect(act(db, a.p, "shod_slot", {}, T)).rejects.toMatchObject({ code: "no_money" });
    await setMoney(db, a.p, "GOLD", 4);
    const v = await act(db, a.p, "shod_slot", {}, T);
    expect(v.result.slots).toBe(4);
    expect(await wallet(db, a.p, "GOLD")).toBe(0);
    await act(db, a.p, "shod_take", { id: "dmg-100000" }, T);
    await act(db, b.p, "shod_take", { id: "dmg-10000" }, T);
    // hits: Альфа deals 60k (two damage tasks done), Бета 10k
    const { shodTick } = await import("../src/server/systems/shodnyak.ts");
    await shodTick({ q: db, pid: a.p, now: T } as never, "damage", 60_000);
    await shodTick({ q: db, pid: b.p, now: T } as never, "damage", 10_000);
    const [pa] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM shod_tasks WHERE player_id=$1 AND done_at IS NOT NULL", [a.p]);
    expect(Number(pa.n)).toBe(2);
    await settleWeeks(db, NEXT);
    const prizes = await db.query<{ player_id: number; title: string; reward: { xp: number; items?: { id: string }[] } }>("SELECT player_id, title, reward FROM prizes WHERE title LIKE 'Сходняк%' ORDER BY player_id");
    expect(prizes.find((x) => Number(x.player_id) === a.p)!.title).toContain("1 место");
    expect(prizes.find((x) => Number(x.player_id) === a.p)!.reward.xp).toBe(SHOD_PRIZES[0].xp);
    expect(prizes.find((x) => Number(x.player_id) === b.p)!.title).toContain("2 место");
    // tattoos of the «Сходняк» sets: 3 for the 1st place, 2 for the 2nd
    expect(prizes.find((x) => Number(x.player_id) === a.p)!.reward.items!.filter((i) => i.id.startsWith("tat-shod-"))).toHaveLength(3);
    expect(prizes.find((x) => Number(x.player_id) === b.p)!.reward.items).toHaveLength(2);
    // the 1st place picks the boost
    const r = await act(db, a.p, "shod_boost", { weapon: "gpu" }, NEXT);
    expect(r.result.boost.weapon).toBe("gpu");
    await expect(act(db, b.p, "shod_boost", { weapon: "gpu" }, NEXT)).rejects.toMatchObject({ code: "shod_no_boost" });
  });

  it("authority, roubles (not an exchange), a location passed and a win in its mode fill their tasks", async () => {
    const db = await freshDb();
    const a = await clanPlayer(db, "Гамма");
    await setMoney(db, a.p, "GOLD", 20);
    await act(db, a.p, "shod_slot", {}, T);
    for (const id of ["xp-5000", "rub-5000", "loc-5", "kill-kedr-blat"]) await act(db, a.p, "shod_take", { id }, T);
    const { grantReward, addMoney } = await import("../src/server/core.ts");
    const { shodTick } = await import("../src/server/systems/shodnyak.ts");
    const { loadConfig } = await import("../src/server/config.ts");
    const ctx = { q: db, pid: a.p, now: T, cfg: await loadConfig(db), rng: Math.random } as never;
    await grantReward(ctx, { xp: 6_000 }, "test");
    await addMoney(ctx, "RUB", 9_000, "exchange:TOKEN");
    await addMoney(ctx, "RUB", 4_000, "sell:keyboard");
    for (let i = 0; i < 5; i++) await shodTick(ctx, "location", 1);
    await shodTick(ctx, "kill", 1, { boss: "kedr", mode: "pacan" });
    const rows = await db.query<{ task_id: string; progress: number; done_at: Date | null }>("SELECT task_id, progress, done_at FROM shod_tasks WHERE player_id=$1", [a.p]);
    const by = Object.fromEntries(rows.map((r) => [r.task_id, r]));
    expect(by["xp-5000"].done_at).not.toBeNull();
    expect(Number(by["rub-5000"].progress)).toBe(4_000);
    expect(by["rub-5000"].done_at).toBeNull();
    expect(by["loc-5"].done_at).not.toBeNull();
    expect(by["kill-kedr-blat"].done_at).toBeNull();
    await shodTick(ctx, "kill", 1, { boss: "kedr", mode: "blat" });
    const [k] = await db.query<{ done_at: Date | null }>("SELECT done_at FROM shod_tasks WHERE player_id=$1 AND task_id='kill-kedr-blat'", [a.p]);
    expect(k.done_at).not.toBeNull();
  });
});
