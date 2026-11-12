import { describe, expect, it } from "vitest";
import { act, freshDb, give, newPlayer, qty, wallet } from "./helpers.ts";
import { resetConfigCache } from "../src/server/config.ts";
import type { Db } from "../src/server/db.ts";
import { RAID_YARDS, buildingClanXp, buildingReward, yardReward } from "../src/content/raids.ts";

const T = Date.UTC(2026, 10, 10, 12);
async function setup(db: Db) {
  await db.query("INSERT INTO config (key, value) VALUES ('raids', '{\"on\": true}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
  resetConfigCache();
  const p = await newPlayer(db);
  const [c] = await db.query<{ id: number }>("INSERT INTO clans (name, tag, emblem, color, leader_id) VALUES ('Тест', 'TST', 'skull', '#f00', $1) RETURNING id", [p]);
  await db.query("INSERT INTO clan_members (player_id, clan_id, role) VALUES ($1,$2,'leader')", [p, c.id]);
  await give(db, p, "rug-pull-gun", 5000);
  return { p, clan: Number(c.id) };
}
const yard = RAID_YARDS[0];

describe("«Ходки»", () => {
  it("only the clan's current building; a fight is won with the weapons, the win pays and counts for the clan", async () => {
    const db = await freshDb();
    const { p, clan } = await setup(db);
    await expect(act(db, p, "raid_start", { building: yard.buildings[1].id }, T)).rejects.toMatchObject({ code: "not_target" });
    await expect(act(db, p, "raid_start", { building: RAID_YARDS[1].buildings[0].id }, T)).rejects.toMatchObject({ code: "yard_closed" });
    await act(db, p, "raid_start", { building: yard.buildings[0].id }, T);
    const rub = await wallet(db, p, "RUB");
    const h = await act(db, p, "raid_attack", { weapon: "rug-pull-gun", count: 1000 }, T);
    expect(h.result.status).toBe("won");
    expect(await wallet(db, p, "RUB")).toBe(rub + buildingReward(1, false).rub);
    // the raid damage counts for the talents like any boss damage
    expect(h.result.talentDamage).toBeGreaterThanOrEqual(h.result.damage);
    expect(h.result.talentsGained).toBeGreaterThan(0);
    const [pr] = await db.query<{ wins: number }>("SELECT wins FROM raid_progress WHERE clan_id=$1 AND building_id=$2", [clan, yard.buildings[0].id]);
    expect(Number(pr.wins)).toBe(1);
    // no boss fight while a raid fight runs
    await act(db, p, "raid_start", { building: yard.buildings[0].id }, T);
    await expect(act(db, p, "fight_start", { boss: "datsik" }, T)).rejects.toMatchObject({ code: "raid_running" });
  });

  it("enough wins take the building; all of the yard — the yard: authority and the flag to who fought there", async () => {
    const db = await freshDb();
    const { p, clan } = await setup(db);
    // everything but the main building is already taken, the main one is one win short
    for (const b of yard.buildings) await db.query("INSERT INTO raid_progress (clan_id, building_id, wins, taken_at) VALUES ($1,$2,$3,$4)", [clan, b.id, b.kind === "main" ? 19 : 10, b.kind === "main" ? null : new Date(T)]);
    const main = yard.buildings.find((b) => b.kind === "main")!;
    await act(db, p, "raid_start", { building: main.id }, T);
    let h = await act(db, p, "raid_attack", { weapon: "rug-pull-gun", count: 1000 }, T);
    while (h.result.status !== "won") h = await act(db, p, "raid_attack", { weapon: "rug-pull-gun", count: 1000 }, T);
    expect(h.result).toMatchObject({ buildingTaken: true, yardTaken: true });
    // the clan's authority: the main building (×2) and the yard, counted in its level
    expect(h.result.clanXp).toBe(buildingClanXp(1, true) + yardReward(1).clanXp);
    const [c] = await db.query<{ raid_xp: number }>("SELECT raid_xp FROM clans WHERE id=$1", [clan]);
    expect(Number(c.raid_xp)).toBe(h.result.clanXp);
    expect(await qty(db, p, "raid-flag-1")).toBe(1);
    const v = await act(db, p, "raid_flee", {}, T);
    expect(v.result.yards[1].open).toBe(true);
  });
});
