import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Db } from "../src/server/db.ts";
import { freshDb, newPlayer, wallet } from "./helpers.ts";
import { DONATE_PACKS, donatePack } from "../src/content/donate.ts";
import { donateUpdate } from "../src/server/systems/donate.ts";

let db: Db;
const calls: { method: string; body: Record<string, unknown> }[] = [];
beforeEach(async () => {
  db = await freshDb();
  calls.length = 0;
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    calls.push({ method: String(url).split("/").pop()!, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }));
  });
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.TELEGRAM_BOT_TOKEN; });

describe("«Донат»", () => {
  it("the user's rates: the fixed packs, the rest growing per star", () => {
    expect(donatePack("RUB-0")).toMatchObject({ stars: 3, amount: 12 });
    expect(donatePack("RUB-5")).toMatchObject({ stars: 250, amount: 2000 });
    expect(donatePack("RUB-8")).toMatchObject({ stars: 2500, amount: 25000 });
    expect(donatePack("GOLD-5")!.amount).toBe(500);
    expect(donatePack("GOLD-8")!.amount).toBe(6000);
    expect(donatePack("TOKEN-8")!.amount).toBe(8500);
    for (const c of ["RUB", "GOLD", "TOKEN", "TOOTH", "PAP"]) {
      const per = DONATE_PACKS.filter((p) => p.cur === c).map((p) => p.amount / p.stars);
      for (let i = 1; i < per.length; i++) expect(per[i]).toBeGreaterThanOrEqual(per[i - 1] - 0.05);
    }
    for (const [c, base] of [["GOLD", 4], ["TOKEN", 8], ["TOOTH", 720], ["PAP", 2400]] as const) expect(donatePack(`${c}-0`)!.amount).toBe(base);
    expect(DONATE_PACKS).toHaveLength(45);
  });

  it("the order is confirmed for its own player and price; a payment is credited once", async () => {
    const p = await newPlayer(db);
    const [{ telegram_id }] = await db.query<{ telegram_id: string }>("SELECT telegram_id FROM players WHERE id=$1", [p]);
    const tgId = Number(telegram_id);
    const payload = `don:${p}:GOLD-2`;
    await donateUpdate(db, { pre_checkout_query: { id: "q1", from: { id: tgId }, currency: "XTR", total_amount: 25, invoice_payload: payload } });
    expect(calls.at(-1)).toMatchObject({ method: "answerPreCheckoutQuery", body: { ok: true } });
    await donateUpdate(db, { pre_checkout_query: { id: "q2", from: { id: tgId }, currency: "XTR", total_amount: 3, invoice_payload: payload } });
    expect(calls.at(-1)).toMatchObject({ method: "answerPreCheckoutQuery", body: { ok: false } });
    const paid = { message: { from: { id: tgId }, successful_payment: { currency: "XTR", total_amount: 25, invoice_payload: payload, telegram_payment_charge_id: "ch1" } } };
    await donateUpdate(db, paid);
    await donateUpdate(db, paid);
    expect(await wallet(db, p, "GOLD")).toBe(donatePack("GOLD-2")!.amount);
  });
});
