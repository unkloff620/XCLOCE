import { randomInt } from "node:crypto";
import { GameError, type Queryable } from "./db.ts";
import { emitDamage, syncBoss, addXp, type SyncResult } from "./damageBus.ts";
import { priceImpact } from "./marketSim.ts";
import type { TelegramUser } from "./auth.ts";
import {
  COMBO_MIN_INTERVAL_MS, COMBO_MIN_SALE_USD, COMBO_WINDOW_MS, CURRENCIES, CURRENCY_UNLOCK_LEVEL, DUMP_TOOLS, ENERGY_REGEN_MS,
  EQUIPMENT, MIN_TRADE_USD, OFFLINE_CAP_MS, START_BALANCES, TRADE_FEE, WORK_ENERGY_COST, XP,
  computeDamage, equipmentByTier, exchangeQuote, isPairAllowed, roundCur, roundTo, toolById, usdRates, xpForNextLevel,
  type Currency,
} from "../shared/economy.ts";
import { bossInfo } from "../shared/bosses.ts";
import { bumpMetric, claimDaily, claimQuest, dailyStatus, normalizeOutfit, ownedCosmetics, questStatus, wearCosmetic } from "./retention.ts";
import { log } from "./log.ts";

export interface PlayerRow {
  id: number;
  tg_id: string;
  username: string | null;
  first_name: string;
  photo_url: string | null;
  is_guest: boolean;
  level: number;
  xp: number;
  energy: number;
  energy_updated_at: Date;
  passive_updated_at: Date;
  equipment_tier: number;
  equipped_tool: string;
  combo: number;
  last_sell_at: Date | null;
  last_action_at: Date | null;
  tutorial_step: number;
  created_at: Date;
}

export function displayName(p: Pick<PlayerRow, "username" | "first_name">): string {
  return p.username ? "@" + p.username : p.first_name || "Деген";
}

// ---------------- Tutorial ----------------
/** Steps: 0 work → 1 buy USD → 2 buy SOL → 3 buy token → 4 sell token → 5 open boss → 6 done. */
export const TUTORIAL = { WORK: 0, BUY_USD: 1, BUY_SOL: 2, BUY_TOKEN: 3, SELL_TOKEN: 4, OPEN_BOSS: 5, DONE: 6 } as const;
async function advanceTutorial(tx: Queryable, p: PlayerRow, from: number) {
  if (p.tutorial_step === from) {
    p.tutorial_step = from + 1;
    await tx.query("UPDATE players SET tutorial_step = $2 WHERE id = $1", [p.id, p.tutorial_step]);
  }
}

// ---------------- Player lifecycle ----------------
export async function upsertTelegramPlayer(tx: Queryable, u: TelegramUser, referrerTgId?: string): Promise<number> {
  const firstName = (u.first_name || "Degen").slice(0, 64);
  const existing = await tx.query<{ id: number }>(
    `UPDATE players SET username=$2, first_name=$3, photo_url=$4, last_seen_at=now() WHERE tg_id=$1 RETURNING id`,
    [String(u.id), u.username ?? null, firstName, u.photo_url ?? null],
  );
  if (existing.length) return existing[0].id;
  return createPlayer(tx, String(u.id), u.username ?? null, firstName, u.photo_url ?? null, false, referrerTgId);
}

export async function upsertGuestPlayer(tx: Queryable, guestId: string): Promise<number> {
  const tgId = "guest:" + guestId;
  const existing = await tx.query<{ id: number }>("UPDATE players SET last_seen_at=now() WHERE tg_id=$1 RETURNING id", [tgId]);
  if (existing.length) return existing[0].id;
  return createPlayer(tx, tgId, null, "Гость " + guestId.slice(0, 4).toUpperCase(), null, true);
}

