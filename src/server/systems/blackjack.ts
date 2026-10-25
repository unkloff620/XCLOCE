/*
 * Стол блэкджека во дворе (правила и выплаты — content/games.ts). Стол — строка bj_tables, всё про раздачу лежит в её
 * state; кто где сидит — bj_seats (один стол на игрока), приглашения — bj_invites. Любое действие и опрос стола
 * сначала блокируют строку стола (порядок блокировок: игрок → стол → кошельки), потом «догоняют» время: если
 * игрок не походил за BJ_TURN_MS, его рука стоит; если после первой ставки прошло BJ_BET_MS — раздача тем, кто
 * поставил. Выигрыши начисляются сразу всем сидящим (деньги в кошельки, без блокировки чужих игроков).
 */
import { GameError, type Queryable } from "../db.ts";
import { addMoney, moscowDay, takeMoney, type Ctx } from "../core.ts";
import { schedule } from "./notify.ts";
import { shuffled } from "./games.ts";
import { addBjDaily, addGameWeekly } from "./minigame-extras.ts";
import { questTick } from "./quests.ts";
import {
  BJ_BET, BJ_BET_MS, BJ_FREE, BJ_SHOW_MS, BJ_INS_MS, BJ_INS_PAY, bjInsurance, BJ_MAX_HANDS, BJ_RETURN, BJ_SEATS, BJ_SIDE_MAX, BJ_TITLES, BJ_TURN_MS, PP_PAY, T3_PAY,
  bjOutcome, canSplitCards, handValue, isBlackjack, perfectPairs, twentyOnePlus3,
  type BjOutcome, type Card, type PairHit, type T3Hit,
} from "../../content/games.ts";

/** a dealt card: n — the deal counter of the table, so clients animate cards in the order they came out */
export interface BjCard extends Card { n: number }
export interface BjHand { cards: BjCard[]; bet: number; doubled?: boolean; split?: boolean; done: boolean; outcome?: BjOutcome; pay?: number }
export interface BjSeat {
  pid: number; name: string;
  /** the stake for the next deal (kept as the default for the round after) */
  bet: number; pp: number; t3: number; free: boolean;
  /** the stake is on the table for the next deal */
  ready: boolean;
  hands: BjHand[];
  side: { pp: PairHit | null; t3: T3Hit | null; pay: number } | null;
  /** what the last round gave back in total (stakes included) and what it cost */
  won?: number; staked?: number;
  /** got up during a hand: the seat goes once the hand is paid */
  left?: boolean;
  /** the last time this player looked at the table (the window polls it); gone quiet for SEAT_IDLE_MS — he got up */
  seen?: number;
  /** insurance against the dealer's ace: undefined — not offered, null — not answered yet, 0 — no, > 0 — the amount */
  ins?: number | null;
  /** what the insurance paid back (stake included) */
  insPay?: number;
}
export interface BjState {
  seats: (BjSeat | null)[];
  dealer: BjCard[];
  holeOpen: boolean;
  shoe: Card[];
  n: number;
  phase: "betting" | "insurance" | "playing";
  turn: { seat: number; hand: number } | null;
  deadline: number | null;
  round: number;
  /** the last round has been paid (its results stay on the table till clearAt) */
  settled: boolean;
  /** when the paid round's cards and stakes leave the table; the betting window (BJ_BET_MS) starts then */
  clearAt?: number | null;
}
interface TableRow { id: number; host_id: number; state: BjState }

const SHOE_DECKS = 6;
const INVITE_MS = 15 * 60_000;
/** a player whose window has not polled the table for this long has left it (closed the game, the app) */
const SEAT_IDLE_MS = 40_000;

const asCtx = (ctx: Ctx, pid: number): Ctx => ({ ...ctx, pid });

async function mySeatRow(q: Queryable, pid: number) {
  const [r] = await q.query<{ table_id: number; seat: number }>("SELECT table_id, seat FROM bj_seats WHERE player_id=$1", [pid]);
  return r ?? null;
}

