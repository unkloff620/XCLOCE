/*
 * Мини-игры во дворе (правила — content/games.ts): зонк идёт партиями, состояние партии лежит в таблице games;
 * покер и апгрейдер — одно действие. Блэкджек — общий стол, он в systems/blackjack.ts. Колоду тасует и кости кидает
 * только сервер.
 */
import { GameError, type Queryable } from "../db.ts";
import { addGameWeekly } from "./minigame-extras.ts";
import { duelScore } from "./duels.ts";
import { addItem, addMoney, grantReward, itemQty, ledger, moscowDay, takeItem, takeMoney, type Ctx, type Granted } from "../core.ts";
import { useItem } from "./shop.ts";
import { UPGRADE_RULES, POKER_RULES, POKER_CHIP, pokerCheats, pokerHand, pokerHandDef, pokerLevel, pokerPay,
  GAME_RULES, ITEM_VALUES, ZONK_BANK_MIN, ZONK_DICE, ZONK_FAIL_XP, ZONK_LEVELS, ZONK_ROUNDS, upgradeChanceOf, upgradeMode, upgradeTarget, upgradeValue,
  zonkHasScore, zonkLevelDef, zonkScore, zonkXpLevel,
  type Card, type GameKind,
} from "../../content/games.ts";
import { itemById } from "../../content/items.ts";
import type { Reward } from "../../content/rewards.ts";

/** round: the attempt now (1…ZONK_ROUNDS); total: points written down; last: how the previous attempt ended */
/** level: the difficulty (ZONK_LEVELS), target: the points to reach; old games (before the levels) have neither */
interface ZonkState { roll: number[]; turn: number; left: number; history: { kept: number[]; points: number }[]; round?: number; total?: number; last?: { points: number; zonk: boolean; roll?: number[] } | null; scores?: { points: number; zonk: boolean }[]; level?: number; target?: number;
  /** a zonk duel's game (systems/duels.ts): DUEL_ROUNDS attempts, no target, the points go to the duel */
  duel?: number; rounds?: number }
interface GameRow { id: number; kind: GameKind; paid: boolean; status: "active" | "done"; state: ZonkState; result: GameResult | null }
interface GameResult { outcome: string; title: string; reward: Granted | null; points?: number; won?: boolean; xp?: number; duel?: number }

const isEmpty = (r: Reward) => !r.currencies && !r.items && !r.xp && !r.energy;

async function activeGame(q: Queryable, pid: number, kind: GameKind): Promise<GameRow | null> {
  const [g] = await q.query<GameRow>("SELECT id, kind, paid, status, state, result FROM games WHERE player_id=$1 AND kind=$2 AND status='active' ORDER BY id DESC LIMIT 1", [pid, kind]);
  return g ?? null;
}
async function freeLeft(q: Queryable, pid: number, kind: GameKind, now: number) {
  const [r] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM games WHERE player_id=$1 AND kind=$2 AND day=$3 AND NOT paid", [pid, kind, moscowDay(now)]);
  return Math.max(0, GAME_RULES[kind].freePerDay - r.n);
}

/** What the client sees of a zonk game. */
function viewOf(g: GameRow) {
  const s = g.state as ZonkState;
  return { id: g.id, kind: g.kind, paid: g.paid, status: g.status, result: g.result, roll: s.roll, turn: s.turn, left: s.left, history: s.history, round: s.round ?? 1, rounds: s.rounds ?? ZONK_ROUNDS, total: s.total ?? 0, last: s.last ?? null, scores: s.scores ?? [], level: s.level ?? 1, target: s.target ?? zonkLevelDef(1)!.target, duel: s.duel ?? null };
}

