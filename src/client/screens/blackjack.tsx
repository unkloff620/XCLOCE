"use client";
/*
 * Стол блэкджека во дворе: дилер сверху, 6 мест снизу. Хозяин и гости из клана ставят 1–25 USD (+ сайды), карты
 * сдаются медленно, по одной, в том порядке, в каком их выдал сервер (номер карты n). Окно опрашивает /api/blackjack,
 * пока открыто; ходы — через действия bj_*. Правила и выплаты — content/games.ts, раздача — server/systems/blackjack.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { api, type BjCardV, type BjSeatV, type BjView } from "../api.ts";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { BJ_BET, BJ_FREE, BJ_SIDE_MAX, PP_PAY, PP_TITLES, RANKS, SUITS, T3_PAY, T3_TITLES, type PairHit, type T3Hit } from "../../content/games.ts";

/** time between two cards coming out of the shoe */
const DEAL_GAP = 650;
const CARD_ANIM = 520;
const money = (v: number) => (Math.round(v * 100) / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function BlackjackHelp() {
  return (
    <Help topic="blackjack" title="Блэкджек">
      <p>Набери больше дилера, но не больше 21. Картинки — 10, туз — 1 или 11. Дилер добирает до 17.</p>
      <p>За столом 6 мест: садись сам и зови соклановцев на пустые места — играете вместе против дилера, каждый за себя.</p>
      <ul className="small">
        <li>Ставка — от {BJ_BET.min} до {BJ_BET.max} USD. Победа — 1:1, блэкджек — 3:2, ничья — ставка назад.</li>
        <li><b>Ещё</b> — взять карту, <b>Хватит</b> — остановиться, <b>Удвоить</b> — удвоить ставку и взять ровно одну карту, <b>Разбить</b> — пару одного достоинства на две руки (до 4 рук; тузы получают по одной карте).</li>
        <li>Сайд «Идеальные пары» (две первые карты): разноцветная пара {PP_PAY.mixed}:1, цветная {PP_PAY.colored}:1, одной масти {PP_PAY.perfect}:1.</li>
        <li>Сайд «21+3» (две твои + открытая дилера): флеш {T3_PAY.flush}:1, стрит {T3_PAY.straight}:1, тройка {T3_PAY.trips}:1, стрит-флеш {T3_PAY.sflush}:1, тройка одной масти {T3_PAY.suited}:1.</li>
        <li>Сайды — до {BJ_SIDE_MAX} USD каждый. Бесплатная ставка — {BJ_FREE.perDay} в день по {BJ_FREE.bet} USD: выигрыш твой, проигрыш ничего не стоит.</li>
      </ul>
      <p>На ход — 30 секунд, потом рука стоит сама. После первой ставки остальным даётся 25 секунд, потом раздача.</p>
    </Help>
  );
}

/** a card on the table; it flies out of the shoe after `delay` ms */
function Card({ c, back, delay }: { c?: BjCardV; back?: boolean; delay: number }) {
  if (back || !c) return <span className="bjc back" style={{ animationDelay: `${delay}ms` }} />;
  const red = c.s === 1 || c.s === 2;
  return (
    <span className={`bjc ${red ? "red" : ""}`} style={{ animationDelay: `${delay}ms` }}>
      <b>{RANKS[c.r]}</b>
      <i>{SUITS[c.s]}</i>
    </span>
  );
}

/**
 * Remembers when each card first appeared and gives it a fixed deal delay, so cards come out one by one in the order
 * the server dealt them: players' cards by number, then the dealer's hole card turns, then the dealer's draws.
 */
function useDealQueue(view: BjView | null) {
  const delays = useRef(new Map<string, number>());
  const busyUntil = useRef(0);
  const table = view?.table ?? null;
  const lastTable = useRef<number | null>(null);
  if (table && lastTable.current !== table.id) {
    // a new table (or the first look): what is already there just appears
    lastTable.current = table.id;
    delays.current.clear();
    for (const s of table.seats) for (const h of s?.hands ?? []) for (const c of h.cards) delays.current.set(`c${c.n}`, -1);
    for (const c of table.dealer) delays.current.set(`c${c.n}`, -1);
    if (table.dealerHidden) delays.current.set(`h${table.dealerHidden.n}`, -1);
  }
  const fresh: string[] = [];
  if (table) {
    const players: number[] = [];
    for (const s of table.seats) for (const h of s?.hands ?? []) for (const c of h.cards) if (!delays.current.has(`c${c.n}`)) players.push(c.n);
    players.sort((a, b) => a - b);
    const dealerCards = table.dealer.map((c) => c.n);
    const hole = table.dealer[1]?.n;
    const firstDeal = table.dealerHidden && !delays.current.has(`h${table.dealerHidden.n}`);
    const ids: string[] = [];
    if (firstDeal) {
      // the opening deal: player, player…, dealer up, player, player…, dealer down — by card number
      const all = [...players.map((n) => ({ n, id: `c${n}` })), ...dealerCards.filter((n) => !delays.current.has(`c${n}`)).map((n) => ({ n, id: `c${n}` })), { n: table.dealerHidden!.n, id: `h${table.dealerHidden!.n}` }];
      all.sort((a, b) => a.n - b.n);
      ids.push(...all.map((x) => x.id));
    } else {
      ids.push(...players.map((n) => `c${n}`));
      if (hole !== undefined && !delays.current.has(`c${hole}`)) ids.push(`c${hole}`);
      for (const n of dealerCards) if (n !== hole && !delays.current.has(`c${n}`)) ids.push(`c${n}`);
    }
    const now = Date.now();
    let at = Math.max(now, busyUntil.current);
    for (const id of ids) {
      if (delays.current.has(id)) continue;
      delays.current.set(id, at - now);
      fresh.push(id);
      at += DEAL_GAP;
    }
    if (fresh.length) busyUntil.current = at;
  }
  // results and totals show once the last card has landed
  const revealAt = busyUntil.current + CARD_ANIM - DEAL_GAP;
  useEffect(() => {
    if (!fresh.length) return;
    const timers = fresh.map((id) => window.setTimeout(() => sfx("tap", 0.25), Math.max(0, delays.current.get(id) ?? 0)));
    return () => timers.forEach(clearTimeout);
  });
  const delayOf = useCallback((id: string) => Math.max(0, delays.current.get(id) ?? 0), []);
  return { delayOf, revealAt };
}

function useClock(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

const PP_OPTS = [0, 1, 2, 5, 10];

function BetPanel({ seat, view, onBet, busy, usd }: { seat: BjSeatV; view: BjView; onBet: (b: { bet: number; pp: number; t3: number; free: boolean }) => void; busy: boolean; usd: number }) {
  const [bet, setBet] = useState(Math.min(BJ_BET.max, Math.max(BJ_BET.min, seat.bet || BJ_BET.min)));
  const [pp, setPp] = useState(seat.pp || 0);
  const [t3, setT3] = useState(seat.t3 || 0);
  const [free, setFree] = useState(false);
  const cost = (free ? 0 : bet) + pp + t3;
  const add = (v: number) => { haptic.tap(); setFree(false); setBet((b) => Math.min(BJ_BET.max, (b === BJ_BET.min && v > 1 ? 0 : b) + v)); };
  return (
    <div className="bj-bet">
      <div className="bj-bet-main">
        <span className="tiny">Ставка</span>
        <div className="bj-bet-val">
          <button className="bj-step" disabled={free || bet <= BJ_BET.min} onClick={() => setBet((b) => Math.max(BJ_BET.min, b - 1))} aria-label="меньше">−</button>
          <b className="display num">{free ? BJ_FREE.bet : bet}<small> USD</small></b>
          <button className="bj-step" disabled={free || bet >= BJ_BET.max} onClick={() => setBet((b) => Math.min(BJ_BET.max, b + 1))} aria-label="больше">+</button>
        </div>
        <div className="bj-chips">
          {[1, 5, 10, 25].map((v) => <button key={v} className={`bj-chip v${v}`} disabled={free} onClick={() => add(v)}>{v}</button>)}
          <button className="bj-chip clear" disabled={free} onClick={() => setBet(BJ_BET.min)} aria-label="сброс">↺</button>
        </div>
        {view.free.left > 0 && (
          <label className="bj-free tiny">
            <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> Бесплатная ставка {BJ_FREE.bet} USD (осталось {view.free.left}/{view.free.perDay})
          </label>
        )}
      </div>
      <div className="bj-sides">
        <div className="bj-side-row">
          <span className="tiny"><b>Пары</b> до {PP_PAY.perfect}:1</span>
          <span className="bj-opts">{PP_OPTS.map((v) => <button key={v} className={pp === v ? "on" : ""} onClick={() => setPp(v)}>{v || "—"}</button>)}</span>
        </div>
        <div className="bj-side-row">
          <span className="tiny"><b>21+3</b> до {T3_PAY.suited}:1</span>
          <span className="bj-opts">{PP_OPTS.map((v) => <button key={v} className={t3 === v ? "on" : ""} onClick={() => setT3(v)}>{v || "—"}</button>)}</span>
        </div>
      </div>
      <button className="btn big gold bj-place" disabled={busy || cost > usd} onClick={() => onBet({ bet, pp, t3, free })}>
        Поставить{cost > 0 ? <> · {money(cost)} <Icon name="USD" size={18} /></> : " бесплатно"}
      </button>
      {cost > usd && <span className="tiny center" style={{ color: "var(--red)" }}>Не хватает USD</span>}
    </div>
  );
}

function SeatView({ s, i, table, myTurnHand, reveal, delayOf, canInvite, onInvite }: {
  s: BjSeatV | null; i: number; table: NonNullable<BjView["table"]>; myTurnHand: number | null; reveal: boolean;
  delayOf: (id: string) => number; canInvite: boolean; onInvite: (seat: number) => void;
}) {
  if (!s) {
    return (
      <div className="bj-seat empty" style={{ ["--k" as string]: i }}>
        {canInvite ? <button className="bj-invite-btn" onClick={() => onInvite(i)}><b>+</b><small>Позвать</small></button> : <span className="tiny muted">свободно</span>}
      </div>
    );
  }
  const turn = table.phase === "playing" && table.turn?.seat === i;
  const shown = reveal || !table.settled;
  return (
    <div className={`bj-seat ${s.me ? "me" : ""} ${turn ? "turn" : ""}`} style={{ ["--k" as string]: i }}>
      <div className="bj-hands">
        {s.hands.map((h, k) => {
          const active = turn && table.turn?.hand === k;
          const res = table.settled && reveal && h.outcome;
          return (
            <div key={k} className={`bj-hand ${active ? "active" : ""} ${res ? `res-${h.outcome}` : ""}`}>
              <div className="bj-cards">{h.cards.map((c) => <Card key={c.n} c={c} delay={delayOf(`c${c.n}`)} />)}</div>
              <span className="bj-hv">
                <b className={`num ${h.value > 21 && shown ? "bust" : ""}`}>{reveal ? h.value : "…"}</b>
                <i className="num">{money(h.bet)}${h.doubled ? " ×2" : ""}</i>
              </span>
              {res && <span className={`bj-out ${h.outcome}`}>{h.title}{h.pay ? ` +${money(h.pay)}` : ""}</span>}
              {active && myTurnHand === k && <span className="bj-arrow">▲</span>}
            </div>
          );
        })}
        {!s.hands.length && (s.ready ? <span className="bj-stake num">{s.free ? "free " : ""}{money(s.free ? BJ_FREE.bet : s.bet)}$</span> : <span className="tiny muted">{table.phase === "betting" ? "ставит…" : "ждёт"}</span>)}
      </div>
      <div className="bj-name">
        {table.phase === "betting" && s.ready && <span className="bj-ok">✓</span>}
        <b>{s.name}</b>
      </div>
      {s.side && reveal && (s.side.pp || s.side.t3) && (
        <span className="bj-side-win tiny">
          {s.side.pp && PP_TITLES[s.side.pp as PairHit]}{s.side.pp && s.side.t3 ? " · " : ""}{s.side.t3 && `21+3: ${T3_TITLES[s.side.t3 as T3Hit]}`}
        </span>
      )}
      {(s.pp > 0 || s.t3 > 0) && (s.ready || s.hands.length > 0) && (
        <span className="bj-side-chips">{s.pp > 0 && <i title="Идеальные пары">П {s.pp}</i>}{s.t3 > 0 && <i title="21+3">21+3 {s.t3}</i>}</span>
      )}
    </div>
  );
}

function InvitePicker({ view, onClose, onPick }: { view: BjView; onClose: () => void; onPick: (id: number) => void }) {
  return (
    <Modal title="Позвать за стол" onClose={onClose}>
      {view.clan.length === 0 ? (
        <p className="small muted">Звать можно игроков своего клана. Вступи в клан или позови друзей в свой.</p>
      ) : (
        <div className="col" style={{ gap: 6, maxHeight: 360, overflowY: "auto" }}>
          {view.clan.map((m) => (
            <div key={m.id} className="row bj-mate">
              <b className="grow">{m.name}</b>
              {m.busy ? <span className="tiny muted">за столом</span> : (
                <button className="btn small green" disabled={m.invited} onClick={() => onPick(m.id)}>{m.invited ? "Позван" : "Позвать"}</button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function BlackjackWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [view, setView] = useState<BjView | null>(null);
  const [inviteSeat, setInviteSeat] = useState<number | null>(null);
  const skew = useRef(0);
  const take = useCallback((v: BjView | null) => {
    if (!v) return;
    if (v.now) skew.current = v.now - Date.now();
    setView(v);
  }, []);
  // poll while the window is open (faster while something is going on at the table)
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const tick = async () => {
      try {
        const v = await api.get<BjView>("/api/blackjack");
        if (alive) take(v);
      } catch { /* a missed poll is fine */ }
      if (alive) timer = window.setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [take]);
  const run = async (type: string, body: Record<string, unknown> = {}) => {
    haptic.tap();
    const r = await act<BjView>(type, body);
    if (r) take(r);
    return r;
  };
  const table = view?.table ?? null;
  const { delayOf, revealAt } = useDealQueue(view);
  const now = useClock(!!table);
  const reveal = now >= revealAt;
  const me = table && view?.seat !== null && view?.seat !== undefined ? table.seats[view.seat] : null;
  const myTurn = !!table && table.phase === "playing" && table.turn?.seat === view?.seat;
  const left = table?.deadline ? Math.max(0, Math.ceil((table.deadline - (now + skew.current)) / 1000)) : null;
  const usd = state?.wallet.USD ?? 0;
  const result = me && table?.settled && reveal && me.won !== null && me.staked !== null ? me.won - me.staked : null;
  const resultKey = table ? `${table.id}:${table.round}` : "";
  const played = useRef("");
  useEffect(() => {
    if (result === null || played.current === resultKey) return;
    played.current = resultKey;
    if (result > 0) { haptic.ok(); sfx("reward"); } else if (result < 0) haptic.err();
  }, [result, resultKey]);
  const waiting = table ? table.seats.filter((x) => x && !x.ready).length : 0;
  const order = useMemo(() => (table ? table.seats.map((s, i) => ({ s, i })) : []), [table]);

  return (
    <Modal title={<span className="title-row">Блэкджек <BlackjackHelp /></span>} onClose={onClose} maxWidth={860}>
      {!view ? (
        <div className="bj-loading tiny muted center">Раскладываем стол…</div>
      ) : !table ? (
        <div className="bj-lobby col">
          {view.invites.map((inv) => (
            <div key={inv.id} className="bj-inv row">
              <span className="grow"><b>{inv.from}</b> зовёт тебя за стол</span>
              <button className="btn small green" disabled={busy === "bj_join"} onClick={() => run("bj_join", { inviteId: inv.id })}>Сесть</button>
              <button className="btn small dark" onClick={() => run("bj_decline", { inviteId: inv.id })} aria-label="Отказаться">✕</button>
            </div>
          ))}
          <div className="bj-felt bj-felt-lobby">
            <span className="bj-felt-text display">BLACKJACK PAYS 3 TO 2</span>
            <span className="tiny">Ставки {BJ_BET.min}–{BJ_BET.max} USD · сайды «Пары» и «21+3» · стол на 6 мест</span>
          </div>
          <button className="btn big block gold" disabled={busy === "bj_open"} onClick={() => run("bj_open")}>Сесть за стол</button>
          <span className="tiny muted center">Сядешь — сможешь позвать соклановцев на свободные места. Бесплатных ставок сегодня: {view.free.left}/{view.free.perDay}</span>
        </div>
      ) : (
        <>
          <div className="bj-felt">
            <div className="bj-shoe" aria-hidden="true"><span /></div>
            <div className="bj-dealer">
              <span className="tiny bj-lbl">Дилер{table.dealer.length ? <> · <b className="num">{reveal ? table.dealerValue : "…"}</b>{table.dealerHidden ? "+?" : ""}</> : null}</span>
              <div className="bj-cards dealer">
                {table.dealer.map((c) => <Card key={`c${c.n}`} c={c} delay={delayOf(`c${c.n}`)} />)}
                {table.dealerHidden && <Card key={`h${table.dealerHidden.n}`} back delay={delayOf(`h${table.dealerHidden.n}`)} />}
              </div>
              <span className="bj-arc tiny">Блэкджек платит 3:2 · Дилер стоит на 17</span>
            </div>
            <div className="bj-seats">
              {order.map(({ s, i }) => (
                <SeatView key={i} s={s} i={i} table={table} myTurnHand={myTurn ? table.turn!.hand : null} reveal={reveal} delayOf={delayOf}
                  canInvite={!!me} onInvite={(k) => setInviteSeat(k)} />
              ))}
            </div>
          </div>
          <div className="bj-panel">
            {result !== null && (
              <div className={`bj-result ${result > 0 ? "win" : result < 0 ? "lose" : ""}`}>
                {result > 0 ? <>Выигрыш +{money(result)} <Icon name="USD" size={16} /></> : result < 0 ? <>Минус {money(-result)} <Icon name="USD" size={16} /></> : "В ноль"}
              </div>
            )}
            {table.phase === "playing" ? (
              myTurn && reveal ? (
                <div className="bj-moves">
                  <button className="btn gold" disabled={!!busy || !view.moves?.hit} onClick={() => run("bj_move", { move: "hit" })}>Ещё</button>
                  <button className="btn red" disabled={!!busy || !view.moves?.stand} onClick={() => run("bj_move", { move: "stand" })}>Хватит</button>
                  <button className="btn green" disabled={!!busy || !view.moves?.double} onClick={() => run("bj_move", { move: "double" })}>Удвоить</button>
                  <button className="btn dark" disabled={!!busy || !view.moves?.split} onClick={() => run("bj_move", { move: "split" })}>Разбить</button>
                  {left !== null && <span className="bj-timer tiny">Твой ход · {left} с</span>}
                </div>
              ) : (
                <span className="tiny center bj-wait">
                  {!reveal ? "Раздаём…" : table.turn ? <>Ходит <b>{table.seats[table.turn.seat]?.name}</b>{left !== null ? ` · ${left} с` : ""}</> : "Дилер открывает карты…"}
                </span>
              )
            ) : me && !me.ready ? (
              <BetPanel key={`${table.round}`} seat={me} view={view} busy={busy === "bj_bet"} usd={usd} onBet={(b) => run("bj_bet", b)} />
            ) : me ? (
              <div className="bj-waitbet col">
                <span className="tiny center">Ставка на столе. {waiting > 0 ? <>Ждём остальных ({waiting}){left !== null ? ` · раздача через ${left} с` : ""}</> : "Раздаём…"}</span>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn grow dark" disabled={!!busy} onClick={() => run("bj_unbet")}>Снять ставку</button>
                  {waiting > 0 && <button className="btn grow gold" disabled={!!busy} onClick={() => run("bj_deal")}>Раздать сейчас</button>}
                </div>
              </div>
            ) : null}
            <div className="row bj-foot">
              <span className="tiny muted grow">Бесплатных ставок: {view.free.left}/{view.free.perDay}</span>
              <button className="btn small dark" disabled={!!busy} onClick={() => run("bj_leave")}>Встать из-за стола</button>
            </div>
          </div>
        </>
      )}
      {inviteSeat !== null && view && (
        <InvitePicker view={view} onClose={() => setInviteSeat(null)} onPick={async (id) => { await run("bj_invite", { playerId: id }); sfx("tap"); }} />
      )}
    </Modal>
  );
}
