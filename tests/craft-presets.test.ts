import { describe, expect, it } from "vitest";
import { act, freshDb, give, newPlayer, qty } from "./helpers.ts";
import { CRAFT_ALL } from "../src/content/craft.ts";

describe("«Крафт» presets", () => {
  it("save the stash, switch to another layout and back; things missing leave their cells empty", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await db.query("UPDATE players SET craft_boxes=4 WHERE id=$1", [p]);
    const [a, b] = CRAFT_ALL;
    await give(db, p, a.id, 2);
    await give(db, p, b.id, 1);
    const put = await act(db, p, "craft_put", { itemId: a.id });
    const s1 = await act(db, p, "craft_preset_save", { name: "  Урон  " });
    expect(s1.result.name).toBe("Урон");
    expect(s1.state.craftPresets).toHaveLength(1);
    await act(db, p, "craft_take", { slot: put.result.slot });
    await act(db, p, "craft_put", { itemId: b.id });
    const s2 = await act(db, p, "craft_preset_save", { name: "Другой" });
    const back = await act(db, p, "craft_preset_apply", { id: s1.result.id });
    expect(back.result.missing).toBe(0);
    expect(back.state.craftBoxes).toContain(a.id);
    expect(back.state.craftBoxes).not.toContain(b.id);
    expect(await qty(db, p, b.id)).toBe(1);
    expect(await qty(db, p, a.id)).toBe(1);
    await act(db, p, "craft_preset_delete", { id: s2.result.id });
    const left = await act(db, p, "craft_preset_save", { name: "x", id: s1.result.id });
    expect(left.state.craftPresets.map((x: { name: string }) => x.name)).toEqual(["x"]);
  });
});

describe("«Крафт» cells", () => {
  it("a thing dropped onto a taken cell replaces it; the old one goes back to the store", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await db.query("UPDATE players SET craft_boxes=2 WHERE id=$1", [p]);
    const [a, b] = CRAFT_ALL;
    await give(db, p, a.id, 1);
    await give(db, p, b.id, 1);
    await act(db, p, "craft_put", { itemId: a.id, slot: 0 });
    const r = await act(db, p, "craft_put", { itemId: b.id, slot: 0 });
    expect(r.state.craftBoxes[0]).toBe(b.id);
    expect(await qty(db, p, a.id)).toBe(1);
    expect(await qty(db, p, b.id)).toBe(0);
  });
});

describe("admin: chairs", () => {
  it("gives any chair outright and takes it back", async () => {
    const { edit } = await import("../src/server/admin.ts");
    const db = await freshDb();
    const p = await newPlayer(db);
    await edit(db, 1, p, { op: "give_piece", equipment: "chair", piece: 13 }); // Кресло Вадима
    const [r] = await db.query<{ pieces: number }>("SELECT pieces FROM player_equipment WHERE player_id=$1 AND equipment_id='chair'", [p]);
    expect((Number(r.pieces) >> 12) & 1).toBe(1);
    await edit(db, 1, p, { op: "give_piece", equipment: "chair", piece: 13, own: false });
    const [r2] = await db.query<{ pieces: number }>("SELECT pieces FROM player_equipment WHERE player_id=$1 AND equipment_id='chair'", [p]);
    expect(Number(r2.pieces)).toBe(0);
  });
});