async function createPlayer(tx: Queryable, tgId: string, username: string | null, firstName: string, photo: string | null, guest: boolean, referrerTgId?: string): Promise<number> {
  const startEnergy = equipmentByTier(1).maxEnergy;
  let referrerId: number | null = null;
  if (referrerTgId && referrerTgId !== tgId) {
    const r = await tx.query<{ id: number }>("SELECT id FROM players WHERE tg_id = $1", [referrerTgId]);
    referrerId = r[0]?.id ?? null;
  }
  const inserted = await tx.query<{ id: number }>(
    `INSERT INTO players (tg_id, username, first_name, photo_url, is_guest, energy, referrer_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tg_id) DO NOTHING RETURNING id`,
    [tgId, username, firstName, photo, guest, startEnergy, referrerId],
  );
  if (!inserted.length) {
    const [row] = await tx.query<{ id: number }>("SELECT id FROM players WHERE tg_id = $1", [tgId]);
    return row.id;
  }
  const id = inserted[0].id;
  for (const c of CURRENCIES) {
    await tx.query("INSERT INTO balances (player_id, currency, amount) VALUES ($1,$2,$3)", [id, c, START_BALANCES[c]]);
  }
  // New players start at the current global total: they receive damage from now on, not history.
  await tx.query("INSERT INTO boss_progress (player_id, global_checkpoint) SELECT $1, damage_total FROM global_state WHERE id = 1", [id]);
  await tx.query("INSERT INTO player_stats (player_id) VALUES ($1)", [id]);
  await tx.query("INSERT INTO inventory (player_id, item_type, item_id) VALUES ($1,'tool','paper-hands')", [id]);
  log.info("player.created", { id, guest });
  return id;
}

/** Locks the player row for the rest of the transaction and applies time-based regeneration. */
export async function lockPlayer(tx: Queryable, playerId: number, now = Date.now()): Promise<PlayerRow> {
  const [p] = await tx.query<PlayerRow>("SELECT * FROM players WHERE id = $1 FOR UPDATE", [playerId]);
  if (!p) throw new GameError("player_missing", "Игрок не найден, перезапустите игру", 401);
  const eq = equipmentByTier(p.equipment_tier);
  // Energy regen
  const eElapsed = Math.max(0, now - new Date(p.energy_updated_at).getTime());
  const energy = Math.min(eq.maxEnergy, p.energy + eElapsed / ENERGY_REGEN_MS);
  // Passive income, capped (OFFLINE_CAP_MS) so a year-long absence does not mint infinite money
  const pElapsed = Math.min(OFFLINE_CAP_MS, Math.max(0, now - new Date(p.passive_updated_at).getTime()));
  const passive = roundTo((eq.passiveRubPerHour * pElapsed) / 3_600_000, 2);
  if (passive > 0) await tx.query("UPDATE balances SET amount = amount + $2 WHERE player_id = $1 AND currency = 'RUB'", [p.id, passive]);
  await tx.query("UPDATE players SET energy=$2, energy_updated_at=$3, passive_updated_at=$3, last_seen_at=$3 WHERE id=$1", [p.id, energy, new Date(now)]);
  p.energy = energy;
  return p;
}

function rateLimit(p: PlayerRow, minMs: number, now: number) {
  if (p.last_action_at && now - new Date(p.last_action_at).getTime() < minMs) {
    throw new GameError("too_fast", "Слишком быстро. Подождите секунду", 429);
  }
}
async function touchAction(tx: Queryable, p: PlayerRow, now: number) {
  await tx.query("UPDATE players SET last_action_at = $2 WHERE id = $1", [p.id, new Date(now)]);
}

async function balancesOf(tx: Queryable, playerId: number): Promise<Record<Currency, number>> {
  const rows = await tx.query<{ currency: Currency; amount: number }>("SELECT currency, amount FROM balances WHERE player_id = $1", [playerId]);
  const out = { RUB: 0, USD: 0, SOL: 0, BTC: 0 } as Record<Currency, number>;
  for (const r of rows) out[r.currency] = r.amount;
  return out;
}

async function debit(tx: Queryable, playerId: number, c: Currency, amount: number) {
  const r = await tx.query("UPDATE balances SET amount = amount - $3 WHERE player_id = $1 AND currency = $2 AND amount >= $3 RETURNING amount", [playerId, c, amount]);
  if (!r.length) throw new GameError("insufficient_funds", `Недостаточно ${c}`, 400);
}
async function credit(tx: Queryable, playerId: number, c: Currency, amount: number) {
  await tx.query("UPDATE balances SET amount = amount + $3 WHERE player_id = $1 AND currency = $2", [playerId, c, amount]);
}

