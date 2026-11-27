import { describe, it, expect } from "vitest";
import { act, freshDb, newPlayer, qty, setMoney, wallet } from "./helpers.ts";
import { BANDIT_RTP, ROULETTE_PAY, banditLevel, banditPay, banditSpin, type BanditCell } from "../src/content/bandit.ts";

const lcg = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

describe("«Бандитский фарт»", () => {
  it("gives back about BANDIT_RTP of the bets in red boxes over many spins (free spins included; the roulette pays blue ones)", () => {
    const rng = lcg(7);
    let paid = 0, won = 0;
    for (let i = 0; i < 1_000_000; i++) {
      paid += 1;
      const s = banditSpin(1, rng);
      won += s.raw;
      let fs = s.free;
      while (fs > 0) { fs--; const f = banditSpin(1, rng, true); won += f.raw; fs += f.free; }
    }
    expect(won / paid).toBeGreaterThan(BANDIT_RTP - 0.08);
    expect(won / paid).toBeLessThan(BANDIT_RTP + 0.08);
  });

  it("pays by the 3 rows from the left, a pair and more; a wild reel stands in and its multiplier multiplies the whole win; 3 revolvers — the roulette", () => {
    const col = (...c: BanditCell[]) => c;
    const reels = [col("money", "a", "q"), col("money", "k", "k"), col("money", "dice", "j"), col("a", "k", "q"), col("a", "k", "q")];
    const plain = banditPay(reels, {}, 10);
    expect(plain.wins).toEqual([{ sym: "money", n: 3, row: 0, pay: 470 }]);
    // a pair pays too
    const pair = banditPay([col("a", "j", "q"), col("a", "k", "k"), col("ten", "dice", "j"), col("q", "k", "q"), col("j", "k", "q")], {}, 1);
    expect(pair.wins).toEqual([{ sym: "a", n: 2, row: 0, pay: 1 }]);
    // the horseshoes give experience, no boxes
    const hs = banditPay([col("horseshoe", "a", "q"), col("horseshoe", "k", "k"), col("horseshoe", "dice", "j"), col("horseshoe", "q", "ten"), col("a", "j", "q")], {}, 3);
    expect(hs.xpGot).toBe(300);
    expect(hs.raw).toBe(0);
    const wild = banditPay([reels[0], reels[1], Array(3).fill("W"), reels[3], reels[4]], { 2: 5 }, 10);
    expect(wild.mult).toBe(5);
    expect(wild.wins.find((w) => w.row === 0)).toMatchObject({ sym: "money", n: 3 });
    expect(wild.raw).toBe(wild.wins.reduce((a, w) => a + w.pay, 0) * 5);
    const rev = banditPay([col("revolver", "a", "q"), col("k", "revolver", "k"), col("j", "dice", "j"), col("revolver", "k", "q"), col("a", "k", "q")], {}, 1);
    expect(rev.roulette).toBe(true);
    expect(rev.wins.some((w) => w.sym === "revolver")).toBe(false);
  });

  it("the roulette: no spin while it is open; a click puts 25 in the pot (whatever the bet), the shot burns the pot; stop or all 4 clicks — the pot is his", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 100);
    await db.query("INSERT INTO bandit_state (player_id, roul_left, roul_round, roul_pulls, roul_bet) VALUES ($1, 4, 3, 0, 2)", [p]);
    await expect(act(db, p, "bandit_spin", { bet: 1 })).rejects.toMatchObject({ code: "roulette_open" });
    const a = await act(db, p, "bandit_pull", {});
    expect(a.result).toMatchObject({ shot: false, got: ROULETTE_PAY, blue: 0, boxes: 0, roulette: { pot: 25 } });
    const b = await act(db, p, "bandit_pull", {});
    expect(b.result).toMatchObject({ shot: false, blue: 0, roulette: { pot: 50 } });
    // the third pull shoots: the 50 in the pot burn
    const c = await act(db, p, "bandit_pull", {});
    expect(c.result).toMatchObject({ shot: true, got: 0, burned: 50, blue: 0, roulette: null });
    await expect(act(db, p, "bandit_pull", {})).rejects.toMatchObject({ code: "no_roulette" });
    // two clicks and he stops: the pot is his
    await db.query("UPDATE bandit_state SET roul_left=4, roul_round=9, roul_pulls=0, roul_bet=1, roul_pot=0, blue=0 WHERE player_id=$1", [p]);
    await act(db, p, "bandit_pull", {});
    await act(db, p, "bandit_pull", {});
    const st = await act(db, p, "bandit_pull", { stop: true });
    expect(st.result).toMatchObject({ stopped: true, took: 50, blue: 50, roulette: null });
    // no shot on any pull: all 4 click — the pot is his
    await db.query("UPDATE bandit_state SET roul_left=4, roul_round=9, roul_pulls=0, roul_bet=1, roul_pot=0, blue=0 WHERE player_id=$1", [p]);
    let last;
    for (let i = 0; i < 4; i++) last = await act(db, p, "bandit_pull", {});
    expect(last!.result).toMatchObject({ shot: false, took: 100, blue: 100, roulette: null });
  });

  it("levels: 10 experience to level 1, 100 000 more to level 100", () => {
    expect(banditLevel(9).level).toBe(0);
    expect(banditLevel(10).level).toBe(1);
    expect(banditLevel(100_009).level).toBe(99);
    expect(banditLevel(100_010).level).toBe(100);
  });

  it("a spin takes the bet in roubles and pays the win; free spins cost nothing and keep their bet", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 100);
    await expect(act(db, p, "bandit_spin", { bet: 11 })).rejects.toMatchObject({ code: "bad_bet" });
    // no free attempts left (they go before the roubles)
    await db.query("INSERT INTO bandit_state (player_id, gifts, gifts_at) VALUES ($1, 0, now())", [p]);
    const r = await act(db, p, "bandit_spin", { bet: 10 });
    expect(r.result.paid).toBe(10);
    expect(await wallet(db, p, "RUB")).toBe(90);
    expect(r.result.xp).toBe(10);
    expect(r.result.boxes).toBe(r.result.win);
    await db.query("UPDATE bandit_state SET roul_left=0 WHERE player_id=$1", [p]);
    await db.query("UPDATE bandit_state SET free=2, free_bet=7 WHERE player_id=$1", [p]);
    const before = await wallet(db, p, "RUB");
    const f = await act(db, p, "bandit_spin", { bet: 1 });
    expect(f.result).toMatchObject({ wasFree: true, bet: 7, paid: 0 });
    expect(f.result.xp).toBe(10);
    expect(f.result.boxes).toBe(r.result.win + f.result.win);
    expect(await wallet(db, p, "RUB")).toBe(before);
    await setMoney(db, p, "RUB", 0);
    await db.query("UPDATE bandit_state SET free=0 WHERE player_id=$1", [p]);
    await expect(act(db, p, "bandit_spin", { bet: 1 })).rejects.toMatchObject({ code: "no_money" });
  });

  it("the chest: 500 matchboxes for a tattoo piece not got yet", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await expect(act(db, p, "bandit_chest")).rejects.toMatchObject({ code: "no_boxes" });
    await db.query("INSERT INTO bandit_state (player_id, boxes) VALUES ($1, 600)", [p]);
    const r = await act(db, p, "bandit_chest");
    expect(r.result.tattoo).toMatch(/^tat-/);
    expect(r.result.boxes).toBe(100);
    expect(await qty(db, p, r.result.tattoo)).toBe(1);
  });

  it("free attempts: 12 at the start, one spent before the roubles (no experience), one more every 2 hours, 12 at most", async () => {
    const db = await freshDb();
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", 100);
    const T = Date.parse("2026-12-01T10:00:00Z");
    const a = await act(db, p, "bandit_spin", { bet: 5 }, T);
    expect(a.result).toMatchObject({ wasGift: true, paid: 0, gifts: 11, xp: a.result.xpGot });
    expect(await wallet(db, p, "RUB")).toBe(100);
    expect(a.result.giftNext).toBe(T + 2 * 3_600_000);
    for (let i = 0; i < 11; i++) await db.query("UPDATE bandit_state SET roul_left=0, free=0 WHERE player_id=$1", [p]), await act(db, p, "bandit_spin", { bet: 1 }, T + 1000);
    await db.query("UPDATE bandit_state SET roul_left=0, free=0 WHERE player_id=$1", [p]);
    const paid = await act(db, p, "bandit_spin", { bet: 1 }, T + 2000);
    expect(paid.result).toMatchObject({ wasGift: false, paid: 1, gifts: 0 });
    // 5 hours later: two back (and the clock of the third runs from the second's)
    await db.query("UPDATE bandit_state SET roul_left=0, free=0 WHERE player_id=$1", [p]);
    const b = await act(db, p, "bandit_spin", { bet: 1 }, T + 5 * 3_600_000);
    expect(b.result).toMatchObject({ wasGift: true, gifts: 1, giftNext: T + 6 * 3_600_000 });
    // a week later: 12, not more
    await db.query("UPDATE bandit_state SET roul_left=0, free=0 WHERE player_id=$1", [p]);
    const c = await act(db, p, "bandit_spin", { bet: 1 }, T + 7 * 24 * 3_600_000);
    expect(c.result).toMatchObject({ wasGift: true, gifts: 11 });
  });
});