/** the best zonk game of a Moscow day (all levels): who and how many points */
async function zonkRecord(q: Queryable, day: string) {
  const [r] = await q.query<{ points: number; id: number; display_name: string; photo_url: string | null }>(
    `SELECT (g.result->>'points')::int AS points, p.id, p.display_name, p.photo_url FROM games g JOIN players p ON p.id = g.player_id
     WHERE g.kind='zonk' AND g.day=$1 AND g.status='done' AND g.result->>'points' IS NOT NULL AND (g.result->>'points')::int > 0 AND g.result->>'duel' IS NULL
     ORDER BY (g.result->>'points')::int DESC, g.updated_at ASC LIMIT 1`, [day]);
  return r ? { points: Number(r.points), playerId: r.id, name: r.display_name, photo: r.photo_url } : null;
}

export async function gamesView(q: Queryable, pid: number, now: number) {
  const g = await activeGame(q, pid, "zonk");
  const [p] = await q.query<{ zonk_xp: number }>("SELECT zonk_xp FROM players WHERE id=$1", [pid]);
  const xp = Number(p?.zonk_xp ?? 0);
  // the record of today; early in the day, before anyone has played — yesterday's
  const today = moscowDay(now);
  let record = await zonkRecord(q, today);
  let recordDay: "today" | "yesterday" = "today";
  if (!record) { record = await zonkRecord(q, moscowDay(now - 24 * 3600 * 1000)); recordDay = "yesterday"; }
  return {
    zonk: {
      freeLeft: await freeLeft(q, pid, "zonk", now), freePerDay: GAME_RULES.zonk.freePerDay, price: GAME_RULES.zonk.price,
      levels: ZONK_LEVELS, bankMin: ZONK_BANK_MIN, xp, ...zonkXpLevel(xp), record: record ? { ...record, day: recordDay } : null,
      active: g ? viewOf(g) : null,
    },
  };
}

export function shuffled(rng: () => number, decks = 1): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < decks; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ r, s });
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

/** A new game at a difficulty level: its entry price (the first level-1 game of the day is free). */
export async function startGame(ctx: Ctx, kind: GameKind, level = 1) {
  if (!GAME_RULES[kind]) throw new GameError("bad_game", "Такой игры нет");
  const def = zonkLevelDef(level);
  if (!def) throw new GameError("bad_level", "Такого уровня нет");
  if (await activeGame(ctx.q, ctx.pid, kind)) throw new GameError("game_running", "Сначала доиграй начатую партию");
  const free = def.level === 1 && (await freeLeft(ctx.q, ctx.pid, kind, ctx.now)) > 0;
  if (!free) await takeMoney(ctx, def.entry.currency, def.entry.amount, `game:${kind}:${def.level}`);
  const state: ZonkState = { roll: Array.from({ length: ZONK_DICE }, () => die(ctx.rng)), turn: 0, left: ZONK_DICE, history: [], round: 1, total: 0, last: null, level: def.level, target: def.target };
  const [row] = await ctx.q.query<{ id: number }>(
    "INSERT INTO games (player_id, kind, day, paid, status, state, created_at, updated_at) VALUES ($1,$2,$3,$4,'active',$5,$6,$6) RETURNING id",
    [ctx.pid, kind, moscowDay(ctx.now), !free, JSON.stringify(state), new Date(ctx.now)],
  );
  const g: GameRow = { id: row.id, kind, paid: !free, status: "active", state, result: null };
  if (!zonkHasScore(state.roll)) {
    state.last = { points: 0, zonk: true, roll: state.roll };
    state.scores = [{ points: 0, zonk: true }];
    await nextZonkRound(ctx, g);
  }
  return viewOf(g);
}