async function lockTable(ctx: Ctx, id: number): Promise<TableRow | null> {
  const [t] = await ctx.q.query<TableRow>("SELECT id, host_id, state FROM bj_tables WHERE id=$1 FOR UPDATE", [id]);
  return t ?? null;
}
async function saveTable(ctx: Ctx, t: TableRow) {
  await ctx.q.query("UPDATE bj_tables SET state=$2, updated_at=$3 WHERE id=$1", [t.id, JSON.stringify(t.state), new Date(ctx.now)]);
}

async function freeUsed(q: Queryable, pid: number, now: number) {
  const [r] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM games WHERE player_id=$1 AND kind='bj_free' AND day=$2", [pid, moscowDay(now)]);
  return Number(r?.n ?? 0);
}

function draw(s: BjState, rng: () => number): BjCard {
  if (!s.shoe.length) s.shoe = shuffled(rng, SHOE_DECKS);
  const c = s.shoe.pop()!;
  s.n += 1;
  return { r: c.r, s: c.s, n: s.n };
}

const sitting = (s: BjState) => s.seats.filter((x): x is BjSeat => !!x);

/* ---------------- the round ---------------- */

/** Cards for everyone who put a stake down: two each, the dealer two (one face down). */
function deal(ctx: Ctx, t: TableRow) {
  const s = t.state;
  if (s.shoe.length < 60) s.shoe = shuffled(ctx.rng, SHOE_DECKS);
  s.dealer = [];
  s.holeOpen = false;
  s.round += 1;
  s.settled = false;
  for (const seat of sitting(s)) {
    seat.hands = seat.ready ? [{ cards: [], bet: seat.free ? BJ_FREE.bet : seat.bet, done: false }] : [];
    seat.side = null;
    seat.won = undefined;
    seat.ins = undefined;
    seat.insPay = undefined;
    seat.staked = seat.ready ? (seat.free ? 0 : seat.bet) + seat.pp + seat.t3 : undefined;
  }
  const order = s.seats.map((x, i) => (x && x.hands.length ? i : -1)).filter((i) => i >= 0);
  for (let k = 0; k < 2; k++) {
    for (const i of order) s.seats[i]!.hands[0].cards.push(draw(s, ctx.rng));
    s.dealer.push(draw(s, ctx.rng));
  }
  s.phase = "playing";
  return order;
}

/** Side bets are paid as soon as the cards are out. */
async function paySides(ctx: Ctx, t: TableRow) {
  const s = t.state;
  for (const seat of sitting(s)) {
    if (!seat.ready || !seat.hands.length) continue;
    const [a, b] = seat.hands[0].cards;
    const pp = seat.pp > 0 ? perfectPairs(a, b) : null;
    const t3 = seat.t3 > 0 ? twentyOnePlus3(a, b, s.dealer[0]) : null;
    let pay = 0;
    if (pp) pay += seat.pp * (PP_PAY[pp] + 1);
    if (t3) pay += seat.t3 * (T3_PAY[t3] + 1);
    seat.side = { pp, t3, pay };
    if (pay > 0) await addMoney(asCtx(ctx, seat.pid), "USD", pay, "bj:side");
  }
}

/** The next hand to play after (seat, hand), in seat order; null when everyone is done. */
function nextTurn(s: BjState, from: { seat: number; hand: number } | null) {
  for (let i = from ? from.seat : 0; i < s.seats.length; i++) {
    const seat = s.seats[i];
    if (!seat) continue;
    for (let h = from && i === from.seat ? from.hand : 0; h < seat.hands.length; h++) {
      if (!seat.hands[h].done) return { seat: i, hand: h };
    }
  }
  return null;
}

/** Moves on to the next hand; when there is none, the dealer plays and the round is paid. */
async function advance(ctx: Ctx, t: TableRow, base: number) {
  const s = t.state;
  const next = nextTurn(s, s.turn);
  if (next) {
    s.turn = next;
    s.deadline = base + BJ_TURN_MS;
    return;
  }
  await finishRound(ctx, t);
}

