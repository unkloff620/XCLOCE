/*
 * Мини-игры во дворе (правила — content/games.ts): блэкджек и зонк идут партиями, состояние партии лежит в таблице
 * games; апгрейдер — одно действие. Колоду тасует и кости кидает только сервер.
 */
import { GameError, type Queryable } from "../db.ts";
import { addItem, addMoney, grantReward, itemQty, ledger, moscowDay, takeItem, takeMoney, type Ctx, type Granted } from "../core.ts";
import { useItem } from "./shop.ts";
import {
  BJ_PAY, BJ_TITLES, GAME_RULES, ITEM_VALUES, ZONK_DICE, bjOutcome, handValue, isBlackjack, upgradeChanceOf, upgradeMode, upgradeTarget, upgradeValue, zonkHasScore, zonkPrize, zonkScore,
  type BjOutcome, type Card, type GameKind,
} from "../../content/games.ts";
import { itemById } from "../../content/items.ts";
import type { Reward } from "../../content/rewards.ts";

interface BjState { deck: Card[]; player: Card[]; dealer: Card[] }
interface ZonkState { roll: number[]; turn: number; left: number; history: { kept: number[]; points: number }[] }
interface GameRow { id: number; kind: GameKind; paid: boolean; status: "active" | "done"; state: BjState | ZonkState; result: GameResult | null }
interface GameResult { outcome: string; title: string; reward: Granted | null; points?: number }

const isEmpty = (r: Reward) => !r.currencies && !r.items && !r.xp && !r.energy;

async function activeGame(q: Queryable, pid: number, kind: GameKind): Promise<GameRow | null> {
  const [g] = await q.query<GameRow>("SELECT id, kind, paid, status, state, result FROM games WHERE player_id=$1 AND kind=$2 AND status='active' ORDER BY id DESC LIMIT 1", [pid, kind]);
  return g ?? null;
}
async function freeLeft(q: Queryable, pid: number, kind: GameKind, now: number) {
  const [r] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM games WHERE player_id=$1 AND kind=$2 AND day=$3 AND NOT paid", [pid, kind, moscowDay(now)]);
  return Math.max(0, GAME_RULES[kind].freePerDay - r.n);
}

/** What the client may see: the dealer's hole card and the deck stay hidden while the hand is on. */
function viewOf(g: GameRow) {
  if (g.kind === "blackjack") {
    const s = g.state as BjState;
    const open = g.status === "done";
    return {
      id: g.id, kind: g.kind, paid: g.paid, status: g.status, result: g.result,
      player: s.player, dealer: open ? s.dealer : s.dealer.slice(0, 1), dealerHidden: open ? 0 : s.dealer.length - 1,
      playerValue: handValue(s.player), dealerValue: handValue(open ? s.dealer : s.dealer.slice(0, 1)),
    };
  }
  const s = g.state as ZonkState;
  return { id: g.id, kind: g.kind, paid: g.paid, status: g.status, result: g.result, roll: s.roll, turn: s.turn, left: s.left, history: s.history };
}

export async function gamesView(q: Queryable, pid: number, now: number) {
  const out: Record<string, unknown> = {};
  for (const kind of Object.keys(GAME_RULES) as GameKind[]) {
    const g = await activeGame(q, pid, kind);
    out[kind] = { freeLeft: await freeLeft(q, pid, kind, now), freePerDay: GAME_RULES[kind].freePerDay, price: GAME_RULES[kind].price, active: g ? viewOf(g) : null };
  }
  return out as Record<GameKind, { freeLeft: number; freePerDay: number; price: { currency: string; amount: number }; active: ReturnType<typeof viewOf> | null }>;
}

