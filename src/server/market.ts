import type { Db, Queryable } from "./db.ts";
import { HISTORY_TICKS, MARKET_TICK_MS, MAX_CATCHUP_TICKS, rngFor, stepToken, type Regime, type SimEvent, type SimToken } from "./marketSim.ts";
import { ACCESSORIES, CREATURES, skinFor, type TokenArt } from "../shared/art.ts";
import { NAME_BY_CREATURE, NAME_PREFIX, riskFactors, riskScore } from "../shared/tokens.ts";
import { log } from "./log.ts";

export interface TokenRow {
  id: string;
  name: string;
  ticker: string;
  description: string;
  art: TokenArt;
  price: number;
  fair_price: number;
  launch_price: number;
  supply: number;
  liquidity: number;
  holders: number;
  volume_24h: number;
  volatility: number;
  dev_reputation: number;
  whale_concentration: number;
  hype: number;
  regime: Regime;
  regime_ticks: number;
  launched_at: Date | string;
  generation: number;
  rugged_count: number;
  sort_order: number;
}

export function currentTick(now = Date.now()): number {
  return Math.floor(now / MARKET_TICK_MS);
}

function toSim(r: TokenRow): SimToken {
  return {
    id: r.id, ticker: r.ticker, price: r.price, fairPrice: r.fair_price, liquidity: r.liquidity, holders: r.holders,
    volume24h: r.volume_24h, volatility: r.volatility, devReputation: r.dev_reputation, whaleConcentration: r.whale_concentration,
    hype: r.hype, regime: r.regime, regimeTicks: r.regime_ticks, launchedAt: new Date(r.launched_at).getTime(), ruggedCount: r.rugged_count,
  };
}

/**
 * Advances the shared market up to the current tick. Only one instance advances at a time
 * (try-lock); others simply read the latest committed prices. Returns the tick reached.
 */
export async function advanceMarket(db: Db, now = Date.now()): Promise<number> {
  const target = currentTick(now);
  return db.tx(async (tx) => {
    const [{ tick }] = await tx.query<{ tick: number }>("SELECT tick FROM market_clock WHERE id = 1");
    if (tick >= target) return tick;
    const [{ locked }] = await tx.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(4242002) AS locked");
    if (!locked) return tick;
    const [{ tick: fresh }] = await tx.query<{ tick: number }>("SELECT tick FROM market_clock WHERE id = 1 FOR UPDATE");
    if (fresh >= target) return fresh;

    const from = Math.max(fresh + 1, target - MAX_CATCHUP_TICKS + 1);
    const rows = await tx.query<TokenRow>("SELECT * FROM tokens ORDER BY sort_order");
    const events: SimEvent[] = [];
    const historyValues: unknown[] = [];
    const historyRows: string[] = [];
    for (const row of rows) {
      const sim = toSim(row);
      for (let t = from; t <= target; t++) {
        const evs = stepToken(sim, t, t * MARKET_TICK_MS);
        // Only surface news from the last few minutes of a long catch-up.
        if (t > target - 30) events.push(...evs);
        historyValues.push(row.id, t, sim.price);
        historyRows.push(`($${historyValues.length - 2}, $${historyValues.length - 1}, $${historyValues.length})`);
        if (historyValues.length >= 3 * 900) {
          await tx.query(`INSERT INTO token_prices (token_id, tick, price) VALUES ${historyRows.join(",")} ON CONFLICT DO NOTHING`, historyValues);
          historyValues.length = 0;
          historyRows.length = 0;
        }
      }
      // Dead token: community rebrands it into a fresh meme.
      if (sim.regime === "normal" && sim.price < row.launch_price * 0.003) {
        await relaunchToken(tx, row, target);
        continue;
      }
      await tx.query(
        `UPDATE tokens SET price=$2, fair_price=$3, liquidity=$4, holders=$5, volume_24h=$6, dev_reputation=$7,
         whale_concentration=$8, hype=$9, regime=$10, regime_ticks=$11, launched_at=$12, rugged_count=$13 WHERE id=$1`,
        [row.id, sim.price, sim.fairPrice, sim.liquidity, sim.holders, sim.volume24h, sim.devReputation,
          sim.whaleConcentration, sim.hype, sim.regime, sim.regimeTicks, new Date(sim.launchedAt), sim.ruggedCount],
      );
    }
    if (historyRows.length) {
      await tx.query(`INSERT INTO token_prices (token_id, tick, price) VALUES ${historyRows.join(",")} ON CONFLICT DO NOTHING`, historyValues);
    }
    await tx.query("DELETE FROM token_prices WHERE tick < $1", [target - HISTORY_TICKS - 10]);
    for (const e of events) {
      await tx.query("INSERT INTO feed (kind, text, token_id) VALUES ($1, $2, $3)", [e.kind === "news" ? "news" : `market_${e.kind}`, e.text, e.tokenId]);
    }
    await tx.query("UPDATE market_clock SET tick = $1 WHERE id = 1", [target]);
    if (events.length) log.info("market.events", { count: events.length, tick: target });
    return target;
  });
}

