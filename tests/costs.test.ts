import { it, expect } from "vitest";
import { freshDb } from "./helpers.ts";
import { costs, costsSave } from "../src/server/costs.ts";

it("«Расходы»: subscriptions + the database estimate + the card fee, saved in config", async () => {
  const db = await freshDb();
  const a = await costs(db);
  expect(a.neon.live).toBe(false);
  expect(a.subs.map((s) => s.name)).toContain("OpenAI");
  expect(a.total.spent).toBeCloseTo(21.8 * 2 + 122.8 * 2 + 12 * 4, 2);
  const b = await costsSave(db, { subs: [{ name: "Vercel Pro", usd: 20, paid: 21.8, times: 2 }, { name: "OpenAI", usd: 12, times: 4 }], feePct: 10 });
  expect(b.total.month).toBeCloseTo(21.8 + 12 + b.neon.month * 1.1, 1);
  expect(b.total.spent).toBeCloseTo(43.6 + 48, 2);
  await expect(costsSave(db, { subs: [{ name: "", usd: 1 }], feePct: 0 })).rejects.toThrow();
});
