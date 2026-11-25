import { describe, it, expect } from "vitest";
import { act, freshDb, newPlayer } from "./helpers.ts";

describe("the mentor Нитка", () => {
  it("opens after a night run of «Опенспейс» and 3 passes of Пепе; every mode, no «Соло»; 1 000 000 HP", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await expect(act(db, p, "fight_start", { boss: "nitka", mode: "blat" })).rejects.toMatchObject({ code: "boss_road" });
    // a day run does not count
    await db.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1,'openspace',now())", [p]);
    await expect(act(db, p, "fight_start", { boss: "nitka" })).rejects.toMatchObject({ code: "boss_road" });
    await db.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1,'night:openspace',now())", [p]);
    await expect(act(db, p, "fight_start", { boss: "nitka", solo: true })).rejects.toMatchObject({ code: "bad_mode" });
    // the mentors are a class like the chain: Пепе's passes open him (3 of them, spent on the start)
    await expect(act(db, p, "fight_start", { boss: "nitka", mode: "avtor" })).rejects.toMatchObject({ code: "boss_locked" });
    await db.query("INSERT INTO inventory (player_id, item_id, qty) VALUES ($1,'key-pepe',4)", [p]);
    const r = await act(db, p, "fight_start", { boss: "nitka", mode: "avtor" });
    expect(r.result).toMatchObject({ bossId: "nitka", mode: "avtor", hpMax: 6_000_000 });
    const [f] = await db.query<{ keys_spent: number }>("SELECT keys_spent FROM fights WHERE id=$1", [r.result.fightId]);
    expect(Number(f.keys_spent)).toBe(3);
    const [k] = await db.query<{ qty: number }>("SELECT qty FROM inventory WHERE player_id=$1 AND item_id='key-pepe'", [p]);
    expect(Number(k.qty)).toBe(1);
  });
});