async function finishRound(ctx: Ctx, t: TableRow) {
  const s = t.state;
  s.turn = null;
  s.deadline = null;
  s.holeOpen = true;
  const hands = sitting(s).flatMap((x) => x.hands);
  // the dealer draws only when someone still stands against him
  const live = hands.some((h) => handValue(h.cards) <= 21 && !(isBlackjack(h.cards) && !h.split));
  if (live && !isBlackjack(s.dealer)) while (handValue(s.dealer) < 17) s.dealer.push(draw(s, ctx.rng));
  for (const seat of sitting(s)) {
    if (!seat.hands.length) continue;
    let won = (seat.side?.pay ?? 0) + (seat.insPay ?? 0);
    for (const h of seat.hands) {
      h.done = true;
      h.outcome = bjOutcome(h.cards, s.dealer, !!h.split);
      h.pay = seat.free ? Math.max(0, BJ_RETURN[h.outcome] - 1) * h.bet : BJ_RETURN[h.outcome] * h.bet;
      h.pay = Math.round(h.pay * 100) / 100;
      won += h.pay;
      if (h.pay > 0) await addMoney(asCtx(ctx, seat.pid), "USD", h.pay, `bj:${h.outcome}`);
    }
    seat.won = Math.round(won * 100) / 100;
    // the weekly blackjack rating counts the winnings of the round (paid out minus staked)
    await addGameWeekly(asCtx(ctx, seat.pid), "bj", seat.won - (seat.staked ?? 0));
    await addBjDaily(asCtx(ctx, seat.pid), seat.won - (seat.staked ?? 0));
    await questTick(asCtx(ctx, seat.pid), "bj", 1);
  }
  for (const seat of sitting(s)) {
    seat.ready = false;
    if (seat.free) seat.free = false;
  }
  s.seats = s.seats.map((x) => (x && x.left ? null : x));
  s.phase = "betting";
  s.settled = true;
  // the results are seen for BJ_SHOW_MS, then the table is cleared and everyone has BJ_BET_MS to bet
  s.clearAt = ctx.now + BJ_SHOW_MS;
  s.deadline = s.clearAt + BJ_BET_MS;
}

/** The paid round leaves the table: no cards, no stakes, no results — a clean table for the next bets. */
function clearTable(s: BjState) {
  s.dealer = [];
  s.holeOpen = false;
  s.settled = false;
  s.clearAt = null;
  for (const seat of sitting(s)) {
    seat.hands = [];
    seat.side = null;
    seat.won = undefined;
    seat.staked = undefined;
  }
}

/** After the deal: a dealer blackjack (peeked under an ace or a ten) ends the round at once; naturals stand. */
async function afterDeal(ctx: Ctx, t: TableRow) {
  const s = t.state;
  await paySides(ctx, t);
  for (const seat of sitting(s)) for (const h of seat.hands) if (handValue(h.cards) === 21) h.done = true;
  // an ace up: insurance first (only paid stakes can be insured), the dealer peeks after the answers
  const offer = s.dealer[0]?.r === 1 ? sitting(s).filter((x) => x.hands.length && !x.free) : [];
  if (offer.length) {
    for (const seat of offer) seat.ins = null;
    s.phase = "insurance";
    s.turn = null;
    s.deadline = ctx.now + BJ_INS_MS;
    return;
  }
  await peek(ctx, t, ctx.now);
}

/** The dealer looks under his card: a blackjack ends the round at once; otherwise the moves start. */
async function peek(ctx: Ctx, t: TableRow, base: number) {
  const s = t.state;
  s.phase = "playing";
  if (isBlackjack(s.dealer)) return finishRound(ctx, t);
  s.turn = null;
  await advance(ctx, t, base);
}

