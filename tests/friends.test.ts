import { describe, expect, it } from "vitest";
import { act, freshDb, newPlayer } from "./helpers.ts";

describe("friends", () => {
  it("a request from his room waits in his messages; he takes it — both see each other in the strip", async () => {
    const db = await freshDb();
    const a = await newPlayer(db), b = await newPlayer(db), c = await newPlayer(db);
    await expect(act(db, a, "friend_add", { to: a })).rejects.toMatchObject({ code: "friend_self" });
    expect((await act(db, a, "friend_add", { to: b })).result).toMatchObject({ state: "sent" });
    await expect(act(db, a, "friend_add", { to: b })).rejects.toMatchObject({ code: "friend_sent" });
    const st = await act(db, b, "notes_read", {});
    expect(st.state.friendRequests).toHaveLength(1);
    expect(st.state.friendRequests[0]).toMatchObject({ id: a, talents: 0, achievements: 0 });
    expect((await act(db, b, "friend_answer", { from: a, yes: true })).result).toMatchObject({ state: "friends" });
    const { friendsStrip, friendState } = await import("../src/server/systems/friends.ts");
    expect((await friendsStrip(db, a, Date.now())).friends.map((r) => r.id).sort()).toEqual([a, b].sort());
    expect(await friendState(db, b, a)).toBe("friends");
    // his own request to me: my [+] makes us friends at once; a turned-down one is gone
    await act(db, c, "friend_add", { to: a });
    expect((await act(db, a, "friend_add", { to: c })).result).toMatchObject({ state: "friends" });
    await act(db, a, "friend_remove", { id: c });
    expect(await friendState(db, a, c)).toBe("none");
    await act(db, c, "friend_add", { to: b });
    await act(db, b, "friend_answer", { from: c, yes: false });
    expect(await friendState(db, b, c)).toBe("none");
  });
});

describe("«Урон» achievements: the damage of one fight", () => {
  it("reached in a fight stays reached; a fight that ends short of the next mark burns", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    const { achievementsView } = await import("../src/server/systems/achievements.ts");
    const { loadConfig } = await import("../src/server/config.ts");
    const cfg = await loadConfig(db);
    // an old fight of 1 200 (the 1 000 mark reached for good), and some damage summed over many fights does not count
    await db.query("INSERT INTO fights (player_id, boss_id, status, my_damage, hp_max, start_total, start_seq, started_at, ends_at, day) VALUES ($1,'datsik','lost',1200,1000,0,0,now(),now(),'2026-11-01')", [p]);
    await db.query("UPDATE player_stats SET total_damage=99999999 WHERE player_id=$1", [p]);
    let v = await achievementsView(db, p, cfg);
    expect(v.find((a) => a.id === "damage-1")).toMatchObject({ done: true });
    const second = v.find((a) => a.id === "damage-2")!;
    expect(second.done).toBe(false);
    expect(second.progress).toBe(0);
    // a fight going on: the bar shows its damage
    await db.query("INSERT INTO fights (player_id, boss_id, status, my_damage, hp_max, start_total, start_seq, started_at, ends_at, day) VALUES ($1,'datsik','active',700,1000,0,0,now(),now() + interval '1 hour','2026-11-02')", [p]);
    v = await achievementsView(db, p, cfg);
    expect(v.find((a) => a.id === "damage-2")!.progress).toBe(700);
    // it ends: the progress burns
    await db.query("UPDATE fights SET status='lost' WHERE player_id=$1 AND status='active'", [p]);
    v = await achievementsView(db, p, cfg);
    expect(v.find((a) => a.id === "damage-2")!.progress).toBe(0);
  });
});
