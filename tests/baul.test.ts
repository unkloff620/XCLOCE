import { describe, it, expect } from "vitest";
import { act, always, freshDb, newPlayer, setMoney, wallet } from "./helpers.ts";
import { baulLevel, baulPoints, baulTattooChance, rollBaulPack, BAUL_TOTAL } from "../src/content/baul.ts";
import { baulTick } from "../src/server/systems/baul.ts";
import { makeCtx } from "../src/server/game.ts";

describe("«Баул»", () => {
  it("the points: the boss's HP without five zeros, at least 1; the levels by the user's table", () => {
    expect(baulPoints(1_000)).toBe(1);
    expect(baulPoints(150_000)).toBe(2);
    expect(baulPoints(1_000_000_000)).toBe(10_000);
    expect(baulLevel(49).level).toBe(0);
    expect(baulLevel(50).level).toBe(1);
    expect(baulLevel(338_375).level).toBe(30);
    expect(BAUL_TOTAL[25]).toBe(176_375);
    expect(baulTattooChance(1)).toBeLessThan(0.001);
    expect(baulTattooChance(25)).toBeCloseTo(0.42);
    expect(baulTattooChance(23)).toBeGreaterThan(0.25);
  });

  it("the pack grows with the level; keys from Князь's on", () => {
    const lo = rollBaulPack(1, always(0.5)), hi = rollBaulPack(25, always(0.5));
    expect(Object.keys(hi.currencies ?? {}).length + (hi.items?.length ?? 0)).toBeGreaterThan(Object.keys(lo.currencies ?? {}).length + (lo.items?.length ?? 0));
    expect(rollBaulPack(30, always(0.1)).items?.some((i) => i.id.startsWith("key-"))).toBe(true);
    expect(rollBaulPack(3, always(0.1)).items?.some((i) => i.id.startsWith("key-"))).toBeFalsy();
  });

  it("a win gives points and a free opening per level; then an opening costs 20 слитков", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await expect(act(db, p, "baul_open")).rejects.toMatchObject({ code: "baul_locked" });
    await db.tx(async (q) => { const ctx = await makeCtx(q, p, {}); expect(await baulTick(ctx, 15_000_000)).toMatchObject({ points: 150, level: 2, up: 2 }); });
    await setMoney(db, p, "GOLD", 30);
    await act(db, p, "baul_open");
    await act(db, p, "baul_open");
    expect(await wallet(db, p, "GOLD")).toBe(30);
    const r = await act(db, p, "baul_open");
    expect(await wallet(db, p, "GOLD")).toBe(10);
    expect(r.result.level).toBe(2);
    await expect(act(db, p, "baul_open")).rejects.toMatchObject({ code: "no_money" });
  });
});
