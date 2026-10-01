// Balancing check: simulates 24h of market and prints stats per token. Run: node --experimental-strip-types scripts/market-sim-check.ts
import { stepToken, MARKET_TICK_MS, type SimToken } from "../src/server/marketSim.ts";
import { TOKEN_SEEDS } from "../src/shared/tokens.ts";
const now0 = Date.now() - 48 * 3600_000;
for (const s of TOKEN_SEEDS) {
  const tok: SimToken = { id: s.id, ticker: s.ticker, price: s.price, fairPrice: s.price, liquidity: s.liquidity, holders: s.holders, volume24h: 0, volatility: s.volatility, devReputation: s.devReputation, whaleConcentration: s.whaleConcentration, hype: 0, regime: "normal", regimeTicks: 0, launchedAt: now0, ruggedCount: 0 };
  const counts: Record<string, number> = {};
  let min = Infinity, max = 0;
  const startTick = Math.floor(Date.now() / MARKET_TICK_MS);
  for (let i = 0; i < 8640; i++) {
    for (const e of stepToken(tok, startTick + i, now0 + 24 * 3600_000 + i * MARKET_TICK_MS)) counts[e.kind] = (counts[e.kind] || 0) + 1;
    min = Math.min(min, tok.price); max = Math.max(max, tok.price);
  }
  console.log(s.ticker.padEnd(6), "end x" + (tok.price / s.price).toFixed(2), "min x" + (min / s.price).toFixed(3), "max x" + (max / s.price).toFixed(2), JSON.stringify(counts));
}