/** A duel's zonk game for this player (systems/duels.ts checks the duel): DUEL_ROUNDS attempts, no target. */
export async function startDuelGame(ctx: Ctx, duelId: number, rounds: number) {
  if (await activeGame(ctx.q, ctx.pid, "zonk")) throw new GameError("game_running", "Сначала доиграй начатую партию");
  const state: ZonkState = { roll: Array.from({ length: ZONK_DICE }, () => die(ctx.rng)), turn: 0, left: ZONK_DICE, history: [], round: 1, total: 0, last: null, level: 1, target: 1e9, duel: duelId, rounds };
  const [row] = await ctx.q.query<{ id: number }>(
    "INSERT INTO games (player_id, kind, day, paid, status, state, created_at, updated_at) VALUES ($1,'zonk',$2,true,'active',$3,$4,$4) RETURNING id",
    [ctx.pid, moscowDay(ctx.now), JSON.stringify(state), new Date(ctx.now)],
  );
  const g: GameRow = { id: row.id, kind: "zonk", paid: true, status: "active", state, result: null };
  if (!zonkHasScore(state.roll)) {
    state.last = { points: 0, zonk: true, roll: state.roll };
    state.scores = [{ points: 0, zonk: true }];
    await nextZonkRound(ctx, g);
  }
  return { game: viewOf(g), gameId: row.id };
}

/** The game is over: the target reached (a win), or all attempts spent / given up (the small consolation). */
async function finishZonk(ctx: Ctx, g: GameRow, gaveUp = false) {
  const s = g.state as ZonkState;
  if (s.duel) {
    // a duel game: no level prize — the points go to the duel (the pot is paid when both have played)
    const points = gaveUp ? 0 : s.total ?? 0;
    await ctx.q.query("UPDATE players SET zonk_xp = zonk_xp + $2 WHERE id=$1", [ctx.pid, ZONK_FAIL_XP]);
    await addGameWeekly(ctx, "zonk", ZONK_FAIL_XP);
    s.roll = [];
    g.status = "done";
    g.result = { outcome: "duel", title: gaveUp ? "Дуэль: сдался" : `Дуэль: ${points} очков`, reward: null, points, xp: ZONK_FAIL_XP, duel: s.duel };
    await save(ctx, g);
    await duelScore(ctx, s.duel, points);
    return;
  }
  const def = zonkLevelDef(s.level ?? 1)!;
  const target = s.target ?? def.target;
  const points = s.total ?? 0;
  const won = !gaveUp && points >= target;
  const pay = won ? def.win : def.fail;
  const xp = won ? def.winXp : ZONK_FAIL_XP;
  const reward = isEmpty(pay) ? null : await grantReward(ctx, pay, `game:zonk:${def.level}:${won ? "win" : "fail"}:${points}`);
  await ctx.q.query("UPDATE players SET zonk_xp = zonk_xp + $2 WHERE id=$1", [ctx.pid, xp]);
  await addGameWeekly(ctx, "zonk", xp);
  s.roll = [];
  g.status = "done";
  g.result = won
    ? { outcome: "win", title: `Уровень ${def.level} пройден: ${points} из ${target}`, reward, points, won, xp }
    : { outcome: gaveUp ? "gave_up" : points > 0 ? "short" : "zonk", title: gaveUp ? `Сдался на ${points} из ${target}` : `Не хватило: ${points} из ${target}`, reward, points, won, xp };
  await save(ctx, g);
}

/** The next attempt (a fresh roll of six); a roll without points burns that attempt at once. After the last one — the end. */
async function nextZonkRound(ctx: Ctx, g: GameRow) {
  const s = g.state as ZonkState;
  for (;;) {
    s.round = (s.round ?? 1) + 1;
    s.turn = 0;
    s.left = ZONK_DICE;
    s.history = [];
    if (s.round > (s.rounds ?? ZONK_ROUNDS)) {
      s.round = s.rounds ?? ZONK_ROUNDS;
      return finishZonk(ctx, g);
    }
    s.roll = Array.from({ length: ZONK_DICE }, () => die(ctx.rng));
    if (zonkHasScore(s.roll)) return save(ctx, g);
    // a roll without points: the attempt burns; the dice that fell stay in «last» so the board can show them
    s.last = { points: 0, zonk: true, roll: s.roll };
    s.scores = [...(s.scores ?? []), { points: 0, zonk: true }];
  }
}

