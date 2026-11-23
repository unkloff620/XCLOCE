import { describe, expect, it } from "vitest";
import { clanEvents } from "../src/server/systems/raids.ts";
import { act, freshDb, give, newPlayer, qty, wallet } from "./helpers.ts";
import { resetConfigCache } from "../src/server/config.ts";
import type { Db } from "../src/server/db.ts";
import { RAID_YARDS, buildingReward, buildingTake, yardReward } from "../src/content/raids.ts";

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

async function rival(db: Db) {
  const q = await newPlayer(db);
  const [c] = await db.query<{ id: number }>("INSERT INTO clans (name, tag, emblem, color, leader_id) VALUES ('Враги', 'ENM', 'skull', '#0f0', $1) RETURNING id", [q]);
  await db.query("INSERT INTO clan_members (player_id, clan_id, role, joined_at) VALUES ($1,$2,'leader',$3)", [q, c.id, new Date(T - 2 * 3_600_000)]);
  await give(db, q, "rug-pull-gun", 5000);
  return { q, clan2: Number(c.id) };
}
const win = async (db: Db, p: number, building: string, at: number, mode: "active" | "cut" = "active") => {
  await act(db, p, "raid_start", { building, mode }, at);
  let h = await act(db, p, "raid_attack", { weapon: "rug-pull-gun", count: 1000 }, at);
  while (h.result.status !== "won") h = await act(db, p, "raid_attack", { weapon: "rug-pull-gun", count: 1000 }, at);
  return h;
};