function shuffled(rng: () => number): Card[] {
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
const die = (rng: () => number) => 1 + (Math.floor(rng() * 6) % 6);

async function save(ctx: Ctx, g: GameRow) {
  await ctx.q.query("UPDATE games SET state=$2, status=$3, result=$4, updated_at=$5 WHERE id=$1", [g.id, JSON.stringify(g.state), g.status, g.result ? JSON.stringify(g.result) : null, new Date(ctx.now)]);
}

/** A new hand / a new game: free while the day's free games last, then it costs GAME_RULES[kind].price. */
export async function startGame(ctx: Ctx, kind: GameKind) {
  if (!GAME_RULES[kind]) throw new GameError("bad_game", "Такой игры нет");
  if (await activeGame(ctx.q, ctx.pid, kind)) throw new GameError("game_running", "Сначала доиграй начатую партию");
  const free = (await freeLeft(ctx.q, ctx.pid, kind, ctx.now)) > 0;
  const price = GAME_RULES[kind].price;
  if (!free) await takeMoney(ctx, price.currency, price.amount, `game:${kind}`);
  let state: BjState | ZonkState;
  if (kind === "blackjack") {
    const deck = shuffled(ctx.rng);
    state = { deck, player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!] };
  } else {
    state = { roll: Array.from({ length: ZONK_DICE }, () => die(ctx.rng)), turn: 0, left: ZONK_DICE, history: [] };
  }
  const [row] = await ctx.q.query<{ id: number }>(
    "INSERT INTO games (player_id, kind, day, paid, status, state, created_at, updated_at) VALUES ($1,$2,$3,$4,'active',$5,$6,$6) RETURNING id",
    [ctx.pid, kind, moscowDay(ctx.now), !free, JSON.stringify(state), new Date(ctx.now)],
  );
  const g: GameRow = { id: row.id, kind, paid: !free, status: "active", state, result: null };
  if (kind === "blackjack") {
    const s = state as BjState;
    // a natural on either side ends the hand at once
    if (isBlackjack(s.player) || isBlackjack(s.dealer)) await finishBj(ctx, g);
  } else if (!zonkHasScore((state as ZonkState).roll)) {
    await finishZonk(ctx, g, true);
  }
  return viewOf(g);
}

async function finishBj(ctx: Ctx, g: GameRow) {
  const s = g.state as BjState;
  if (handValue(s.player) <= 21 && !isBlackjack(s.player)) {
    while (handValue(s.dealer) < 17) s.dealer.push(s.deck.pop()!);
  }
  const outcome: BjOutcome = bjOutcome(s.player, s.dealer);
  const pay = BJ_PAY[g.paid ? "paid" : "free"][outcome];
  const reward = isEmpty(pay) ? null : await grantReward(ctx, pay, `game:blackjack:${outcome}`);
  g.status = "done";
  g.result = { outcome, title: BJ_TITLES[outcome], reward };
  await save(ctx, g);
}

export async function bjMove(ctx: Ctx, move: "hit" | "stand") {
  const g = await activeGame(ctx.q, ctx.pid, "blackjack");
  if (!g) throw new GameError("no_game", "Партия не начата");
  const s = g.state as BjState;
  if (move === "hit") {
    s.player.push(s.deck.pop()!);
    if (handValue(s.player) >= 21) await finishBj(ctx, g);
    else await save(ctx, g);
  } else {
    await finishBj(ctx, g);
  }
  return viewOf(g);
}

async function finishZonk(ctx: Ctx, g: GameRow, zonk: boolean) {
  const s = g.state as ZonkState;
  const points = zonk ? 0 : s.turn;
  const pay = zonkPrize(points, g.paid);
  const reward = isEmpty(pay) ? null : await grantReward(ctx, pay, `game:zonk:${points}`);
  g.status = "done";
  g.result = zonk ? { outcome: "zonk", title: "Зонк! Очки сгорели", reward: null, points: 0 } : { outcome: "bank", title: `Забрал ${points} очков`, reward, points };
  await save(ctx, g);
}

/** Keep the chosen dice (they must all score), then roll the rest or take the points. */
export async function zonkMove(ctx: Ctx, pick: number[], then: "roll" | "bank") {
  const g = await activeGame(ctx.q, ctx.pid, "zonk");
  if (!g) throw new GameError("no_game", "Партия не начата");
  const s = g.state as ZonkState;
  const idx = [...new Set(pick)];
  if (!idx.length || idx.length !== pick.length || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= s.roll.length)) throw new GameError("bad_pick", "Выбери кости");
  const kept = idx.map((i) => s.roll[i]);
  const pts = zonkScore(kept);
  if (pts === null) throw new GameError("bad_pick", "Откладывать можно только очковые кости");
  s.turn += pts;
  s.history.push({ kept, points: pts });
  s.left -= kept.length;
  if (s.left <= 0) s.left = ZONK_DICE; // all six scored: roll all six again
  if (then === "bank") {
    s.roll = [];
    await finishZonk(ctx, g, false);
  } else {
    s.roll = Array.from({ length: s.left }, () => die(ctx.rng));
    if (!zonkHasScore(s.roll)) await finishZonk(ctx, g, true);
    else await save(ctx, g);
  }
  return viewOf(g);
}