/** The insurance answers are in (or the time is up): pay 2:1 on a dealer blackjack, then peek. */
async function settleInsurance(ctx: Ctx, t: TableRow, base: number) {
  const s = t.state;
  const bj = isBlackjack(s.dealer);
  for (const seat of sitting(s)) {
    if (seat.ins === null) seat.ins = 0;
    if (!seat.ins) continue;
    seat.insPay = bj ? Math.round(seat.ins * (BJ_INS_PAY + 1) * 100) / 100 : 0;
    if (seat.insPay > 0) await addMoney(asCtx(ctx, seat.pid), "USD", seat.insPay, "bj:insurance");
  }
  await peek(ctx, t, base);
}

/**
 * Players who closed the game without «Встать» get up by themselves: a stake not dealt yet comes back, hands in play
 * stand (and are still paid); the seat frees and the player can be called again.
 */
async function dropIdle(ctx: Ctx, t: TableRow) {
  const s = t.state;
  for (let i = 0; i < s.seats.length; i++) {
    const seat = s.seats[i];
    if (!seat || seat.pid === ctx.pid || seat.left || !seat.seen || ctx.now - seat.seen < SEAT_IDLE_MS) continue;
    if (s.phase === "betting") {
      if (seat.ready) await refund(asCtx(ctx, seat.pid), seat);
      s.seats[i] = null;
    } else {
      for (const h of seat.hands) h.done = true;
      if (seat.ins === null) seat.ins = 0;
      seat.left = true;
      if (s.turn?.seat === i) await advance(ctx, t, ctx.now);
      if ((s.phase as BjState["phase"]) === "betting") s.seats[i] = s.seats[i]?.left ? null : s.seats[i];
    }
    await ctx.q.query("DELETE FROM bj_seats WHERE player_id=$1 AND table_id=$2", [seat.pid, t.id]);
  }
  if (s.phase === "betting" && !sitting(s).some((x) => x.ready)) s.deadline = s.clearAt ? s.deadline : null;
}

/** Catches the table up with the time: moves nobody made, a deal nobody started. */
async function tick(ctx: Ctx, t: TableRow) {
  const s = t.state;
  await dropIdle(ctx, t);
  if (s.clearAt && s.clearAt <= ctx.now) clearTable(s);
  for (let guard = 0; guard < 64 && s.deadline !== null && s.deadline <= ctx.now; guard++) {
    if (s.phase === "betting") {
      if (s.clearAt) clearTable(s);
      if (sitting(s).some((x) => x.ready)) {
        deal(ctx, t);
        await afterDeal(ctx, t);
      } else s.deadline = null;
    } else if (s.phase === "insurance") {
      await settleInsurance(ctx, t, s.deadline);
    } else if (s.turn) {
      const base = s.deadline;
      const h = s.seats[s.turn.seat]?.hands[s.turn.hand];
      if (h) h.done = true;
      await advance(ctx, t, base);
    } else s.deadline = null;
  }
}

/* ---------------- what a player sees ---------------- */

async function clanmates(q: Queryable, pid: number, tableId: number) {
  return q.query<{ id: number; name: string; busy: boolean; invited: boolean }>(
    `SELECT p.id, p.display_name AS name,
            EXISTS (SELECT 1 FROM bj_seats s WHERE s.player_id = p.id) AS busy,
            EXISTS (SELECT 1 FROM bj_invites i WHERE i.player_id = p.id AND i.table_id = $2) AS invited
       FROM clan_members me JOIN clan_members m ON m.clan_id = me.clan_id AND m.player_id <> me.player_id
       JOIN players p ON p.id = m.player_id
      WHERE me.player_id = $1
      ORDER BY p.last_seen_at DESC LIMIT 50`,
    [pid, tableId],
  );
}

export async function invitesFor(q: Queryable, pid: number, now: number) {
  return q.query<{ id: number; tableId: number; from: string; fromId: number; photo: string | null }>(
    `SELECT i.id, i.table_id AS "tableId", p.display_name AS "from", p.id AS "fromId", p.photo_url AS photo FROM bj_invites i JOIN players p ON p.id = i.from_id
      WHERE i.player_id = $1 AND i.created_at > $2 ORDER BY i.id DESC LIMIT 5`,
    [pid, new Date(now - INVITE_MS)],
  );
}

