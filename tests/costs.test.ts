import { it, expect } from "vitest";
import { freshDb } from "./helpers.ts";
import { costs, costsSave } from "../src/server/costs.ts";

it("«Расходы»: subscriptions + the database estimate + the card fee, saved in config", async () => {
  const db = await freshDb();
  const a = await costs(db);
  expect(a.neon.live).toBe(false);
  expect(a.subs.map((s) => s.name)).toContain("OpenAI");
  const b = await costsSave(db, { subs: [{ name: "Vercel Pro", usd: 20 }, { name: "OpenAI", usd: 12 }, { name: "Claude", usd: 100 }], feePct: 10 });
  expect(b.subs.reduce((x, s) => x + s.usd, 0)).toBe(132);
  expect(b.total.withFee).toBeCloseTo((132 + b.neon.month) * 1.1, 1);
  await expect(costsSave(db, { subs: [{ name: "", usd: 1 }], feePct: 0 })).rejects.toThrow();
});
