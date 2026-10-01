import { describe, expect, it } from "vitest";
import { applyChain } from "../src/server/bossChain.ts";
import { bossMarketCap } from "../src/shared/economy.ts";

describe("applyChain (pure)", () => {
  it("applies damage to the current boss", () => {
    const r = applyChain({ bossIndex: 1, damageTaken: 500, personalOnBoss: 0 }, 100, 100);
    expect(r.state).toEqual({ bossIndex: 1, damageTaken: 600, personalOnBoss: 100 });
    expect(r.defeats).toHaveLength(0);
    expect(r.applied).toBe(100);
  });

  it("carries overkill to the next boss", () => {
    const m1 = bossMarketCap(1);
    const r = applyChain({ bossIndex: 1, damageTaken: m1 - 50, personalOnBoss: 0 }, 200, 0);
    expect(r.defeats.map((d) => d.index)).toEqual([1]);
    expect(r.state.bossIndex).toBe(2);
    expect(r.state.damageTaken).toBe(150);
  });

  it("passes through several weak bosses in one event", () => {
    const total = bossMarketCap(1) + bossMarketCap(2) + bossMarketCap(3) + 123;
    const r = applyChain({ bossIndex: 1, damageTaken: 0, personalOnBoss: 0 }, total, 0);
    expect(r.defeats.map((d) => d.index)).toEqual([1, 2, 3]);
    expect(r.state).toMatchObject({ bossIndex: 4, damageTaken: 123 });
  });

  it("never produces negative market cap and stops at the safety cap without losing damage", () => {
    const r = applyChain({ bossIndex: 1, damageTaken: 0, personalOnBoss: 0 }, 1e9, 0, 3, () => 10);
    expect(r.defeats).toHaveLength(3);
    expect(r.applied).toBe(30);
    expect(r.state.damageTaken).toBe(0);
  });

  it("attributes personal damage first and keeps it per boss", () => {
    const r = applyChain({ bossIndex: 1, damageTaken: 0, personalOnBoss: 0 }, 1500, 1200, 200, () => 1000);
    expect(r.defeats[0].personalDamage).toBe(1000);
    expect(r.state.personalOnBoss).toBe(200);
    expect(r.personalApplied).toBe(1200);
  });

  it("ignores invalid amounts", () => {
    expect(applyChain({ bossIndex: 2, damageTaken: 5, personalOnBoss: 0 }, NaN).applied).toBe(0);
    expect(applyChain({ bossIndex: 2, damageTaken: 5, personalOnBoss: 0 }, -10).applied).toBe(0);
  });
});