/** Keep the chosen dice (they must all score), then roll the rest or write the attempt's points down. */
export async function zonkMove(ctx: Ctx, pick: number[], then: "roll" | "bank") {
  const g = await activeGame(ctx.q, ctx.pid, "zonk");
  if (!g) throw new GameError("no_game", "Партия не начата");
  const s = g.state as ZonkState;
  const idx = [...new Set(pick)];
  if (!idx.length || idx.length !== pick.length || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= s.roll.length)) throw new GameError("bad_pick", "Выбери кости");
  const kept = idx.map((i) => s.roll[i]);
  const pts = zonkScore(kept);
  if (pts === null) throw new GameError("bad_pick", "Откладывать можно только очковые кости");
  if (then === "bank" && s.turn + pts < ZONK_BANK_MIN) throw new GameError("bank_min", `Сохранить можно от ${ZONK_BANK_MIN} очков — бросай дальше`);
  s.turn += pts;
  s.history.push({ kept, points: pts });
  s.left -= kept.length;
  if (s.left <= 0) s.left = ZONK_DICE; // all six scored: roll all six again
  if (then === "bank") {
    s.total = (s.total ?? 0) + s.turn;
    s.last = { points: s.turn, zonk: false };
    s.scores = [...(s.scores ?? []), { points: s.turn, zonk: false }];
    // the target reached: the game ends at once with the win
    if ((s.total ?? 0) >= (s.target ?? zonkLevelDef(s.level ?? 1)!.target)) await finishZonk(ctx, g);
    else await nextZonkRound(ctx, g);
  } else {
    s.roll = Array.from({ length: s.left }, () => die(ctx.rng));
    if (!zonkHasScore(s.roll)) {
      s.last = { points: s.turn, zonk: true, roll: s.roll };
      s.scores = [...(s.scores ?? []), { points: s.turn, zonk: true }];
      await nextZonkRound(ctx, g);
    } else await save(ctx, g);
  }
  return viewOf(g);
}

/** «Сдаться»: the game ends now as not passed (the consolation and 1 xp). */
export async function zonkGiveUp(ctx: Ctx) {
  const g = await activeGame(ctx.q, ctx.pid, "zonk");
  if (!g) throw new GameError("no_game", "Партия не начата");
  await finishZonk(ctx, g, true);
  return viewOf(g);
}

/* ---------------- upgrader ---------------- */
interface UpRow { id: number; item_id: string; value: number }

/** The player's upgraded things (each one is its own unit with its own price). */
/** free upgrader spins left today, and the price of a paid one */
export async function upgradeSpinsView(q: Queryable, pid: number, now: number) {
  const [r] = await q.query<{ n: number }>("SELECT n FROM upgrade_spins WHERE player_id=$1 AND day=$2", [pid, moscowDay(now)]);
  return { freeLeft: Math.max(0, UPGRADE_RULES.freePerDay - Number(r?.n ?? 0)), freePerDay: UPGRADE_RULES.freePerDay, price: UPGRADE_RULES.price };
}

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
  // the spin itself: free while the day's free spins last, then UPGRADE_RULES.price
  const day = moscowDay(ctx.now);
  const [sp] = await ctx.q.query<{ n: number }>("SELECT n FROM upgrade_spins WHERE player_id=$1 AND day=$2 FOR UPDATE", [ctx.pid, day]);
  const paid = Number(sp?.n ?? 0) >= UPGRADE_RULES.freePerDay;
  if (paid) await takeMoney(ctx, UPGRADE_RULES.price.currency, UPGRADE_RULES.price.amount, "upgrade:spin");
  await ctx.q.query(
    "INSERT INTO upgrade_spins (player_id, day, n) VALUES ($1,$2,1) ON CONFLICT (player_id, day) DO UPDATE SET n = upgrade_spins.n + 1",
    [ctx.pid, day],
  );
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
  return { won, chance, roll: Math.round(roll * 10000) / 10000, mode: mode.id, from, stakeValue: value, value: newValue, target, uid, paid };
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