function tableView(t: TableRow, pid: number) {
  const s = t.state;
  const hide = !s.holeOpen && s.dealer.length > 1;
  const dealer = hide ? [s.dealer[0]] : s.dealer;
  return {
    id: t.id, hostId: t.host_id, phase: s.phase, round: s.round, settled: s.settled, deadline: s.deadline, clearAt: s.clearAt ?? null, turn: s.turn,
    dealer, dealerHidden: hide ? { n: s.dealer[1].n } : null, dealerValue: handValue(dealer),
    seats: s.seats.map((x) => x && {
      pid: x.pid, name: x.name, me: x.pid === pid, bet: x.bet, pp: x.pp, t3: x.t3, free: x.free, ready: x.ready, left: !!x.left,
      side: x.side, won: x.won ?? null, staked: x.staked ?? null, ins: x.ins === undefined ? undefined : x.ins, insPay: x.insPay ?? null,
      hands: x.hands.map((h) => ({ ...h, value: handValue(h.cards), canSplit: false, title: h.outcome ? BJ_TITLES[h.outcome] : null })),
    }),
  };
}

/** The whole picture for the window: my table (if I sit at one), invites to me, clan mates to invite, free bets. */
export async function bjView(ctx: Ctx) {
  const mine = await mySeatRow(ctx.q, ctx.pid);
  const free = { left: Math.max(0, BJ_FREE.perDay - (await freeUsed(ctx.q, ctx.pid, ctx.now))), perDay: BJ_FREE.perDay, bet: BJ_FREE.bet };
  const invites = await invitesFor(ctx.q, ctx.pid, ctx.now);
  if (!mine) return { table: null, seat: null, invites, free, clan: [] };
  const t = await lockTable(ctx, mine.table_id);
  if (!t) {
    await ctx.q.query("DELETE FROM bj_seats WHERE player_id=$1", [ctx.pid]);
    return { table: null, seat: null, invites, free, clan: [] };
  }
  const before = JSON.stringify(t.state);
  await tick(ctx, t);
  const meSeat = t.state.seats[mine.seat];
  if (meSeat && meSeat.pid === ctx.pid && (!meSeat.seen || ctx.now - meSeat.seen > 8000)) meSeat.seen = ctx.now;
  if (JSON.stringify(t.state) !== before) await saveTable(ctx, t);
  const view = tableView(t, ctx.pid);
  // which of my hands can be split / doubled right now
  const turn = t.state.turn;
  const myTurn = !!turn && turn.seat === mine.seat && t.state.phase === "playing";
  let moves = { hit: false, stand: false, double: false, split: false };
  if (myTurn) {
    const seat = t.state.seats[mine.seat]!;
    const h = seat.hands[turn!.hand];
    const two = h.cards.length === 2;
    moves = { hit: true, stand: true, double: two && !seat.free, split: two && !seat.free && canSplitCards(h.cards) && seat.hands.length < BJ_MAX_HANDS };
  }
  return { table: view, seat: mine.seat, invites, free, clan: await clanmates(ctx.q, ctx.pid, t.id), moves, now: ctx.now };
}

/* ---------------- actions ---------------- */

async function lockMine(ctx: Ctx) {
  const mine = await mySeatRow(ctx.q, ctx.pid);
  if (!mine) throw new GameError("bj_no_table", "Ты не сидишь за столом");
  const t = await lockTable(ctx, mine.table_id);
  if (!t) throw new GameError("bj_no_table", "Стол уже закрыт");
  await tick(ctx, t);
  const seat = t.state.seats[mine.seat];
  if (seat && seat.pid === ctx.pid) seat.seen = ctx.now;
  if (!seat || seat.pid !== ctx.pid) throw new GameError("bj_no_table", "Ты не сидишь за столом");
  return { t, i: mine.seat, seat };
}

async function playerName(q: Queryable, pid: number) {
  const [p] = await q.query<{ display_name: string }>("SELECT display_name FROM players WHERE id=$1", [pid]);
  return p?.display_name ?? `Игрок #${pid}`;
}