/** Idempotency wrapper: replays the stored result if this (player, key) was already processed. */
async function idempotent<T>(tx: Queryable, playerId: number, key: string | undefined, kind: string, fn: () => Promise<T>, meta?: { tokenId?: string; amount?: number; price?: number; usd?: number }): Promise<T & { replay?: boolean }> {
  if (!key) throw new GameError("bad_request", "Нет ключа операции", 400);
  const prev = await tx.query<{ result: T }>("SELECT result FROM actions WHERE player_id = $1 AND idem_key = $2", [playerId, key]);
  if (prev.length) return { ...(prev[0].result as T), replay: true };
  const result = await fn();
  await tx.query(
    "INSERT INTO actions (player_id, idem_key, kind, token_id, amount, price, usd_value, result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [playerId, key, kind, meta?.tokenId ?? null, meta?.amount ?? null, meta?.price ?? null, meta?.usd ?? null, JSON.stringify(result)],
  );
  return result as T & { replay?: boolean };
}

// ---------------- Actions ----------------
export async function doWork(tx: Queryable, playerId: number, now = Date.now()) {
  const p = await lockPlayer(tx, playerId, now);
  rateLimit(p, 120, now);
  if (p.energy < WORK_ENERGY_COST) throw new GameError("no_energy", "Нет энергии. Она восстанавливается со временем", 400);
  const eq = equipmentByTier(p.equipment_tier);
  await credit(tx, p.id, "RUB", eq.workRub);
  await tx.query("UPDATE players SET energy = energy - $2 WHERE id = $1", [p.id, WORK_ENERGY_COST]);
  await addXp(tx, p.id, XP.work);
  await bumpMetric(tx, p.id, "work", 1, now);
  await touchAction(tx, p, now);
  await advanceTutorial(tx, p, TUTORIAL.WORK);
  return { earned: eq.workRub, currency: "RUB" as Currency };
}

export async function doExchange(tx: Queryable, playerId: number, from: Currency, to: Currency, amount: number, idem: string, now = Date.now()) {
  const p = await lockPlayer(tx, playerId, now);
  return idempotent(tx, p.id, idem, "exchange", async () => {
    rateLimit(p, 250, now);
    if (!isPairAllowed(from, to)) throw new GameError("bad_pair", "Такой обмен недоступен", 400);
    for (const c of [from, to]) {
      if (p.level < CURRENCY_UNLOCK_LEVEL[c]) throw new GameError("locked", `${c} откроется на уровне ${CURRENCY_UNLOCK_LEVEL[c]}`, 400);
    }
    if (!(amount > 0) || !Number.isFinite(amount)) throw new GameError("bad_amount", "Введите сумму", 400);
    const amt = roundCur(amount, from);
    const q = exchangeQuote(from, to, amt, now);
    if (q.usdValue < 0.5) throw new GameError("too_small", "Минимальный обмен — $0.50", 400);
    await debit(tx, p.id, from, amt);
    await credit(tx, p.id, to, q.received);
    await addXp(tx, p.id, XP.exchange);
    await bumpMetric(tx, p.id, "exchanges", 1, now);
    await touchAction(tx, p, now);
    if (to === "USD") await advanceTutorial(tx, p, TUTORIAL.BUY_USD);
    if (to === "SOL") await advanceTutorial(tx, p, TUTORIAL.BUY_SOL);
    return { from, to, spent: amt, received: q.received, rate: q.rate, feeUsd: roundTo(q.feeUsd, 2) };
  });
}

interface TokenLockRow { id: string; ticker: string; price: number; liquidity: number; regime: string; generation: number; holders: number; }

