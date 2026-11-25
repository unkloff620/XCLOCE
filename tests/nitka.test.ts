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

describe("Фокус's passes stay (v2-141 undoes v2-140)", () => {
  it("gives back the Фокус passes moved to Утилизатор and takes those off", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    // as v2-140 left it: the 5 Фокус passes moved over (2 Утилизатор's he had before → 7), his Фокус row at 0
    await db.query("INSERT INTO ledger (player_id, kind, key, delta, reason, created_at) VALUES ($1,'item','key-fokus',6,'win','2026-01-01'),($1,'item','key-fokus',-1,'fight','2026-01-02')", [p]);
    await db.query("INSERT INTO inventory (player_id, item_id, qty) VALUES ($1,'key-fokus',0),($1,'key-utilizator',7)", [p]);
    const { MIGRATIONS } = await import("../src/server/migrations.ts");
    const { splitSql } = await import("../src/server/db.ts");
    for (const s of splitSql(MIGRATIONS.find((m) => m.id === "v2-141-fokus-keys-back")!.sql)) await db.query(s);
    const q = async (id: string) => Number((await db.query<{ qty: number }>("SELECT qty FROM inventory WHERE player_id=$1 AND item_id=$2", [p, id]))[0].qty);
    expect(await q("key-fokus")).toBe(5);
    expect(await q("key-utilizator")).toBe(2);
  });
});
