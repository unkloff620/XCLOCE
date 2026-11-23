import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "../src/server/db.ts";
import { act, freshDb, newPlayer, qty, setMoney, wallet } from "./helpers.ts";
import { OBSHAK, obshakById } from "../src/content/obshak.ts";
import { obshakView } from "../src/server/systems/obshak.ts";
import { talentThreshold } from "../src/content/talents.ts";

let db: Db;
// 12:00 МСК
const T0 = Date.parse("2026-12-10T09:00:00Z");
const DAY = 24 * 3_600_000;
beforeEach(async () => { db = await freshDb(); });

describe("«Общак»", () => {
  it("the user's levels: prices in gold bars, the day's damage", () => {
    expect(OBSHAK.map((o) => [o.id, o.price, o.damage])).toEqual([
      ["pacan", 100, 3_000_000], ["blat", 200, 6_000_000], ["avtor", 500, 10_000_000], ["vor", 600, 20_000_000],
    ]);
  });

  it("buy, collect once a Moscow day, the needle takes what the boss can hold and keeps the rest; extend and switch", async () => {
    const p = await newPlayer(db);
    await expect(act(db, p, "obshak_claim", {}, T0)).rejects.toMatchObject({ code: "no_obshak" });
    await setMoney(db, p, "GOLD", 2000);
    await act(db, p, "obshak_buy", { level: "pacan" }, T0);
    expect(await wallet(db, p, "GOLD")).toBe(1900);
    let v = await obshakView(db, p, T0);
    expect(v).toMatchObject({ level: "pacan", ready: true, pool: 0 });
    expect(v.until).toBe(T0 + 30 * DAY);
    const kb = await qty(db, p, "keyboard");
    await act(db, p, "obshak_claim", {}, T0);
    expect(await qty(db, p, "keyboard")).toBe(kb + 10);
    await expect(act(db, p, "obshak_claim", {}, T0 + 1000)).rejects.toMatchObject({ code: "obshak_taken" });
    expect((await obshakView(db, p, T0)).pool).toBe(3_000_000);
    // the needle in a fight: as much as the boss has HP; the rest stays for the next one
    await act(db, p, "fight_start", { boss: "datsik" }, T0);
    const r = await act(db, p, "attack", { weapon: "needle" }, T0 + 2000);
    const hit = r.result as { damage: number; status: string; left: number };
    expect(hit.status).toBe("won");
    expect(hit.damage).toBeGreaterThan(0);
    expect(hit.left).toBe(3_000_000 - hit.damage);
    expect((await obshakView(db, p, T0 + 3000)).pool).toBe(3_000_000 - hit.damage);
    // the fund's damage is not the player's: no talents, no stats, no damage tops
    const [st] = await db.query<{ total_damage: number }>("SELECT total_damage FROM player_stats WHERE player_id=$1", [p]);
    expect(Number(st?.total_damage ?? 0)).toBe(0);
    const [bd] = await db.query<{ damage: number }>("SELECT damage FROM boss_damage WHERE player_id=$1", [p]);
    expect(Number(bd?.damage ?? 0)).toBe(0);
    // the next Moscow day: yesterday's stock is gone, the collecting is open again
    v = await obshakView(db, p, T0 + DAY);
    expect(v).toMatchObject({ ready: true, pool: 0 });
    // the same level again: +30 days to what is left
    await act(db, p, "obshak_buy", { level: "pacan" }, T0 + DAY);
    expect((await obshakView(db, p, T0 + DAY)).until).toBe(T0 + 60 * DAY);
    // another level: 30 days from now, collected at once at the new level
    await act(db, p, "obshak_claim", {}, T0 + DAY);
    await act(db, p, "obshak_buy", { level: "vor" }, T0 + DAY + 5000);
    v = await obshakView(db, p, T0 + DAY + 5000);
    expect(v).toMatchObject({ level: "vor", ready: true, pool: 0, until: T0 + DAY + 5000 + 30 * DAY });
    await act(db, p, "obshak_claim", {}, T0 + DAY + 6000);
    expect((await obshakView(db, p, T0 + DAY + 6000)).pool).toBe(obshakById("vor")!.damage);
  });

  it("without «Общак» the damage toward the next talent is lost when a fight ends; with it the progress stays", async () => {
    const td = async (p: number) => Number((await db.query<{ talent_damage: number }>("SELECT talent_damage FROM player_stats WHERE player_id=$1", [p]))[0].talent_damage);
    const setTd = (p: number, v: number) => db.query("UPDATE player_stats SET talent_damage=$2, total_damage=$2 WHERE player_id=$1", [p, v]);
    const total = async (p: number) => Number((await db.query<{ total_damage: number }>("SELECT total_damage FROM player_stats WHERE player_id=$1", [p]))[0].total_damage);
    // 40 damage: the 1st talent (30) and 10 toward the 2nd
    const a = await newPlayer(db);
    await act(db, a, "fight_start", { boss: "datsik" }, T0);
    await setTd(a, 40);
    await act(db, a, "fight_flee", {}, T0 + 1000);
    expect(await td(a)).toBe(talentThreshold(1));
    expect(await total(a)).toBe(40);
    const b = await newPlayer(db);
    await setMoney(db, b, "GOLD", 100);
    await act(db, b, "obshak_buy", { level: "pacan" }, T0);
    await act(db, b, "fight_start", { boss: "datsik" }, T0);
    await setTd(b, 40);
    await act(db, b, "fight_flee", {}, T0 + 1000);
    expect(await td(b)).toBe(40);
  });
});