export async function doBuy(tx: Queryable, playerId: number, tokenId: string, solAmount: number, idem: string, now = Date.now()) {
  const p = await lockPlayer(tx, playerId, now);
  return idempotent(tx, p.id, idem, "buy", async () => {
    rateLimit(p, 300, now);
    if (!(solAmount > 0) || !Number.isFinite(solAmount)) throw new GameError("bad_amount", "Введите сумму в SOL", 400);
    const sol = roundCur(solAmount, "SOL");
    const solUsd = usdRates(now).SOL;
    const usd = sol * solUsd;
    if (usd < MIN_TRADE_USD) throw new GameError("too_small", `Минимальная покупка — $${MIN_TRADE_USD}`, 400);
    const [tok] = await tx.query<TokenLockRow>("SELECT id, ticker, price, liquidity, regime, generation, holders FROM tokens WHERE id = $1 FOR UPDATE", [tokenId]);
    if (!tok) throw new GameError("no_token", "Токен не найден", 404);
    if (tok.regime === "rugged") throw new GameError("rugged", "Торги остановлены: токен зарагали", 400);
    await debit(tx, p.id, "SOL", sol);
    const fee = usd * TRADE_FEE;
    const impact = priceImpact(usd, tok.liquidity);
    const execPrice = tok.price * (1 + impact / 2);
    const amount = (usd - fee) / execPrice;
    await tx.query("UPDATE tokens SET price = price * $2, volume_24h = volume_24h + $3, holders = holders + $4 WHERE id = $1", [tok.id, 1 + impact, usd, 1]);
    await tx.query(
      `INSERT INTO positions (player_id, token_id, amount, cost_usd, generation) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (player_id, token_id) DO UPDATE SET amount = positions.amount + $3, cost_usd = positions.cost_usd + $4`,
      [p.id, tok.id, amount, usd, tok.generation],
    );
    await tx.query("UPDATE player_stats SET trades = trades + 1, volume_usd = volume_usd + $2 WHERE player_id = $1", [p.id, usd]);
    await addXp(tx, p.id, XP.buy);
    await bumpMetric(tx, p.id, "buys", 1, now);
    await touchAction(tx, p, now);
    await advanceTutorial(tx, p, TUTORIAL.BUY_TOKEN);
    return { tokenId: tok.id, ticker: tok.ticker, spentSol: sol, usd: roundTo(usd, 2), feeUsd: roundTo(fee, 2), amount, price: execPrice, impact };
  }, { tokenId, amount: solAmount });
}

