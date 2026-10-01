/**
 * Deterministic meme-token market model. One tick = MARKET_TICK_MS.
 * Same (token state, tick) -> same result, so any server instance computes identical prices.
 * Balancing knobs live in MARKET constants below and are documented in GAME_DESIGN.md.
 */
import { riskScore } from "../shared/tokens.ts";

export const MARKET_TICK_MS = 10_000;
export const HISTORY_TICKS = 360; // 1 hour of history kept per token
export const MAX_CATCHUP_TICKS = 360;

export const MARKET = {
  meanReversion: 0.02,
  pumpStickiness: 0.08,
  dumpStickiness: 0.11,
  fairBleed: 0.00002, // meme coins slowly bleed without hype
  fairDrift: 0.002,
  hypeDecay: 0.97,
  pumpBase: 0.003,
  pumpHype: 0.012,
  dumpBase: 0.0035,
  prerugBase: 0.0006, // * risk^2 per tick
  pumpTicks: [6, 18] as const,
  pumpDrift: [0.02, 0.045] as const,
  dumpTicks: [4, 12] as const,
  dumpDrift: [-0.035, -0.015] as const,
  prerugTicks: [6, 12] as const,
  rugKeep: [0.04, 0.12] as const,
  ruggedTicks: 30,
  recoverTicks: 60,
};

export type Regime = "normal" | "pump" | "dump" | "prerug" | "rugged" | "recovering";

export interface SimToken {
  id: string;
  ticker: string;
  price: number;
  fairPrice: number;
  liquidity: number;
  holders: number;
  volume24h: number;
  volatility: number;
  devReputation: number;
  whaleConcentration: number;
  hype: number;
  regime: Regime;
  regimeTicks: number;
  launchedAt: number; // ms
  ruggedCount: number;
}

export interface SimEvent {
  kind: "pump" | "dump" | "prerug" | "rug" | "recover" | "news";
  tokenId: string;
  text: string;
}

function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rngFor(tokenId: string, tick: number) {
  let a = hash32(`${tokenId}:${tick}`);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(1e-12, next());
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const range = (lo: number, hi: number) => lo + (hi - lo) * next();
  const int = (lo: number, hi: number) => Math.floor(range(lo, hi + 1));
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)];
  return { next, normal, range, int, pick };
}

const PUMP_REASONS = [
  "Инфлюенсер запостил про ${t}",
  "Кит закупился ${t} на 6 цифр",
  "Мем про ${t} залетел в тренды",
  "Слухи о листинге ${t} на крупной бирже",
  "«Слив инсайда»: ${t} якобы партнёрится с банком",
  "Комьюнити ${t} устроило хайп-рейд",
];
const DUMP_REASONS = [
  "Кит сливает ${t}",
  "Плохие новости по ${t}",
  "Разлок токенов команды ${t}",
  "Паника в чате ${t}",
  "Слухи об эксплойте в контракте ${t}",
];
const PRERUG_SIGNS = [
  "⚠️ Кошелёк разработчика ${t} перевёл токены на биржу",
  "⚠️ Ликвидность ${t} начала уходить из пула",
  "⚠️ Модераторы чата ${t} пропали",
];

