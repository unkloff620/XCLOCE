// Prints the progression table used in GAME_DESIGN.md. Run: node --experimental-strip-types scripts/economy-table.ts
import { bossMarketCap, bossRewardRate, bossRewardXp, EQUIPMENT, DUMP_TOOLS, TRADE_FEE, xpForNextLevel } from "../src/shared/economy.ts";

// Solo-player assumptions (documented in GAME_DESIGN.md):
// - a player recycles capital through buy->sell round trips; each round trip burns 2*TRADE_FEE of volume
// - damage per $ of fees = 1/(2*TRADE_FEE) = 50 (times modifiers)
// - early capital ~ start $110 + rewards, so the sustainable damage rate ~ 50 * fee budget per hour
const rows: string[] = [];
rows.push("| Boss | Market Cap | Reward rate | Reward USD (full) | XP | Fees to kill solo (2% of mcap / mult) | Suggested gear |");
rows.push("|---:|---:|---:|---:|---:|---:|---|");
let cumulative = 0;
for (let n = 1; n <= 30; n++) {
  const m = bossMarketCap(n);
  cumulative += m;
  const tool = [...DUMP_TOOLS].filter((t) => t.priceUsd !== null && t.priceUsd! <= m * 0.3).pop()!;
  const eq = [...EQUIPMENT].filter((e) => (e.priceCurrency === "RUB" ? e.price / 90 : e.price) <= m * 0.5).pop()!;
  const mult = tool.mult * (1 + tool.critChance * (tool.critMult - 1)) * (1 + eq.damageBonus);
  const fees = (m * 2 * TRADE_FEE) / mult;
  rows.push(`| ${n} | $${m.toLocaleString("en-US")} | ${(bossRewardRate(n) * 100).toFixed(2)}% | $${Math.round(m * bossRewardRate(n)).toLocaleString("en-US")} | ${bossRewardXp(n)} | $${Math.round(fees).toLocaleString("en-US")} | ${tool.name} + ${eq.name} (x${mult.toFixed(2)}) |`);
}
console.log(rows.join("\n"));
console.log("\nCumulative market cap of bosses 1-30: $" + Math.round(cumulative).toLocaleString("en-US"));
console.log("\n| Level | XP to next |\n|---:|---:|");
for (const l of [1, 2, 3, 5, 8, 10, 15, 20, 30]) console.log(`| ${l} | ${xpForNextLevel(l)} |`);