export async function doSell(tx: Queryable, playerId: number, tokenId: string, fraction: number, idem: string, now = Date.now(), critRoll?: number) {
  const p = await lockPlayer(tx, playerId, now);
  return idempotent(tx, p.id, idem, "sell", async () => {
    rateLimit(p, 300, now);
    if (!(fraction > 0 && fraction <= 1)) throw new GameError("bad_amount", "Выберите долю позиции", 400);
    const tool = toolById(p.equipped_tool) ?? DUMP_TOOLS[0];
    if (p.energy < tool.energyCost) throw new GameError("no_energy", `Нужно ${tool.energyCost} энергии для продажи с ${tool.name}`, 400);
    const [pos] = await tx.query<{ amount: number; cost_usd: number }>("SELECT amount, cost_usd FROM positions WHERE player_id = $1 AND token_id = $2 FOR UPDATE", [p.id, tokenId]);
    if (!pos || pos.amount <= 0) throw new GameError("no_position", "У вас нет этого токена", 400);
    const [tok] = await tx.query<TokenLockRow>("SELECT id, ticker, price, liquidity, regime, generation, holders FROM tokens WHERE id = $1 FOR UPDATE", [tokenId]);
    if (!tok) throw new GameError("no_token", "Токен не найден", 404);
    if (tok.regime === "rugged") throw new GameError("rugged", "Торги остановлены: токен зарагали. Ждите перезапуска", 400);

    // Apply global damage received so far before adding ours, so overkill is computed on fresh state.
    const before = await syncBoss(tx, p.id, displayName(p));

    const amount = fraction >= 0.999 ? pos.amount : pos.amount * fraction;
    const grossUsd = amount * tok.price;
    const impact = priceImpact(grossUsd, tok.liquidity);
    const execPrice = tok.price * (1 - impact / 2);
    const saleUsd = amount * execPrice;
    if (saleUsd < 0.01) throw new GameError("too_small", "Позиция слишком мала для продажи", 400);
    const fee = saleUsd * TRADE_FEE;
    const proceedsSol = roundCur((saleUsd - fee) / usdRates(now).SOL, "SOL");
    const costPart = pos.cost_usd * (amount / pos.amount);
    const pnl = saleUsd - fee - costPart;

    await tx.query("UPDATE tokens SET price = price * $2, volume_24h = volume_24h + $3 WHERE id = $1", [tok.id, 1 - impact, saleUsd]);
    const left = pos.amount - amount;
    if (left <= pos.amount * 1e-9) await tx.query("DELETE FROM positions WHERE player_id = $1 AND token_id = $2", [p.id, tok.id]);
    else await tx.query("UPDATE positions SET amount = $3, cost_usd = cost_usd - $4 WHERE player_id = $1 AND token_id = $2", [p.id, tok.id, left, costPart]);
    await credit(tx, p.id, "SOL", proceedsSol);

    // Combo: sales of at least COMBO_MIN_SALE_USD, at least COMBO_MIN_INTERVAL_MS apart, within COMBO_WINDOW_MS.
    const since = p.last_sell_at ? now - new Date(p.last_sell_at).getTime() : Infinity;
    let combo = p.combo;
    if (saleUsd >= COMBO_MIN_SALE_USD) {
      if (since <= COMBO_WINDOW_MS && since >= COMBO_MIN_INTERVAL_MS) combo += 1;
      else if (since > COMBO_WINDOW_MS) combo = 1;
      else combo = Math.max(1, combo); // too fast: no increase (anti-spam)
    }
    const dmg = computeDamage({
      saleUsd, tool, combo, equipmentTier: p.equipment_tier,
      critRoll: critRoll ?? randomInt(0, 1_000_000) / 1_000_000,
    });
    const ev = await emitDamage(tx, {
      sourcePlayerId: p.id, amount: dmg.amount, sourceType: "sell", sourceEntity: tok.id, crit: dmg.crit, combo, playerName: displayName(p),
    });
    await tx.query("UPDATE players SET energy = energy - $2, combo = $3, last_sell_at = $4 WHERE id = $1", [p.id, tool.energyCost, combo, new Date(now)]);
    await tx.query(
      "UPDATE player_stats SET trades = trades + 1, volume_usd = volume_usd + $2, realized_profit_usd = realized_profit_usd + $3 WHERE player_id = $1",
      [p.id, saleUsd, pnl],
    );
    await addXp(tx, p.id, XP.sellBase + XP.sellBonus(saleUsd));
    await bumpMetric(tx, p.id, "sells", 1, now);
    await bumpMetric(tx, p.id, "sell_usd", saleUsd, now);
    await bumpMetric(tx, p.id, "damage", dmg.amount, now);
    await touchAction(tx, p, now);
    await advanceTutorial(tx, p, TUTORIAL.SELL_TOKEN);
    const after = await syncBoss(tx, p.id, displayName(p));
    return {
      tokenId: tok.id, ticker: tok.ticker, soldAmount: amount, saleUsd: roundTo(saleUsd, 2), feeUsd: roundTo(fee, 2),
      proceedsSol, pnlUsd: roundTo(pnl, 2), roi: costPart > 0 ? pnl / costPart : 0,
      damage: { ...dmg, eventId: ev.eventId, globalTotal: ev.globalTotal, toolId: tool.id, combo },
      defeats: [...before.defeats, ...after.defeats],
    };
  }, { tokenId, amount: fraction });
}

export async function buyEquipment(tx: Queryable, playerId: number, tier: number, idem: string, now = Date.now()) {
  const p = await lockPlayer(tx, playerId, now);
  return idempotent(tx, p.id, idem, "equipment", async () => {
    if (tier !== p.equipment_tier + 1) throw new GameError("bad_tier", "Сначала купите предыдущий уровень оборудования", 400);
    const eq = EQUIPMENT[tier - 1];
    if (!eq) throw new GameError("bad_tier", "Это максимальный уровень", 400);
    if (p.level < eq.unlockLevel) throw new GameError("locked", `Откроется на уровне ${eq.unlockLevel}`, 400);
    await debit(tx, p.id, eq.priceCurrency, eq.price);
    await tx.query("UPDATE players SET equipment_tier = $2 WHERE id = $1", [p.id, tier]);
    await tx.query("INSERT INTO inventory (player_id, item_type, item_id) VALUES ($1,'equipment',$2) ON CONFLICT DO NOTHING", [p.id, eq.id]);
    await addXp(tx, p.id, 20 * tier);
    return { tier, name: eq.name };
  });
}