const emptySeat = (pid: number, name: string): BjSeat => ({ pid, name, bet: BJ_BET.min, pp: 0, t3: 0, free: false, ready: false, hands: [], side: null });

/** Opens my own table (or returns the one I already sit at). */
export async function bjOpen(ctx: Ctx) {
  if (await mySeatRow(ctx.q, ctx.pid)) return bjView(ctx);
  const seats: (BjSeat | null)[] = Array.from({ length: BJ_SEATS }, () => null);
  seats[0] = emptySeat(ctx.pid, await playerName(ctx.q, ctx.pid));
  const state: BjState = { seats, dealer: [], holeOpen: false, shoe: shuffled(ctx.rng, SHOE_DECKS), n: 0, phase: "betting", turn: null, deadline: null, round: 0, settled: false };
  const [t] = await ctx.q.query<{ id: number }>(
    "INSERT INTO bj_tables (host_id, state, created_at, updated_at) VALUES ($1,$2,$3,$3) RETURNING id",
    [ctx.pid, JSON.stringify(state), new Date(ctx.now)],
  );
  await ctx.q.query("INSERT INTO bj_seats (player_id, table_id, seat) VALUES ($1,$2,0)", [ctx.pid, t.id]);
  return bjView(ctx);
}

/** Calls a clan mate to my table (a free seat is taken when he comes). */
export async function bjInvite(ctx: Ctx, to: number) {
  const mine = await mySeatRow(ctx.q, ctx.pid);
  if (!mine) throw new GameError("bj_no_table", "Сначала сядь за стол");
  if (to === ctx.pid) throw new GameError("bj_self", "Себя звать не нужно");
  const [same] = await ctx.q.query("SELECT 1 FROM clan_members a JOIN clan_members b ON b.clan_id = a.clan_id WHERE a.player_id=$1 AND b.player_id=$2", [ctx.pid, to]);
  if (!same) throw new GameError("bj_not_clan", "Звать можно только игроков своего клана");
  const [t] = await ctx.q.query<{ state: BjState }>("SELECT state FROM bj_tables WHERE id=$1", [mine.table_id]);
  if (!t) throw new GameError("bj_no_table", "Стол уже закрыт");
  if (t.state.seats.some((x) => x?.pid === to)) throw new GameError("bj_already", "Он уже за столом");
  if (!t.state.seats.some((x) => !x)) throw new GameError("bj_full", "Свободных мест нет");
  await ctx.q.query(
    `INSERT INTO bj_invites (table_id, player_id, from_id, created_at) VALUES ($1,$2,$3,$4)
     ON CONFLICT (table_id, player_id) DO UPDATE SET from_id=EXCLUDED.from_id, created_at=EXCLUDED.created_at`,
    [mine.table_id, to, ctx.pid, new Date(ctx.now)],
  );
  await schedule(ctx.q, to, "bj_invite", ctx.now, { from: await playerName(ctx.q, ctx.pid) });
  return bjView(ctx);
}

/** Takes the invitation: the first free seat at that table. */
export async function bjJoin(ctx: Ctx, inviteId: number) {
  const [inv] = await ctx.q.query<{ table_id: number; created_at: Date }>("SELECT table_id, created_at FROM bj_invites WHERE id=$1 AND player_id=$2", [inviteId, ctx.pid]);
  if (!inv || new Date(inv.created_at).getTime() < ctx.now - INVITE_MS) throw new GameError("bj_no_invite", "Приглашение устарело");
  if (await mySeatRow(ctx.q, ctx.pid)) throw new GameError("bj_seated", "Сначала встань из-за своего стола");
  const t = await lockTable(ctx, inv.table_id);
  await ctx.q.query("DELETE FROM bj_invites WHERE id=$1", [inviteId]);
  if (!t) throw new GameError("bj_no_table", "Стол уже закрыт");
  await tick(ctx, t);
  const i = t.state.seats.findIndex((x) => !x);
  if (i < 0) throw new GameError("bj_full", "Свободных мест нет");
  t.state.seats[i] = emptySeat(ctx.pid, await playerName(ctx.q, ctx.pid));
  await ctx.q.query("INSERT INTO bj_seats (player_id, table_id, seat) VALUES ($1,$2,$3)", [ctx.pid, t.id, i]);
  await saveTable(ctx, t);
  return bjView(ctx);
}

