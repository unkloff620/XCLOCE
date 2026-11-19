import { describe, it, expect } from "vitest";
import { act, always, freshDb, newPlayer, qty, setMoney, wallet } from "./helpers.ts";
import { VAN_RATES, vanDeal, vanWindow } from "../src/content/van.ts";

// Friday 2026-11-20 12:00 Moscow; Thursday the 19th
const FRI = Date.parse("2026-11-20T09:00:00Z");
const THU = Date.parse("2026-11-19T09:00:00Z");

describe("«Барыга на газели»", () => {
  it("stands Friday to Sunday; takes папиросы and зубы by turns, at a rate within its range", () => {
    expect(vanWindow(THU).open).toBe(false);
    expect(vanWindow(FRI).open).toBe(true);
    expect(vanWindow(Date.parse("2026-11-22T20:59:00Z")).open).toBe(true); // Sunday 23:59 Moscow
    expect(vanWindow(Date.parse("2026-11-22T21:00:00Z")).open).toBe(false); // Monday 0:00
    const a = vanDeal(FRI), b = vanDeal(FRI + 7 * 86_400_000);
    expect(new Set([a.takes, b.takes])).toEqual(new Set(["PAP", "TOOTH"]));
    for (const d of [a, b]) {
      const r = VAN_RATES[d.takes];
      expect(d.rates.RUB).toBeGreaterThanOrEqual(r.RUB[0]); expect(d.rates.RUB).toBeLessThanOrEqual(r.RUB[1]);
      expect(d.rates.TOKEN).toBeGreaterThanOrEqual(r.TOKEN[0]); expect(d.rates.TOKEN).toBeLessThanOrEqual(r.TOKEN[1]);
    }
  });

  it("exchanges the week's currency for roubles and tokens; packs once a visit; gone on Thursday", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    const { takes, rates } = vanDeal(FRI);
    await setMoney(db, p, takes, rates.RUB * 2 + rates.TOKEN * 3);
    const rub0 = await wallet(db, p, "RUB");
    await act(db, p, "van_exchange", { give: "RUB", qty: 2 }, FRI);
    await act(db, p, "van_exchange", { give: "TOKEN", qty: 3 }, FRI);
    expect(await wallet(db, p, takes)).toBe(0);
    expect(await wallet(db, p, "RUB")).toBe(rub0 + 2);
    expect(await wallet(db, p, "TOKEN")).toBe(3);
    await expect(act(db, p, "van_exchange", { give: "RUB", qty: 1 }, FRI)).rejects.toMatchObject({ code: "no_money" });
    // the free pack: once a visit
    const f = await act(db, p, "van_pack", { id: "free" }, FRI, always(0));
    expect(f.result.reward.currencies).toMatchObject({ RUB: 5, TOOTH: 1123, PAP: 1825, GOLD: 2, TOKEN: 8 });
    expect(await qty(db, p, "rug-pull-gun")).toBe(2);
    await expect(act(db, p, "van_pack", { id: "free" }, FRI)).rejects.toMatchObject({ code: "van_taken" });
    // a paid pack for roubles, with cases (achievement points)
    await setMoney(db, p, "RUB", 350);
    const a = await act(db, p, "van_pack", { id: "avtor" }, FRI, always(0));
    expect(a.result.reward.achPoints).toBe(50);
    expect(await qty(db, p, "poker-chip")).toBeGreaterThanOrEqual(1);
    expect(a.state.van.taken).toEqual(["free", "avtor"]);
    // next Friday: a new visit, the packs again
    await act(db, p, "van_pack", { id: "free" }, FRI + 7 * 86_400_000);
    await expect(act(db, p, "van_pack", { id: "free" }, THU)).rejects.toMatchObject({ code: "van_gone" });
  });
});