/** Advances one token by one tick. Mutates and returns the token plus generated events. */
export function stepToken(tok: SimToken, tick: number, now: number): SimEvent[] {
  const r = rngFor(tok.id, tick);
  const events: SimEvent[] = [];
  const t = "$" + tok.ticker;
  const fmt = (s: string) => s.replace("${t}", t);
  let drift = 0;
  let vol = tok.volatility;

  // --- regime transitions ---
  if (tok.regime === "normal") {
    const risk = riskScore({
      liquidity: tok.liquidity, holders: tok.holders, ageMs: now - tok.launchedAt,
      volatility: tok.volatility, devReputation: tok.devReputation, whaleConcentration: tok.whaleConcentration,
    });
    const roll = r.next();
    // Tokens that already rugged get a cooldown after their community relaunch.
    const sinceRelaunch = now - tok.launchedAt - 6 * 3_600_000;
    const cooldown = tok.ruggedCount > 0 ? Math.max(0, Math.min(1, sinceRelaunch / (12 * 3_600_000))) : 1;
    const pPrerug = MARKET.prerugBase * risk * risk * cooldown;
    const pPump = MARKET.pumpBase + MARKET.pumpHype * tok.hype;
    const pDump = MARKET.dumpBase * (0.6 + tok.whaleConcentration) + MARKET.pumpHype * 0.5 * tok.hype;
    if (roll < pPrerug) {
      tok.regime = "prerug";
      tok.regimeTicks = r.int(...MARKET.prerugTicks);
      events.push({ kind: "prerug", tokenId: tok.id, text: fmt(r.pick(PRERUG_SIGNS)) });
    } else if (roll < pPrerug + pPump) {
      tok.regime = "pump";
      tok.regimeTicks = r.int(...MARKET.pumpTicks);
      tok.hype = Math.min(1, tok.hype + 0.25);
      events.push({ kind: "pump", tokenId: tok.id, text: "🚀 " + fmt(r.pick(PUMP_REASONS)) });
    } else if (roll < pPrerug + pPump + pDump) {
      tok.regime = "dump";
      tok.regimeTicks = r.int(...MARKET.dumpTicks);
      events.push({ kind: "dump", tokenId: tok.id, text: "📉 " + fmt(r.pick(DUMP_REASONS)) });
    }
  }

  switch (tok.regime) {
    case "pump":
      drift = r.range(...MARKET.pumpDrift);
      vol *= 1.5;
      break;
    case "dump":
      drift = r.range(...MARKET.dumpDrift);
      vol *= 1.3;
      break;
    case "prerug":
      drift = -0.004;
      tok.liquidity *= 0.88;
      tok.holders = Math.max(50, Math.round(tok.holders * 0.985));
      tok.whaleConcentration = Math.min(0.95, tok.whaleConcentration + 0.02);
      break;
    case "rugged":
      drift = 0;
      vol = tok.volatility * 0.3;
      break;
    case "recovering":
      drift = 0.006;
      break;
  }

  // --- price move: mean reversion to fair value + regime drift + noise ---
  const lp = Math.log(tok.price);
  const lf = Math.log(tok.fairPrice);
  const reversion = tok.regime === "normal" || tok.regime === "recovering" ? -MARKET.meanReversion * (lp - lf) : 0;
  const ret = reversion + drift + vol * r.normal();
  tok.price = Math.max(1e-10, tok.price * Math.exp(ret));
  tok.fairPrice = Math.max(1e-10, tok.fairPrice * Math.exp(MARKET.fairDrift * r.normal()));
  if (tok.regime === "pump") tok.fairPrice *= 1 + drift * MARKET.pumpStickiness; // part of a move sticks
  if (tok.regime === "dump") tok.fairPrice *= 1 + drift * MARKET.dumpStickiness;
  tok.fairPrice *= Math.exp(-MARKET.fairBleed);
  tok.hype *= MARKET.hypeDecay;
  tok.volume24h = tok.volume24h * 0.997 + Math.abs(ret) * tok.liquidity * 0.6;
  if (tok.regime === "normal") {
    tok.holders = Math.max(50, Math.round(tok.holders * (1 + 0.0004 * r.normal() + 0.00005)));
    tok.liquidity = Math.max(5_000, tok.liquidity * (1 + 0.002 * r.normal()));
  }

  // --- regime countdown ---
  if (tok.regime !== "normal") {
    tok.regimeTicks -= 1;
    if (tok.regimeTicks <= 0) {
      if (tok.regime === "prerug") {
        const keep = r.range(...MARKET.rugKeep);
        tok.price *= keep;
        tok.fairPrice = tok.price;
        tok.liquidity = Math.max(3_000, tok.liquidity * 0.1);
        tok.holders = Math.max(50, Math.round(tok.holders * 0.4));
        tok.ruggedCount += 1;
        tok.regime = "rugged";
        tok.regimeTicks = MARKET.ruggedTicks;
        events.push({ kind: "rug", tokenId: tok.id, text: `💀 RUGPULL: разработчик ${t} вытащил ликвидность. ${Math.round((1 - keep) * 100)}% цены сгорело` });
      } else if (tok.regime === "rugged") {
        // Community takeover: new dev, fair value partially restored.
        tok.regime = "recovering";
        tok.regimeTicks = MARKET.recoverTicks;
        tok.fairPrice = tok.price * r.range(2, 4);
        tok.devReputation = Math.min(0.6, 0.25 + r.next() * 0.3);
        tok.whaleConcentration = Math.max(0.2, tok.whaleConcentration - 0.25);
        tok.launchedAt = now - 6 * 3_600_000; // treated as a relaunch, not a fresh token
        tok.liquidity = Math.max(tok.liquidity * 6, 40_000);
        tok.holders = Math.round(tok.holders * 2.2);
        events.push({ kind: "recover", tokenId: tok.id, text: `🛠 Комьюнити перезапустило ${t} (CTO). Начинается восстановление` });
      } else {
        tok.regime = "normal";
        tok.regimeTicks = 0;
      }
    }
  }
  return events;
}

/** Price impact of a trade of `usd` against `liquidity` (fraction, capped). */
export function priceImpact(usd: number, liquidity: number): number {
  return Math.min(0.25, (usd / Math.max(1_000, liquidity)) * 0.5);
}