export async function bjDecline(ctx: Ctx, inviteId: number) {
  await ctx.q.query("DELETE FROM bj_invites WHERE id=$1 AND player_id=$2", [inviteId, ctx.pid]);
  return bjView(ctx);
}

/** Gets up. A stake waiting for the deal comes back; hands in play stand and are still paid. */
export async function bjLeave(ctx: Ctx) {
  const { t, i, seat } = await lockMine(ctx);
  const s = t.state;
  if (s.phase === "betting") {
    if (seat.ready) await refund(ctx, seat);
    s.seats[i] = null;
  } else if (seat.hands.some((h) => !h.done)) {
    for (const h of seat.hands) h.done = true;
    seat.left = true;
    if (seat.ins === null) seat.ins = 0;
    if (s.turn?.seat === i) await advance(ctx, t, ctx.now);
    if ((s.phase as BjState["phase"]) === "betting") s.seats[i] = null; // the round ended right now
  } else if (seat.hands.length && s.phase === "playing") {
    seat.left = true;
  } else s.seats[i] = null;
  await ctx.q.query("DELETE FROM bj_seats WHERE player_id=$1", [ctx.pid]);
  if (!sitting(s).some((x) => !x.left)) {
    await ctx.q.query("DELETE FROM bj_tables WHERE id=$1", [t.id]);
  } else {
    if (s.phase === "betting" && !sitting(s).some((x) => x.ready)) s.deadline = null;
    await saveTable(ctx, t);
  }
  return bjView(ctx);
}

async function refund(ctx: Ctx, seat: BjSeat) {
  const back = (seat.free ? 0 : seat.bet) + seat.pp + seat.t3;
  if (back > 0) await addMoney(ctx, "USD", back, "bj:refund");
  if (seat.free) await ctx.q.query("DELETE FROM games WHERE id = (SELECT id FROM games WHERE player_id=$1 AND kind='bj_free' AND day=$2 ORDER BY id DESC LIMIT 1)", [ctx.pid, moscowDay(ctx.now)]);
  seat.ready = false;
  seat.free = false;
}

const whole = (v: number, lo: number, hi: number, what: string) => {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new GameError("bj_bad_bet", `${what}: от ${lo} до ${hi} USD`);
  return v;
};

/** Puts the stake (and side bets) down. Nobody starts the deal by hand: it comes when the betting time is up, or at once when everyone sitting has bet. */
export async function bjBet(ctx: Ctx, bet: number, pp: number, t3: number, free: boolean) {
  const { t, seat } = await lockMine(ctx);
  const s = t.state;
  if (s.phase !== "betting") throw new GameError("bj_busy", "Идёт раздача — дождись следующей");
  if (s.clearAt && s.clearAt > ctx.now) throw new GameError("bj_busy", "Стол убирают — ставки через пару секунд");
  if (seat.ready) throw new GameError("bj_ready", "Ставка уже на столе");
  whole(pp, 0, BJ_SIDE_MAX, "«Идеальные пары»");
  whole(t3, 0, BJ_SIDE_MAX, "«21+3»");
  if (free) {
    if ((await freeUsed(ctx.q, ctx.pid, ctx.now)) >= BJ_FREE.perDay) throw new GameError("bj_no_free", "Бесплатные ставки на сегодня кончились");
    await ctx.q.query(
      "INSERT INTO games (player_id, kind, day, paid, status, state, created_at, updated_at) VALUES ($1,'bj_free',$2,false,'done','{}',$3,$3)",
      [ctx.pid, moscowDay(ctx.now), new Date(ctx.now)],
    );
  } else whole(bet, BJ_BET.min, BJ_BET.max, "Ставка");
  const cost = (free ? 0 : bet) + pp + t3;
  if (cost > 0) await takeMoney(ctx, "USD", cost, "bj:bet");
  Object.assign(seat, { bet: free ? seat.bet : bet, pp, t3, free, ready: true });
  if (sitting(s).every((x) => x.ready)) {
    deal(ctx, t);
    await afterDeal(ctx, t);
  } else if (s.deadline === null) s.deadline = ctx.now + BJ_BET_MS;
  await saveTable(ctx, t);
  return bjView(ctx);
}

