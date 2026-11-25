import { describe, it, expect } from "vitest";
import { freshDb, newPlayer, openRoads } from "./helpers.ts";
import { runAction } from "../src/server/game.ts";

describe("the load: a weapon hit", () => {
  it("comes back without the full state (the boss screen reads only the result)", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await openRoads(db, p);
    await runAction(db, p, "fight_start", { boss: "datsik" });
    const r = await runAction(db, p, "attack", { weapon: "fist", idem: "x1" });
    expect((r.result as { damage: number }).damage).toBeGreaterThan(0);
    expect(r.state).toBeNull();
    // the other actions still bring the state
    const s = await runAction(db, p, "help_seen", { topic: "yard" });
    expect(s.state).toBeTruthy();
  });
});