/* ---------------- upgrader ---------------- */
interface UpRow { id: number; item_id: string; value: number }

/** The player's upgraded things (each one is its own unit with its own price). */
export async function upgradedView(q: Queryable, pid: number) {
  const rows = await q.query<UpRow>("SELECT id, item_id, value FROM upgraded_items WHERE player_id=$1 ORDER BY value DESC, id", [pid]);
  return rows.map((r) => ({ uid: r.id, itemId: r.item_id, value: Number(r.value) }));
}

async function takeUpgraded(ctx: Ctx, uid: number): Promise<UpRow> {
  const [r] = await ctx.q.query<UpRow>("DELETE FROM upgraded_items WHERE id=$1 AND player_id=$2 RETURNING id, item_id, value", [uid, ctx.pid]);
  if (!r) throw new GameError("no_item", "Этой улучшенной вещи уже нет");
  await ledger(ctx, "upgraded", r.item_id, -1, `up:${uid}:${r.value}`);
  return r;
}

/**
 * Upgrader: the stake is qty of a plain thing or one upgraded thing; the mode is ×2/×4/×8 or a chance 15/30/70%.
 * A win gives an upgraded thing worth stake × multiplier; the stake is gone either way.
 */
export async function upgrade(ctx: Ctx, stake: { item?: string; qty?: number; uid?: number }, modeId: string) {
  const mode = upgradeMode(modeId);
  if (!mode) throw new GameError("bad_upgrade", "Выбери множитель или шанс");
  let value: number;
  let from: string;
  if (stake.uid !== undefined) {
    const r = await takeUpgraded(ctx, stake.uid);
    value = Number(r.value);
    from = r.item_id;
  } else {
    const id = stake.item ?? "";
    const qty = stake.qty ?? 1;
    if (!ITEM_VALUES[id]) throw new GameError("bad_upgrade", "Это нельзя поставить");
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) throw new GameError("bad_qty", "Некорректное количество");
    if ((await itemQty(ctx.q, ctx.pid, id)) < qty) throw new GameError("no_item", `Не хватает: ${itemById(id)?.name ?? id}`);
    await takeItem(ctx, id, qty, `upgrade:${mode.id}`);
    value = ITEM_VALUES[id] * qty;
    from = id;
  }
  const chance = upgradeChanceOf(mode.mult);
  const newValue = upgradeValue(value, mode.mult);
  const target = upgradeTarget(newValue);
  const roll = ctx.rng();
  const won = roll < chance;
  let uid: number | null = null;
  if (won) {
    const [row] = await ctx.q.query<{ id: number }>("INSERT INTO upgraded_items (player_id, item_id, value, created_at) VALUES ($1,$2,$3,$4) RETURNING id", [ctx.pid, target, newValue, new Date(ctx.now)]);
    uid = row.id;
    await ledger(ctx, "upgraded", target, 1, `up:${uid}:${newValue}`);
  }
  return { won, chance, roll: Math.round(roll * 10000) / 10000, mode: mode.id, from, stakeValue: value, value: newValue, target, uid };
}

/** An upgraded thing sold for its own price. */
export async function sellUpgraded(ctx: Ctx, uid: number) {
  const r = await takeUpgraded(ctx, uid);
  const got = await addMoney(ctx, "RUB", Number(r.value), `sell-up:${r.item_id}`);
  return { uid, itemId: r.item_id, got };
}

/** Back to a plain thing: a weapon goes into the fight stack, an energy drink is drunk right away. */
export async function takeUpgradedOut(ctx: Ctx, uid: number, use: boolean) {
  const r = await takeUpgraded(ctx, uid);
  const added = await addItem(ctx, r.item_id, 1, `up-take:${uid}`);
  if (added < 1) throw new GameError("stack_full", "Нет места в инвентаре");
  const def = itemById(r.item_id);
  if (use && def?.use) return { uid, itemId: r.item_id, used: await useItem(ctx, r.item_id) };
  return { uid, itemId: r.item_id };
}