/** Takes the stake back before the deal. */
export async function bjUnbet(ctx: Ctx) {
  const { t, seat } = await lockMine(ctx);
  if (t.state.phase !== "betting" || !seat.ready) throw new GameError("bj_busy", "Ставку уже не снять");
  await refund(ctx, seat);
  if (!sitting(t.state).some((x) => x.ready)) t.state.deadline = null;
  await saveTable(ctx, t);
  return bjView(ctx);
}

/** Insurance against the dealer's ace: yes (half the stake) or no. When everyone has answered, the dealer peeks. */
export async function bjInsure(ctx: Ctx, take: boolean) {
  const { t, seat } = await lockMine(ctx);
  const s = t.state;
  if (s.phase !== "insurance" || seat.ins !== null) throw new GameError("bj_no_insurance", "Страховку сейчас не предлагают");
  const amount = take ? bjInsurance(seat.hands[0]?.bet ?? 0) : 0;
  if (amount > 0) {
    await takeMoney(ctx, "USD", amount, "bj:insurance");
    seat.staked = (seat.staked ?? 0) + amount;
  }
  seat.ins = amount;
  if (sitting(s).every((x) => x.ins !== null)) await settleInsurance(ctx, t, ctx.now);
  await saveTable(ctx, t);
  return bjView(ctx);
}

export type BjMove = "hit" | "stand" | "double" | "split";

export async function bjMove(ctx: Ctx, move: BjMove) {
  const { t, i, seat } = await lockMine(ctx);
  const s = t.state;
  if (s.phase !== "playing" || s.turn?.seat !== i) throw new GameError("bj_not_turn", "Сейчас не твой ход");
  const h = seat.hands[s.turn.hand];
  const two = h.cards.length === 2;
  if (move === "hit") {
    h.cards.push(draw(s, ctx.rng));
    if (handValue(h.cards) >= 21) h.done = true;
  } else if (move === "stand") {
    h.done = true;
  } else if (move === "double") {
    if (!two || seat.free) throw new GameError("bj_bad_move", "Удвоить можно только на двух картах");
    await takeMoney(ctx, "USD", h.bet, "bj:double");
    seat.staked = (seat.staked ?? 0) + h.bet;
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(draw(s, ctx.rng));
    h.done = true;
  } else {
    if (!two || seat.free || !canSplitCards(h.cards) || seat.hands.length >= BJ_MAX_HANDS) throw new GameError("bj_bad_move", "Разбить можно только пару");
    await takeMoney(ctx, "USD", h.bet, "bj:split");
    seat.staked = (seat.staked ?? 0) + h.bet;
    const aces = h.cards[0].r === 1;
    const second: BjHand = { cards: [h.cards.pop()!], bet: h.bet, split: true, done: false };
    h.split = true;
    seat.hands.splice(s.turn.hand + 1, 0, second);
    h.cards.push(draw(s, ctx.rng));
    second.cards.push(draw(s, ctx.rng));
    for (const x of [h, second]) if (aces || handValue(x.cards) === 21) x.done = true;
  }
  if (h.done) await advance(ctx, t, ctx.now);
  else s.deadline = ctx.now + BJ_TURN_MS;
  await saveTable(ctx, t);
  return bjView(ctx);
}

/** pending invitations (for the yard badge) */
export async function bjInviteCount(q: Queryable, pid: number, now: number) {
  const [r] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM bj_invites WHERE player_id=$1 AND created_at > $2", [pid, new Date(now - INVITE_MS)]);
  return Number(r?.n ?? 0);
}
