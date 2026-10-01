import type { Db } from "./db.ts";
import { TOKEN_SEEDS } from "../shared/tokens.ts";
import { advanceMarket, currentTick } from "./market.ts";
import { HISTORY_TICKS } from "./marketSim.ts";
import { log } from "./log.ts";

/** Idempotent dev/production seed: initial meme tokens with one hour of simulated chart history. */
export async function seed(db: Db, now = Date.now()): Promise<void> {
  const seeded = await db.tx(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(4242003)");
    const [{ n }] = await tx.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM tokens");
    if (n > 0) return false;
    for (const [i, s] of TOKEN_SEEDS.entries()) {
      await tx.query(
        `INSERT INTO tokens (id, name, ticker, description, art, price, fair_price, launch_price, supply, liquidity, holders,
           volatility, dev_reputation, whale_concentration, launched_at, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
        [s.id, s.name, s.ticker, s.description, JSON.stringify(s.art), s.price, s.supply, s.liquidity, s.holders,
          s.volatility, s.devReputation, s.whaleConcentration, new Date(now - (2 + i * 3) * 24 * 3_600_000), i],
      );
    }
    await tx.query("UPDATE market_clock SET tick = $1 WHERE id = 1", [currentTick(now) - HISTORY_TICKS - 1]);
    return true;
  });
  if (seeded) {
    await advanceMarket(db, now);
    await db.query("DELETE FROM feed WHERE kind LIKE 'market_%'");
    await db.query("INSERT INTO feed (kind, text) VALUES ('system', $1)", ["🟢 Рынок XCLOCE открыт. Первые мем-боссы ждут своих дегенов."]);
    log.info("db.seeded", { tokens: TOKEN_SEEDS.length });
  }
}
