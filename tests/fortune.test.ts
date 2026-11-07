import { describe, expect, it } from "vitest";
import { act, always, freshDb, give, newPlayer, qty, setMoney, wallet } from "./helpers.ts";
import { resetConfigCache } from "../src/server/config.ts";
import type { Db } from "../src/server/db.ts";
import { CUP_WEIGHTS, JACKPOT_ADD, JACKPOT_SEED, SECTORS, TICKET_ID, TICKET_PRICE, rollSector } from "../src/content/fortune.ts";

const T = Date.UTC(2026, 10, 10, 12);
async function wheelOn(db: Db) {
  await db.query("INSERT INTO config (key, value) VALUES ('fortune', '{\"on\": true}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
  resetConfigCache();
}
const jackpot = async (db: Db) => Number((await db.query<{ jackpot: number }>("SELECT jackpot FROM fortune_global WHERE id='_all'"))[0].jackpot);

describe("«Колесо удачи»", () => {
  it("closed for the players until the admin shows it", async () => {
    const db = await freshDb();
    resetConfigCache();
    const p = await newPlayer(db);
    await give(db, p, TICKET_ID, 1);
    await expect(act(db, p, "fortune_spin", {}, T)).rejects.toMatchObject({ code: "fortune_off" });
  });

  it("tickets for roubles; a spin takes one, grows the jackpot and gives its sector", async () => {
    const db = await freshDb();
    await wheelOn(db);
    const p = await newPlayer(db);
    await setMoney(db, p, "RUB", TICKET_PRICE * 3);
    const b = await act(db, p, "fortune_buy", { qty: 3 }, T);
    expect(b.result.bought).toBe(3);
    expect(await wallet(db, p, "RUB")).toBe(0);
    const before = await jackpot(db);
    expect(before).toBe(JACKPOT_SEED);
    // the sector «150 ₽» (index 1): a roll just past the empty sector's weight
    const total = SECTORS.reduce((s, x) => s + x.weight, 0);
    const r = await act(db, p, "fortune_spin", {}, T, always((SECTORS[0].weight + 1) / total));
    expect(r.result.sector).toBe("rub");
    expect(await wallet(db, p, "RUB")).toBe(150);
    expect(await qty(db, p, TICKET_ID)).toBe(2);
    expect(await jackpot(db)).toBe(before + JACKPOT_ADD);
    // all at once: both tickets left
    const all = await act(db, p, "fortune_spin", { all: true }, T);
    expect(all.result.spins).toBe(2);
    expect(await qty(db, p, TICKET_ID)).toBe(0 + (all.result.reward?.items?.find((i: { id: string }) => i.id === TICKET_ID)?.qty ?? 0));
    expect(await jackpot(db)).toBe(before + 3 * JACKPOT_ADD);
    expect(all.result.fortune.jackpot).toBe(before + 3 * JACKPOT_ADD);
  });

  it("no ticket — no spin; «ПРИЗ» keeps a cups game for the player", async () => {
    const db = await freshDb();
    await wheelOn(db);
    const p = await newPlayer(db);
    await expect(act(db, p, "fortune_spin", {}, T)).rejects.toMatchObject({ code: "fortune_no_ticket" });
    await give(db, p, TICKET_ID, 1);
    const k = SECTORS.findIndex((s) => s.kind === "prize");
    const total = SECTORS.reduce((s, x) => s + x.weight, 0);
    const before = SECTORS.slice(0, k).reduce((s, x) => s + x.weight, 0);
    const r = await act(db, p, "fortune_spin", {}, T, always((before + 0.5) / total));
    expect(r.result.sector).toBe("prize");
    expect(r.result.fortune.cups).toBe(1);
  });

  it("the cups: nine prizes shown, one lifted; the jackpot goes to the player and starts again", async () => {
    const db = await freshDb();
    await wheelOn(db);
    const p = await newPlayer(db);
    await expect(act(db, p, "fortune_cups", {}, T)).rejects.toMatchObject({ code: "fortune_no_cups" });
    await db.query("INSERT INTO fortune_players (player_id, cups) VALUES ($1, 2)", [p]);
    await db.query("UPDATE fortune_global SET jackpot=12345 WHERE id='_all'");
    const s = await act(db, p, "fortune_cups", {}, T);
    expect(s.result.layout).toHaveLength(9);
    expect(s.result.layout.filter((c: { kind: string }) => c.kind === "jackpot")).toHaveLength(1);
    // leaving and coming back: the same game, no new cups spent
    const again = await act(db, p, "fortune_cups", {}, T);
    expect(again.result.layout).toEqual(s.result.layout);
    expect(again.result.fortune.cups).toBe(1);
    // a roll at the very start of the weights: the jackpot (its weight comes first)
    expect(Object.keys(CUP_WEIGHTS)[0]).toBe("jackpot");
    const rub = await wallet(db, p, "RUB");
    const r = await act(db, p, "fortune_cup_pick", { index: 4 }, T, always(0.001));
    expect(r.result.kind).toBe("jackpot");
    expect(r.result.final[4].kind).toBe("jackpot");
    expect(r.result.jackpot).toBe(12345);
    expect(await wallet(db, p, "RUB")).toBe(rub + 12345);
    expect(r.result.fortune.jackpot).toBe(JACKPOT_SEED);
    expect(r.result.fortune.winner).toMatchObject({ id: p, amount: 12345 });
    await expect(act(db, p, "fortune_cup_pick", { index: 0 }, T)).rejects.toMatchObject({ code: "fortune_no_cups" });
  });

  it("the weights add up to the sectors' order", () => {
    expect(SECTORS).toHaveLength(13);
    expect(rollSector(() => 0)).toBe(0);
    expect(rollSector(() => 0.999999)).toBe(SECTORS.length - 1);
  });
});