/* ---------------- poker ---------------- */
async function pokerPlaysToday(q: Queryable, pid: number, now: number) {
  const [r] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM games WHERE player_id=$1 AND kind='poker' AND day=$2", [pid, moscowDay(now)]);
  return Number(r?.n ?? 0);
}

interface PokerState { cards: Card[]; deck: Card[]; swaps: number; swapped: number[] }

async function activePoker(q: Queryable, pid: number) {
  const [g] = await q.query<{ id: number; state: PokerState }>("SELECT id, state FROM games WHERE player_id=$1 AND kind='poker' AND status='active' ORDER BY id DESC LIMIT 1", [pid]);
  return g ?? null;
}
/** a hand still waiting for its swaps: the cards, the swaps left and what they make now */
function pokerDrawView(id: number, st: PokerState) {
  const { hand, used } = pokerHand(st.cards);
  return { id, cards: st.cards, swapsLeft: st.swaps, swapped: st.swapped, hand, used };
}

/** hands left today, the price, the poker experience and level, the swaps the level gives, a hand not finished yet */
export async function pokerView(q: Queryable, pid: number, now: number) {
  const [p] = await q.query<{ poker_xp: number }>("SELECT poker_xp FROM players WHERE id=$1", [pid]);
  const xp = Number(p?.poker_xp ?? 0);
  const played = await pokerPlaysToday(q, pid, now);
  const lv = pokerLevel(xp);
  const open = await activePoker(q, pid);
  // perDay 0 would mean no daily limit
  const left = POKER_RULES.perDay > 0 ? Math.max(0, POKER_RULES.perDay - played) : 9999;
  const chips = await itemQty(q, pid, POKER_CHIP);
  return { left, played, perDay: POKER_RULES.perDay, price: POKER_RULES.price, chips, xp, ...lv, cheats: pokerCheats(lv.level), active: open ? pokerDrawView(open.id, open.state) : null };
}

/** The hand is counted: the combination pays (more with the poker level) and gives poker xp. */
async function settlePoker(ctx: Ctx, gameId: number | null, cards: Card[], swapped: number[]) {
  const [p] = await ctx.q.query<{ poker_xp: number }>("SELECT poker_xp FROM players WHERE id=$1", [ctx.pid]);
  const { hand, used } = pokerHand(cards);
  const def = pokerHandDef(hand);
  const before = pokerLevel(Number(p?.poker_xp ?? 0));
  const pay = pokerPay(hand, before.level);
  const reward = isEmpty(pay) ? null : await grantReward(ctx, pay, `game:poker:${hand}`);
  const [u] = await ctx.q.query<{ poker_xp: number }>("UPDATE players SET poker_xp = poker_xp + $2 WHERE id=$1 RETURNING poker_xp", [ctx.pid, def.xp]);
  await addGameWeekly(ctx, "poker", def.xp);
  const after = pokerLevel(Number(u.poker_xp));
  const result: GameResult = { outcome: hand, title: def.name, reward };
  if (gameId === null) {
    await ctx.q.query(
      "INSERT INTO games (player_id, kind, day, paid, status, state, result, created_at, updated_at) VALUES ($1,'poker',$2,true,'done',$3,$4,$5,$5)",
      [ctx.pid, moscowDay(ctx.now), JSON.stringify({ cards }), JSON.stringify(result), new Date(ctx.now)],
    );
  } else {
    await ctx.q.query("UPDATE games SET status='done', state=$2, result=$3, updated_at=$4 WHERE id=$1", [gameId, JSON.stringify({ cards, swapped }), JSON.stringify(result), new Date(ctx.now)]);
  }
  return { kind: "poker" as const, phase: "done" as const, cards, swapped, swapsLeft: 0, hand, used, title: def.name, reward, gainedXp: def.xp, levelUp: after.level > before.level, poker: await pokerView(ctx.q, ctx.pid, ctx.now) };
}