export async function buyTool(tx: Queryable, playerId: number, toolId: string, idem: string, now = Date.now()) {
  const p = await lockPlayer(tx, playerId, now);
  return idempotent(tx, p.id, idem, "tool", async () => {
    const tool = toolById(toolId);
    if (!tool || tool.priceUsd === null) throw new GameError("not_for_sale", "Этот инструмент не продаётся", 400);
    if (p.level < tool.unlockLevel) throw new GameError("locked", `Откроется на уровне ${tool.unlockLevel}`, 400);
    const owned = await tx.query("SELECT 1 FROM inventory WHERE player_id = $1 AND item_type = 'tool' AND item_id = $2", [p.id, tool.id]);
    if (owned.length) throw new GameError("owned", "Уже есть в инвентаре", 400);
    await debit(tx, p.id, "USD", tool.priceUsd);
    await tx.query("INSERT INTO inventory (player_id, item_type, item_id) VALUES ($1,'tool',$2)", [p.id, tool.id]);
    await tx.query("UPDATE players SET equipped_tool = $2 WHERE id = $1", [p.id, tool.id]);
    return { toolId: tool.id, name: tool.name };
  });
}

export async function equipTool(tx: Queryable, playerId: number, toolId: string, now = Date.now()) {
  const p = await lockPlayer(tx, playerId, now);
  const owned = await tx.query("SELECT 1 FROM inventory WHERE player_id = $1 AND item_type = 'tool' AND item_id = $2", [p.id, toolId]);
  if (!owned.length) throw new GameError("not_owned", "Этого инструмента нет в инвентаре", 400);
  await tx.query("UPDATE players SET equipped_tool = $2 WHERE id = $1", [p.id, toolId]);
  return { toolId };
}

export async function markBossScreenOpened(tx: Queryable, playerId: number) {
  const p = await lockPlayer(tx, playerId);
  await advanceTutorial(tx, p, TUTORIAL.OPEN_BOSS);
  await tx.query("UPDATE boss_defeats SET seen = TRUE WHERE player_id = $1 AND NOT seen", [p.id]);
  return { ok: true };
}

export async function skipTutorial(tx: Queryable, playerId: number) {
  await tx.query("UPDATE players SET tutorial_step = $2 WHERE id = $1", [playerId, TUTORIAL.DONE]);
  return { ok: true };
}

export async function doClaimDaily(tx: Queryable, playerId: number, now = Date.now()) {
  await lockPlayer(tx, playerId, now);
  return claimDaily(tx, playerId, now);
}

export async function doClaimQuest(tx: Queryable, playerId: number, questId: string, now = Date.now()) {
  await lockPlayer(tx, playerId, now);
  return claimQuest(tx, playerId, questId, now);
}

export async function doWear(tx: Queryable, playerId: number, cosmeticId: string, now = Date.now()) {
  const p = await lockPlayer(tx, playerId, now);
  return wearCosmetic(tx, playerId, p.level, cosmeticId);
}

