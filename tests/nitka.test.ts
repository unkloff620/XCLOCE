import { describe, it, expect } from "vitest";
import { act, freshDb, newPlayer } from "./helpers.ts";

describe("the mentor Нитка", () => {
  it("opens after a night run of «Опенспейс»; every mode, no «Соло»; 1 000 000 HP", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await expect(act(db, p, "fight_start", { boss: "nitka", mode: "blat" })).rejects.toMatchObject({ code: "boss_road" });
    // a day run does not count
    await db.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1,'openspace',now())", [p]);
    await expect(act(db, p, "fight_start", { boss: "nitka" })).rejects.toMatchObject({ code: "boss_road" });
    await db.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1,'night:openspace',now())", [p]);
    await expect(act(db, p, "fight_start", { boss: "nitka", solo: true })).rejects.toMatchObject({ code: "bad_mode" });
    const r = await act(db, p, "fight_start", { boss: "nitka", mode: "avtor" });
    expect(r.result).toMatchObject({ bossId: "nitka", mode: "avtor", hpMax: 6_000_000 });
    // no passes of Солнце spent
    const [f] = await db.query<{ keys_spent: number }>("SELECT keys_spent FROM fights WHERE id=$1", [r.result.fightId]);
    expect(Number(f.keys_spent)).toBe(0);
  });
});