/**
 * One paid hand: five cards at once. From poker level 20 the hand waits for the swaps (poker_swap / poker_stand);
 * below it the combination is counted right away.
 */
export async function playPoker(ctx: Ctx, chip = false) {
  // one hand at a time per player, so the daily limit holds
  const [p] = await ctx.q.query<{ poker_xp: number }>("SELECT poker_xp FROM players WHERE id=$1 FOR UPDATE", [ctx.pid]);
  if (await activePoker(ctx.q, ctx.pid)) throw new GameError("poker_open", "Сначала доиграй раздачу");
  if (POKER_RULES.perDay > 0 && (await pokerPlaysToday(ctx.q, ctx.pid, ctx.now)) >= POKER_RULES.perDay) throw new GameError("poker_limit", `На сегодня все ${POKER_RULES.perDay} раздач сыграны`);
  // a «Фишка» from the yard pays for the hand instead of the money
  if (chip) {
    if ((await itemQty(ctx.q, ctx.pid, POKER_CHIP)) <= 0) throw new GameError("no_chip", "Фишек нет — их находят во дворе");
    await takeItem(ctx, POKER_CHIP, 1, "game:poker");
  } else await takeMoney(ctx, POKER_RULES.price.currency, POKER_RULES.price.amount, "game:poker");
  const deck = shuffled(ctx.rng);
  const cards = deck.slice(0, 5);
  const swaps = pokerCheats(pokerLevel(Number(p?.poker_xp ?? 0)).level);
  if (swaps <= 0) return settlePoker(ctx, null, cards, []);
  const st: PokerState = { cards, deck: deck.slice(5, 5 + swaps), swaps, swapped: [] };
  const [row] = await ctx.q.query<{ id: number }>(
    "INSERT INTO games (player_id, kind, day, paid, status, state, created_at, updated_at) VALUES ($1,'poker',$2,true,'active',$3,$4,$4) RETURNING id",
    [ctx.pid, moscowDay(ctx.now), JSON.stringify(st), new Date(ctx.now)],
  );
  return { kind: "poker" as const, phase: "draw" as const, ...pokerDrawView(row.id, st), poker: await pokerView(ctx.q, ctx.pid, ctx.now) };
}

/** Шулерство: the card at `index` goes, the next one from the deck takes its place; the hand is counted by poker_stand. */
export async function pokerSwap(ctx: Ctx, index: number) {
  await ctx.q.query("SELECT id FROM players WHERE id=$1 FOR UPDATE", [ctx.pid]);
  const g = await activePoker(ctx.q, ctx.pid);
  if (!g) throw new GameError("no_game", "Раздача не начата");
  const st = g.state;
  if (!Number.isInteger(index) || index < 0 || index >= st.cards.length) throw new GameError("bad_card", "Выбери карту");
  if (st.swaps <= 0 || !st.deck.length) throw new GameError("no_swaps", "Замен больше нет");
  st.cards = st.cards.map((c, i) => (i === index ? st.deck[0] : c));
  st.deck = st.deck.slice(1);
  st.swaps -= 1;
  st.swapped = [...st.swapped, index];
  // even the last swap does not count the hand: the player sees the new card first and opens with poker_stand
  await ctx.q.query("UPDATE games SET state=$2, updated_at=$3 WHERE id=$1", [g.id, JSON.stringify(st), new Date(ctx.now)]);
  return { kind: "poker" as const, phase: "draw" as const, ...pokerDrawView(g.id, st), poker: await pokerView(ctx.q, ctx.pid, ctx.now) };
}

/** Keep the cards as they are: the hand is counted. */
export async function pokerStand(ctx: Ctx) {
  await ctx.q.query("SELECT id FROM players WHERE id=$1 FOR UPDATE", [ctx.pid]);
  const g = await activePoker(ctx.q, ctx.pid);
  if (!g) throw new GameError("no_game", "Раздача не начата");
  return settlePoker(ctx, g.id, g.state.cards, g.state.swapped);
}