describe("«Лагеря»", () => {
  it("the leader picks the camp; the КПП is ours; the route goes up; a win pays and counts for the clan", async () => {
    const db = await freshDb();
    const { p, clan } = await setup(db);
    await db.query("UPDATE clan_members SET joined_at=$2 WHERE player_id=$1", [p, new Date(T - 2 * 3_600_000)]);
    await expect(act(db, p, "raid_start", { building: yard.buildings[1].id }, T)).rejects.toMatchObject({ code: "not_camp" });
    // the second camp opens with the 3rd level
    await expect(act(db, p, "raid_camp", { yard: RAID_YARDS[1].id }, T)).rejects.toMatchObject({ code: "yard_closed" });
    const v = await act(db, p, "raid_camp", { yard: yard.id }, T);
    expect(v.result.yards[0].target).toBe(yard.buildings[1].id);
    expect(v.result.yards[0].buildings[0].taken).toBe(true);
    await expect(act(db, p, "raid_start", { building: yard.buildings[2].id }, T)).rejects.toMatchObject({ code: "not_target" });
    // nobody holds it: nobody to cut
    await expect(act(db, p, "raid_start", { building: yard.buildings[1].id, mode: "cut" }, T)).rejects.toMatchObject({ code: "bad_mode" });
    const rub = await wallet(db, p, "RUB");
    const h = await win(db, p, yard.buildings[1].id, T);
    expect(await wallet(db, p, "RUB")).toBe(rub + buildingReward(1, yard.buildings[1]).rub);
    expect(h.result.talentsGained).toBeGreaterThan(0);
    const [pr] = await db.query<{ wins: number }>("SELECT wins FROM raid_progress WHERE clan_id=$1 AND building_id=$2", [clan, yard.buildings[1].id]);
    expect(Number(pr.wins)).toBe(1);
  });

  it("enough wins take the building; the leader collects the medal (experience, influence, armbands); barricades; a rival retakes an unfortified one", async () => {
    const db = await freshDb();
    const { p, clan } = await setup(db);
    await db.query("UPDATE clan_members SET joined_at=$2 WHERE player_id=$1", [p, new Date(T - 2 * 3_600_000)]);
    const b1 = yard.buildings[1];
    await act(db, p, "raid_camp", { yard: yard.id }, T);
    await db.query("INSERT INTO raid_progress (clan_id, building_id, wins, started_at) VALUES ($1,$2,9,$3)", [clan, b1.id, new Date(T - 1000)]);
    const h = await win(db, p, b1.id, T);
    expect(h.result).toMatchObject({ buildingTaken: true, yardTaken: false });
    const claim = h.result.view.claims[0];
    expect(claim.building).toBe(b1.id);
    const t = buildingTake(1, b1);
    const c = await act(db, p, "raid_claim", { claim: claim.id }, T);
    expect(c.result).toMatchObject({ clanXp: t.clanXp, influence: t.influence, armbands: t.flags });
    expect(await qty(db, p, "raid-flag-1")).toBe(t.flags);
    await expect(act(db, p, "raid_claim", { claim: claim.id }, T)).rejects.toMatchObject({ code: "claim_none" });
    // a barricade: free bags (3 a day), defense and the clan's experience
    const f = await act(db, p, "raid_fort", { building: b1.id, kind: "bags" }, T);
    expect(f.result.defense).toBe(100);
    // the rival: shielded 4 hours, then «Атаковать актив» takes it back — we lose 2% of influence and get rebar
    const { q, clan2 } = await rival(db);
    await act(db, q, "raid_camp", { yard: yard.id }, T);
    expect((await act(db, q, "raid_flee", {}, T)).result.yards[0].target).toBe(yard.buildings[2].id);
    const later = T + 5 * 3_600_000;
    await db.query("INSERT INTO raid_progress (clan_id, building_id, wins, started_at) VALUES ($1,$2,9,$3)", [clan2, b1.id, new Date(later - 1000)]);
    const r = await win(db, q, b1.id, later);
    expect(r.result.buildingTaken).toBe(true);
    const [inf] = await db.query<{ influence: number }>("SELECT influence FROM raid_influence WHERE clan_id=$1 AND yard_id=$2", [clan, yard.id]);
    expect(Number(inf.influence)).toBe(t.influence - Math.floor(t.influence * 0.02));
    const [cl] = await db.query<{ rebar: number }>("SELECT rebar FROM clans WHERE id=$1", [clan]);
    expect(Number(cl.rebar)).toBe(20);
    const ev = await clanEvents(db, clan);
    expect(ev.events.map((e) => e.kind)).toContain("lost");
  });

  it("the main building taken — the whole camp: its bonus waits for the leader too", async () => {
    const db = await freshDb();
    const { p, clan } = await setup(db);
    await act(db, p, "raid_camp", { yard: yard.id }, T);
    const main = yard.buildings[yard.buildings.length - 1];
    for (const b of yard.buildings.slice(1, -1)) await db.query("INSERT INTO raid_holds (building_id, yard_id, clan_id, taken_at) VALUES ($1,$2,$3,$4)", [b.id, yard.id, clan, new Date(T)]);
    await db.query("INSERT INTO raid_progress (clan_id, building_id, wins) VALUES ($1,$2,9)", [clan, main.id]);
    const h = await win(db, p, main.id, T);
    expect(h.result).toMatchObject({ buildingTaken: true, yardTaken: true });
    expect(h.result.view.claims.map((c: { whole: boolean }) => c.whole)).toEqual([false, true]);
    expect(h.result.view.yards[0].done).toBe(true);
    expect(yardReward(1).clanXp).toBeGreaterThan(0);
  });
  it("a bag for its yard's flags (20 for yard №1) gives a piece of its set not owned yet", async () => {
    const db = await freshDb();
    const { p } = await setup(db);
    await expect(act(db, p, "raid_bag", { n: 1 }, T)).rejects.toMatchObject({ code: "raid_no_flags" });
    await db.query("INSERT INTO inventory (player_id, item_id, qty) VALUES ($1,'raid-flag-1',40)", [p]);
    const a = await act(db, p, "raid_bag", { n: 1 }, T);
    const b = await act(db, p, "raid_bag", { n: 1 }, T);
    expect(a.result.tattoo).toMatch(/^tat-garages-/);
    expect(b.result.tattoo).not.toBe(a.result.tattoo);
    expect(await qty(db, p, "raid-flag-1")).toBe(0);
    expect(b.result.bags[0]).toEqual({ have: 2, of: 21 });
  });
});