// ---------------- Full state snapshot ----------------
export async function getState(tx: Queryable, playerId: number, sync?: SyncResult, now = Date.now()) {
  const [p] = await tx.query<PlayerRow>("SELECT * FROM players WHERE id = $1", [playerId]);
  const balances = await balancesOf(tx, playerId);
  const [bp] = await tx.query<{ boss_index: number; damage_taken: number; personal_on_boss: number; global_checkpoint: number; boss_started_at: Date }>(
    "SELECT boss_index, damage_taken, personal_on_boss, global_checkpoint, boss_started_at FROM boss_progress WHERE player_id = $1", [playerId]);
  const [stats] = await tx.query<Record<string, number>>("SELECT * FROM player_stats WHERE player_id = $1", [playerId]);
  const inv = await tx.query<{ item_type: string; item_id: string; quantity: number }>("SELECT item_type, item_id, quantity FROM inventory WHERE player_id = $1", [playerId]);
  const positions = await tx.query<{ token_id: string; amount: number; cost_usd: number; price: number; ticker: string; name: string; art: unknown; regime: string }>(
    `SELECT pos.token_id, pos.amount, pos.cost_usd, t.price, t.ticker, t.name, t.art, t.regime
       FROM positions pos JOIN tokens t ON t.id = pos.token_id WHERE pos.player_id = $1 ORDER BY pos.cost_usd DESC`, [playerId]);
  const unseen = await tx.query<{ boss_index: number; reward_usd: number; reward_xp: number; reward_item: string | null; personal_damage: number }>(
    "SELECT boss_index, reward_usd, reward_xp, reward_item, personal_damage FROM boss_defeats WHERE player_id = $1 AND NOT seen ORDER BY boss_index", [playerId]);
  const [g] = await tx.query<{ damage_total: number }>("SELECT damage_total FROM global_state WHERE id = 1");
  const eq = equipmentByTier(p.equipment_tier);
  const info = bossInfo(bp.boss_index);
  const rates = usdRates(now);
  const tool = toolById(p.equipped_tool) ?? DUMP_TOOLS[0];
  const [daily] = await tx.query<{ streak: number; last_claim_at: Date | null }>("SELECT streak, last_claim_at FROM daily_rewards WHERE player_id = $1", [playerId]);
  const quests = await questStatus(tx, playerId, now);
  const cosmetics = await ownedCosmetics(tx, playerId);
  return {
    serverTime: now,
    player: {
      id: p.id, name: displayName(p), firstName: p.first_name, username: p.username, photoUrl: p.photo_url, isGuest: p.is_guest,
      level: p.level, xp: p.xp, xpNext: xpForNextLevel(p.level),
      energy: Math.min(eq.maxEnergy, p.energy + Math.max(0, now - new Date(p.energy_updated_at).getTime()) / ENERGY_REGEN_MS),
      maxEnergy: eq.maxEnergy, energyRegenMs: ENERGY_REGEN_MS,
      combo: p.combo, lastSellAt: p.last_sell_at ? new Date(p.last_sell_at).getTime() : null,
      tutorialStep: p.tutorial_step,
      equipmentTier: p.equipment_tier, equippedTool: tool.id,
      outfit: normalizeOutfit((p as unknown as { outfit: unknown }).outfit),
      passiveRubPerHour: eq.passiveRubPerHour,
    },
    daily: dailyStatus(daily, now),
    quests,
    cosmetics,
    balances,
    rates,
    boss: {
      ...info,
      damageTaken: bp.damage_taken,
      remaining: Math.max(0, info.marketCap - bp.damage_taken),
      personalOnBoss: bp.personal_on_boss,
      checkpoint: bp.global_checkpoint,
      startedAt: new Date(bp.boss_started_at).getTime(),
      next: [1, 2, 3].map((k) => ({ index: bp.boss_index + k, marketCap: bossInfo(bp.boss_index + k).marketCap })),
    },
    globalTotal: g.damage_total,
    stats,
    inventory: {
      tools: inv.filter((i) => i.item_type === "tool").map((i) => i.item_id),
      equipment: inv.filter((i) => i.item_type === "equipment").map((i) => i.item_id),
    },
    positions: positions.map((x) => {
      const value = x.amount * x.price;
      return {
        tokenId: x.token_id, ticker: x.ticker, name: x.name, art: x.art, regime: x.regime, amount: x.amount,
        costUsd: x.cost_usd, valueUsd: value, avgPrice: x.amount > 0 ? x.cost_usd / x.amount : 0,
        pnlUsd: value - x.cost_usd, roi: x.cost_usd > 0 ? value / x.cost_usd - 1 : 0,
      };
    }),
    unseenDefeats: unseen.map((d) => ({ index: d.boss_index, name: bossInfo(d.boss_index).name, rewardUsd: d.reward_usd, rewardXp: d.reward_xp, rewardItem: d.reward_item, personalDamage: d.personal_damage })),
    lastSync: sync ? { applied: sync.applied, defeated: sync.defeats.length } : null,
  };
}
export type GameState = Awaited<ReturnType<typeof getState>>;