async function relaunchToken(tx: Queryable, row: TokenRow, tick: number) {
  const r = rngFor(row.id + ":relaunch", tick);
  const creature = r.pick(CREATURES);
  const word = r.pick(NAME_BY_CREATURE[creature]);
  const prefix = r.pick(NAME_PREFIX);
  const name = `${prefix} ${word}`;
  let ticker = (prefix[0] + word).slice(0, 5);
  const taken = await tx.query<{ ticker: string }>("SELECT ticker FROM tokens WHERE id <> $1", [row.id]);
  if (taken.some((t) => t.ticker === ticker)) ticker = (prefix.slice(0, 2) + word).slice(0, 5);
  const art: TokenArt = {
    creature, accessory: r.pick(ACCESSORIES), hue: r.int(0, 359), skin: skinFor(creature, r.int(0, 9)),
    mood: r.pick(["smug", "happy", "sad", "angry"] as const),
  };
  const price = Number((r.range(0.0002, 0.02)).toPrecision(3));
  await tx.query("DELETE FROM positions WHERE token_id = $1", [row.id]);
  await tx.query(
    `UPDATE tokens SET name=$2, ticker=$3, description=$4, art=$5, price=$6, fair_price=$6, launch_price=$6, liquidity=$7, holders=$8,
       volume_24h=0, volatility=$9, dev_reputation=$10, whale_concentration=$11, hype=0.3, regime='normal', regime_ticks=0,
       launched_at=now(), generation=generation+1, rugged_count=0 WHERE id=$1`,
    [row.id, name, ticker, `Ребрендинг мёртвого $${row.ticker}. Новая команда, новые обещания.`, JSON.stringify(art), price,
      r.range(20_000, 120_000), r.int(300, 2500), r.range(0.018, 0.035), r.range(0.2, 0.7), r.range(0.25, 0.6)],
  );
  await tx.query("DELETE FROM token_prices WHERE token_id = $1", [row.id]);
  await tx.query("INSERT INTO feed (kind, text, token_id) VALUES ('market_launch', $1, $2)", [`🆕 Новый мемкоин на рынке: ${name} ($${ticker})`, row.id]);
}

export function tokenPublic(r: TokenRow, history: number[], now = Date.now()) {
  const ageMs = now - new Date(r.launched_at).getTime();
  const riskIn = { liquidity: r.liquidity, holders: r.holders, ageMs, volatility: r.volatility, devReputation: r.dev_reputation, whaleConcentration: r.whale_concentration };
  const first = history.length ? history[0] : r.price;
  return {
    id: r.id,
    name: r.name,
    ticker: r.ticker,
    description: r.description,
    art: r.art,
    price: r.price,
    marketCap: r.price * r.supply,
    liquidity: r.liquidity,
    holders: r.holders,
    volume24h: r.volume_24h,
    ageMs,
    regime: r.regime === "prerug" ? "normal" : r.regime, // pre-rug is hidden; players see only indirect signs
    change1h: first > 0 ? r.price / first - 1 : 0,
    risk: riskScore(riskIn),
    riskFactors: riskFactors(riskIn),
    devReputation: r.dev_reputation,
    whaleConcentration: r.whale_concentration,
    generation: r.generation,
    ruggedCount: r.rugged_count,
    history,
  };
}
export type TokenPublic = ReturnType<typeof tokenPublic>;

export async function listMarket(db: Db, points = 60): Promise<TokenPublic[]> {
  const tick = currentTick();
  const rows = await db.query<TokenRow>("SELECT * FROM tokens ORDER BY sort_order");
  const hist = await db.query<{ token_id: string; tick: number; price: number }>(
    "SELECT token_id, tick, price FROM token_prices WHERE tick > $1 ORDER BY tick",
    [tick - HISTORY_TICKS],
  );
  const by = new Map<string, number[]>();
  for (const h of hist) {
    const arr = by.get(h.token_id) ?? [];
    arr.push(h.price);
    by.set(h.token_id, arr);
  }
  return rows.map((r) => {
    const full = by.get(r.id) ?? [];
    const step = Math.max(1, Math.floor(full.length / points));
    const sampled = full.filter((_, i) => i % step === 0);
    if (full.length) sampled.push(full[full.length - 1]);
    const t = tokenPublic(r, full);
    return { ...t, history: sampled };
  });
}

export async function getToken(db: Db, id: string) {
  const [row] = await db.query<TokenRow>("SELECT * FROM tokens WHERE id = $1", [id]);
  if (!row) return null;
  const hist = await db.query<{ price: number }>(
    "SELECT price FROM token_prices WHERE token_id = $1 AND tick > $2 ORDER BY tick",
    [id, currentTick() - HISTORY_TICKS],
  );
  return tokenPublic(row, hist.map((h) => h.price));
}
