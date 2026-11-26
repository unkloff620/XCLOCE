import { describe, it, expect } from "vitest";
import { act, freshDb, newPlayer, setMoney, wallet } from "./helpers.ts";
import { BANDIT_RTP, banditPay, banditSpin, type BanditCell } from "../src/content/bandit.ts";

const lcg = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

describe("«Бандитский фарт»", () => {
  it("gives back about BANDIT_RTP of the bets over many spins (free spins included)", () => {
    const rng = lcg(7);
    let paid = 0, won = 0;
    for (let i = 0; i < 300_000; i++) {
      paid += 1;
      const s = banditSpin(1, rng);
      won += s.raw;
      let fs = s.free;
      while (fs > 0) { fs--; const f = banditSpin(1, rng, true); won += f.raw; fs += f.free; }
    }
    expect(won / paid).toBeGreaterThan(BANDIT_RTP - 0.06);
    expect(won / paid).toBeLessThan(BANDIT_RTP + 0.06);
  });

  it("pays by ways from the left; a wild reel stands in and its multiplier multiplies the whole win", () => {
    const col = (...c: BanditCell[]) => c;
    const reels = [col("money", "a", "q", "j"), col("money", "money", "k", "ten"), col("money", "dice", "q", "j"), col("a", "k", "q", "j"), col("a", "k", "q", "j")];
    const plain = banditPay(reels, {}, 10);
    const money = plain.wins.find((w) => w.sym === "money")!;
    expect(money).toMatchObject({ n: 3, ways: 2 });
    const wild = banditPay([reels[0], reels[1], Array(4).fill("W"), reels[3], reels[4]], { 2: 5 }, 10);
    expect(wild.mult).toBe(5);
    expect(wild.wins.find((w) => w.sym === "money")).toMatchObject({ n: 3, ways: 8 });
    expect(wild.win).toBe(Math.floor(wild.wins.reduce((a, w) => a + w.pay, 0) * 5));
  });

  it("a spin takes the bet in roubles and pays the win; free spins cost nothing and keep their bet", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 100);
    await expect(act(db, p, "bandit_spin", { bet: 11 })).rejects.toMatchObject({ code: "bad_bet" });
    const r = await act(db, p, "bandit_spin", { bet: 10 });
    expect(r.result.paid).toBe(10);
    expect(await wallet(db, p, "RUB")).toBe(90 + r.result.win);
    await db.query("UPDATE bandit_state SET free=2, free_bet=7 WHERE player_id=$1", [p]);
    const before = await wallet(db, p, "RUB");
    const f = await act(db, p, "bandit_spin", { bet: 1 });
    expect(f.result).toMatchObject({ wasFree: true, bet: 7, paid: 0 });
    expect(await wallet(db, p, "RUB")).toBe(before + f.result.win);
    await setMoney(db, p, "RUB", 0);
    await db.query("UPDATE bandit_state SET free=0 WHERE player_id=$1", [p]);
    await expect(act(db, p, "bandit_spin", { bet: 1 })).rejects.toMatchObject({ code: "no_money" });
  });
});
