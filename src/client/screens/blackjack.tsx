"use client";
/*
 * Стол блэкджека во дворе — во весь экран, на сукне художника (public/assets/yard/bj-room.webp, 841×1870): дилер
 * сверху, пять боксов по дуге — это другие игроки (их карты, ставки и кружок сайда «Пары»), а моё место — большое поле
 * внизу: кружок «Пары» над моими картами, сами карты, ставка, кнопки. Ставка — фишками: выбираешь номинал в лотке и
 * жмёшь на своё поле (основная ставка) или кружок (сайд), фишки ложатся на стол; нажатие на фишки снимает верхнюю.
 * Пустой бокс — «+», позвать соклановца. Карты сдаются по одной в том порядке, в каком их выдал сервер (номер карты n); после
 * раздачи проигранные фишки уходят к дилеру, выигрыш приезжает рядом со ставкой. На руке — чистый выигрыш (без ставки).
 * Окно опрашивает /api/blackjack, пока открыто; ходы — через действия bj_*. Правила и выплаты — content/games.ts,
 * раздача — server/systems/blackjack.ts.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { api, type BjCardV, type BjHandV, type BjSeatV, type BjTableV, type BjView } from "../api.ts";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { BJ_BET, BJ_FREE, BJ_SIDE_MAX, PP_PAY, PP_TITLES, RANKS, SUITS, T3_PAY, type PairHit, type T3Hit } from "../../content/games.ts";

/** time between two cards coming out of the shoe */
const DEAL_GAP = 650;
const CARD_ANIM = 520;
const money = (v: number) => (Math.round(v * 100) / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function BlackjackHelp() {
  return (
    <Help topic="blackjack" title="Блэкджек">
      <p>Набери больше дилера, но не больше 21. Картинки — 10, туз — 1 или 11. Дилер добирает до 17.</p>
      <p>За столом 6 мест: твоё — большое поле внизу, остальные пять боксов по дуге — другие игроки. Зови соклановцев на пустые боксы «+» — играете вместе против дилера, каждый за себя.</p>
      <p>Ставка — фишками: выбери номинал внизу и нажми на своё поле (основная ставка) или на кружок «Пары» над ним (сайд). Нажми на фишки на столе — верхняя вернётся.</p>
      <ul className="small">
        <li>Ставка — от {BJ_BET.min} до {BJ_BET.max} USD. Победа — 1:1, блэкджек — 3:2, ничья — ставка назад. На руке пишется чистый выигрыш: ставка 25 после удвоения — это 50 на столе, победа даёт +50.</li>
        <li><b>Ещё</b> — взять карту, <b>Хватит</b> — остановиться, <b>Удвоить</b> — удвоить ставку и взять ровно одну карту, <b>Разбить</b> — пару одного достоинства на две руки (до 4 рук; тузы получают по одной карте).</li>
        <li>Сайд «Идеальные пары» (две первые карты): разноцветная пара {PP_PAY.mixed}:1, цветная {PP_PAY.colored}:1, одной масти {PP_PAY.perfect}:1.</li>
        <li>Сайд — до {BJ_SIDE_MAX} USD. Бесплатная ставка — {BJ_FREE.perDay} в день по {BJ_FREE.bet} USD: выигрыш твой, проигрыш ничего не стоит.</li>
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

/* ---------------- the table picture (public/assets/yard/bj-room.webp, the artist's felt, 841×1870) ---------------- */
const TW = 841, TH = 1870;
const at = (x: number, y: number) => ({ left: `${(x / TW) * 100}%`, top: `${(y / TH) * 100}%` });
/** where one seat sits on the felt: its card box (centre, tilt), its «Пары» circle, its name line; `big` — my own field */
interface SeatGeo { box: { x: number; y: number; r: number }; pp: readonly [number, number]; name: readonly [number, number]; big?: boolean }
/** the five boxes drawn on the felt, left to right — the other players */
const OTHER_SEATS: SeatGeo[] = [
  { box: { x: 98, y: 653, r: 19 }, pp: [55, 741], name: [70, 790] },
  { box: { x: 246, y: 713, r: 10 }, pp: [224, 809], name: [262, 852] },
  { box: { x: 420, y: 733, r: 0 }, pp: [420, 832], name: [420, 878] },
  { box: { x: 593, y: 713, r: -10 }, pp: [615, 809], name: [578, 852] },
  { box: { x: 742, y: 653, r: -19 }, pp: [785, 741], name: [770, 790] },
];
/** my field under the arc (drawn by the page, not in the picture): the «Пары» circle on top, the cards, the name under */
const MY_SEAT: SeatGeo = { box: { x: 420, y: 1078, r: 0 }, pp: [420, 912], name: [420, 1222], big: true };
const DENOMS = [25, 10, 5, 1] as const;
const TRAY = [1, 5, 10, 25] as const;

/** an amount as casino chips (largest first): what lies on the table for a stake the server knows */
function chipsOf(v: number): number[] {
  const out: number[] = [];
  let left = Math.round(v * 100) / 100;
  for (const d of DENOMS) while (left >= d - 1e-9) { out.push(d); left = Math.round((left - d) * 100) / 100; }
  if (left > 0) out.push(1); // half a dollar of a 3:2 payout: one small chip
  return out;
}
const sum = (a: number[]) => a.reduce((t, x) => t + x, 0);
const signed = (v: number) => (v > 0 ? `+${money(v)}` : v < 0 ? `−${money(-v)}` : "0");

/** a pile of chips; new ones fly in (from the tray, or from the dealer for a payout) */
function Stack({ chips, free, label, cls = "", onTap, title }: { chips: number[]; free?: boolean; label?: string; cls?: string; onTap?: () => void; title?: string }) {
  if (!chips.length && !free) return null;
  const shown = free ? [0] : chips.slice(-6);
  const body = (
    <>
      {shown.map((d, k) => <i key={`${k}-${d}`} className={`chp v${d || "free"}`} style={{ ["--k" as string]: k }}>{d === 0 ? "FREE" : k === shown.length - 1 ? d : ""}</i>)}
      {label && <b className="chp-sum num">{label}</b>}
    </>
  );
  return onTap
    ? <button type="button" className={`bjt-stack ${cls}`} title={title} onClick={(e) => { e.stopPropagation(); onTap(); }}>{body}</button>
    : <span className={`bjt-stack ${cls}`} title={title}>{body}</span>;
}

/** what a hand brought (stake included in neither): +bet on a win, +1.5×bet on a blackjack, −bet on a loss */
function handNet(h: BjHandV, free: boolean) {
  return Math.round(((h.pay ?? 0) - (free ? 0 : h.bet)) * 100) / 100;
}
function sideNets(s: BjSeatV) {
  const pp = s.pp > 0 ? (s.side?.pp ? s.pp * PP_PAY[s.side.pp as PairHit] : -s.pp) : 0;
  const t3 = s.t3 > 0 ? (s.side?.t3 ? s.t3 * T3_PAY[s.side.t3 as T3Hit] : -s.t3) : 0;
  return { pp, t3 };
}

type Pending = { main: number[]; pp: number[]; t3: number[] };
const NO_BET: Pending = { main: [], pp: [], t3: [] };

/** one seat on the felt: the card box (cards, the stake under them), its two side circles and the name under them */
function SeatSpot({ s, i, geo, table, reveal, delayOf, myTurnHand, betting, pending, free, onBox, onSide, onUnchip, canInvite, onInvite }: {
  s: BjSeatV | null; i: number; geo: SeatGeo; table: BjTableV; reveal: boolean; delayOf: (id: string) => number; myTurnHand: number | null;
  /** my seat, stake not down yet: taps put chips on the box and the circles */
  betting: boolean; pending: Pending; free: boolean;
  onBox: () => void; onSide: (k: "pp" | "t3") => void; onUnchip: (k: keyof Pending) => void;
  canInvite: boolean; onInvite: (seat: number) => void;
}) {
  const b = geo.box;
  const box = { ...at(b.x, b.y), ["--r" as string]: `${b.r}deg` };
  const mid = geo.name;
  const big = geo.big ? "big" : "";
  if (!s) {
    return canInvite
      ? <button type="button" className={`bjt-box empty invite ${big}`} style={box} onClick={() => onInvite(i)} aria-label="Позвать за стол"><b>+</b><small>Позвать</small></button>
      : <span className={`bjt-box empty ${big}`} style={box} />;
  }
  const turn = table.phase === "playing" && table.turn?.seat === i;
  // a new stake started: the last round's cards and results leave the box
  const fresh = betting && (pending.main.length > 0 || pending.pp.length > 0 || pending.t3.length > 0 || free);
  const hands = s.hands.length && !(table.phase === "betting" && (s.ready || fresh)) ? s.hands : [];
  const done = table.settled && reveal && hands.length > 0;
  const nets = done ? sideNets(s) : null;
  // the stake on the box: what I am putting down now, else what the server holds
  const mainChips = fresh ? (free ? [] : pending.main) : s.ready ? (s.free ? [] : chipsOf(s.bet)) : [];
  const ppChips = fresh ? pending.pp : (s.ready || hands.length) ? chipsOf(s.pp) : [];
  const total = done ? hands.reduce((t, h) => t + handNet(h, s.free), 0) + (nets ? nets.pp + nets.t3 : 0) : null;
  const status = turn ? "ходит" : table.phase === "betting" ? (s.ready ? "ставка ✓" : betting ? "твоя ставка" : "ставит…") : hands.length ? "" : "ждёт";
  const side = (k: "pp" | "t3", spot: readonly [number, number], chips: number[], net: number | null, hit: string | null) => (
    <div className={`bjt-side ${big} ${betting ? "can" : ""} ${net !== null && net !== 0 ? (net > 0 ? "won" : "lost") : ""}`} style={at(spot[0], spot[1])}
      onClick={betting ? () => onSide(k) : undefined} role={betting ? "button" : undefined} aria-label={betting ? (k === "pp" ? "Ставка на пары" : "Ставка 21+3") : undefined}>
      {geo.big && <span className="bjt-ring" aria-hidden="true"><small>ПАРЫ</small></span>}
      <Stack chips={chips} cls={`side ${net !== null && net < 0 ? "gone" : ""}`} label={chips.length ? money(sum(chips)) : undefined} onTap={betting ? () => onUnchip(k) : undefined} title={betting ? "Убрать фишку" : undefined} />
      {net !== null && net > 0 && <Stack chips={chipsOf(net)} cls="side paid" />}
      {net !== null && net !== 0 && <span className={`bjt-side-res ${net > 0 ? "win" : "lose"}`}>{net > 0 ? `${hit} ${signed(net)}` : signed(net)}</span>}
    </div>
  );
  return (
    <>
      <div className={`bjt-box ${big} ${s.me ? "me" : ""} ${turn ? "turn" : ""} ${betting ? "can" : ""}`} style={box} onClick={betting ? onBox : undefined}
        role={betting ? "button" : undefined} aria-label={betting ? "Поставить фишку" : undefined}>
        <div className={`bjt-hands n${Math.min(hands.length, 4)}`}>
          {hands.map((h, k) => {
            const active = turn && table.turn?.hand === k;
            const res = done && h.outcome ? h.outcome : null;
            const net = res ? handNet(h, s.free) : 0;
            return (
              <div key={k} className={`bjt-hand ${active ? "active" : ""} ${res ? `res-${res}` : ""}`}>
                {res && <span className={`bjt-out ${res}`}>{res === "lose" && h.value > 21 ? "Перебор" : h.title} {res !== "push" ? signed(net) : ""}</span>}
                <div className="bj-cards">{h.cards.map((c) => <Card key={c.n} c={c} delay={delayOf(`c${c.n}`)} />)}</div>
                <b className={`bjt-hv num ${h.value > 21 && reveal ? "bust" : ""}`}>{reveal ? h.value : "…"}</b>
                {active && myTurnHand === k && <span className="bj-arrow">▼</span>}
                <span className="bjt-bet">
                  <Stack chips={s.free ? [] : chipsOf(h.bet)} free={s.free} cls={res === "lose" ? "gone" : ""} label={money(s.free ? BJ_FREE.bet : h.bet)} />
                  {res && net > 0 && <Stack chips={chipsOf(net)} cls="paid" />}
                </span>
              </div>
            );
          })}
        </div>
        {!hands.length && (
          <span className="bjt-bet">
            <Stack chips={mainChips} free={fresh ? free : s.ready && s.free} label={mainChips.length || (fresh ? free : s.ready && s.free) ? money((fresh ? free : s.free) ? BJ_FREE.bet : sum(mainChips)) : undefined}
              onTap={betting && !free ? () => onUnchip("main") : undefined} title={betting ? "Убрать фишку" : undefined} />
          </span>
        )}
      </div>
      {side("pp", geo.pp, ppChips, nets ? (s.pp > 0 ? nets.pp : null) : null, s.side?.pp ? PP_TITLES[s.side.pp as PairHit] : null)}
      <span className={`bjt-name ${big} ${s.me ? "me" : ""}`} style={at(mid[0], mid[1])}>
        <b>{s.name}</b>
        {total !== null ? <i className={`num ${total > 0 ? "win" : total < 0 ? "lose" : ""}`}>{signed(total)}</i> : status && <i>{status}</i>}
      </span>
    </>
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
  // poll while the window is open
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
  const mySeat = view?.seat ?? null;
  const me = table && mySeat !== null ? table.seats[mySeat] : null;
  const myTurn = !!table && table.phase === "playing" && table.turn?.seat === mySeat;
  const left = table?.deadline ? Math.max(0, Math.ceil((table.deadline - (now + skew.current)) / 1000)) : null;
  const usd = state?.wallet.USD ?? 0;

  // the stake being put down: chips go onto the box and the circles one by one, a tap on a pile takes its top chip off
  const [chip, setChip] = useState<number>(5);
  const [pending, setPending] = useState<Pending>(NO_BET);
  const [free, setFree] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const round = table?.round ?? 0;
  useEffect(() => { setPending(NO_BET); setFree(false); }, [round, table?.id]);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 1800);
    return () => clearTimeout(t);
  }, [note]);
  const betting = !!me && table?.phase === "betting" && !me.ready;
  const cost = (free ? 0 : sum(pending.main)) + sum(pending.pp) + sum(pending.t3);
  const put = (k: keyof Pending) => {
    if (k === "main" && free) { setNote("Бесплатная ставка — 1 USD, сайды можно добавить"); return; }
    const cap = k === "main" ? BJ_BET.max : BJ_SIDE_MAX;
    const have = sum(pending[k]);
    // the chosen chip, or the largest one that still fits under the limit
    const room = cap - have;
    const c = chip <= room ? chip : [...TRAY].reverse().find((d) => d <= room);
    if (!c) { haptic.err(); setNote(k === "main" ? `Ставка — до ${BJ_BET.max} USD` : `Сайд — до ${BJ_SIDE_MAX} USD`); return; }
    if (cost + c > usd) { haptic.err(); setNote("Не хватает USD"); return; }
    haptic.tap();
    sfx("tap", 0.35);
    setPending((p) => ({ ...p, [k]: [...p[k], c] }));
  };
  const unchip = (k: keyof Pending) => {
    haptic.tap();
    setPending((p) => ({ ...p, [k]: p[k].slice(0, -1) }));
  };
  const repeat = () => {
    if (!me) return;
    haptic.tap();
    setPending({ main: chipsOf(me.bet).reverse(), pp: chipsOf(me.pp).reverse(), t3: chipsOf(me.t3).reverse() });
  };
  const place = async () => {
    const r = await run("bj_bet", { bet: free ? me?.bet ?? BJ_BET.min : sum(pending.main), pp: sum(pending.pp), t3: sum(pending.t3), free });
    if (r) { setPending(NO_BET); setFree(false); }
  };

  // what the round brought me: hands and sides, stakes back not counted
  const mineDone = !!me && table?.settled && reveal && me.hands.length > 0 && !(table.phase === "betting" && (me.ready || pending.main.length + pending.pp.length + pending.t3.length > 0 || free));
  const summary = useMemo(() => {
    if (!me || !mineDone) return null;
    const hands = me.hands.reduce((t, h) => t + handNet(h, me.free), 0);
    const sides = sideNets(me);
    return { total: Math.round((hands + sides.pp + sides.t3) * 100) / 100, hands, pp: me.pp > 0 ? sides.pp : null, t3: me.t3 > 0 ? sides.t3 : null };
  }, [me, mineDone]);
  const resultKey = table ? `${table.id}:${table.round}` : "";
  const played = useRef("");
  useEffect(() => {
    if (!summary || played.current === resultKey) return;
    played.current = resultKey;
    if (summary.total > 0) { haptic.ok(); sfx("reward"); } else if (summary.total < 0) haptic.err();
  }, [summary, resultKey]);
  const waiting = table ? table.seats.filter((x) => x && !x.ready && !x.left).length : 0;


  let panel: ReactNode = null;
  if (view && !table) {
    panel = (
      <div className="bjt-lobby">
        {view.invites.map((inv) => (
          <div key={inv.id} className="bj-inv row">
            <span className="grow"><b>{inv.from}</b> зовёт тебя за стол</span>
            <button className="btn small green" disabled={busy === "bj_join"} onClick={() => run("bj_join", { inviteId: inv.id })}>Сесть</button>
            <button className="btn small dark" onClick={() => run("bj_decline", { inviteId: inv.id })} aria-label="Отказаться">✕</button>
          </div>
        ))}
        <button className="btn big block gold" disabled={busy === "bj_open"} onClick={() => run("bj_open")}>Сесть за стол</button>
        <span className="tiny center bjt-hint">Ставки {BJ_BET.min}–{BJ_BET.max} USD, сайд «Пары» до {BJ_SIDE_MAX} USD. Сядешь — позовёшь соклановцев на свободные боксы. Бесплатных ставок сегодня: {view.free.left}/{view.free.perDay}</span>
      </div>
    );
  } else if (table && view) {
    const line = note ? <span className="bjt-note">{note}</span>
      : summary ? (
        <span className={`bjt-sum ${summary.total > 0 ? "win" : summary.total < 0 ? "lose" : ""}`}>
          <b>{summary.total > 0 ? `Выигрыш ${signed(summary.total)}` : summary.total < 0 ? `Минус ${money(-summary.total)}` : "В ноль"}</b> <Icon name="USD" size={14} />
          <small> рука {signed(summary.hands)}{summary.pp !== null ? ` · пары ${signed(summary.pp)}` : ""}</small>
        </span>
      )
      : table.phase === "playing"
        ? (!reveal ? "Раздаём…" : myTurn ? <>Твой ход{left !== null ? ` · ${left} с` : ""}</> : table.turn ? <>Ходит <b>{table.seats[table.turn.seat]?.name}</b>{left !== null ? ` · ${left} с` : ""}</> : "Дилер открывает карты…")
        : betting ? "Фишку — на своё поле (ставка) или на кружок «Пары» над ним. Нажми на фишки, чтобы убрать"
        : me?.ready ? <>Ставка на столе. {waiting > 0 ? <>Ждём остальных ({waiting}){left !== null ? ` · раздача через ${left} с` : ""}</> : "Раздаём…"}</>
        : "";
    panel = (
      <div className="bjt-ctrl">
        <div className="bjt-line tiny">{line}</div>
        {table.phase === "playing" && myTurn && reveal ? (
          <div className="bj-moves">
            <button className="btn gold" disabled={!!busy || !view.moves?.hit} onClick={() => run("bj_move", { move: "hit" })}>Ещё</button>
            <button className="btn red" disabled={!!busy || !view.moves?.stand} onClick={() => run("bj_move", { move: "stand" })}>Хватит</button>
            <button className="btn green" disabled={!!busy || !view.moves?.double} onClick={() => run("bj_move", { move: "double" })}>Удвоить</button>
            <button className="btn dark" disabled={!!busy || !view.moves?.split} onClick={() => run("bj_move", { move: "split" })}>Разбить</button>
          </div>
        ) : betting ? (
          <>
            <div className="bjt-tray">
              {TRAY.map((v) => (
                <button key={v} type="button" className={`chp big v${v} ${chip === v && !free ? "on" : ""}`} onClick={() => { haptic.tap(); setChip(v); }} aria-label={`Фишка ${v}`}>{v}</button>
              ))}
              {view.free.left > 0 && (
                <button type="button" className={`chp big vfree ${free ? "on" : ""}`} onClick={() => { haptic.tap(); setFree((f) => !f); setPending((p) => ({ ...p, main: [] })); }}
                  title={`Бесплатная ставка ${BJ_FREE.bet} USD: выигрыш твой, проигрыш ничего не стоит`}>
                  FREE<small>{view.free.left}/{view.free.perDay}</small>
                </button>
              )}
            </div>
            <div className="bjt-acts">
              {cost > 0 || free
                ? <button className="btn dark" onClick={() => { haptic.tap(); setPending(NO_BET); setFree(false); }}>Убрать всё</button>
                : <button className="btn dark" disabled={!me || (!me.bet && !me.pp && !me.t3) || round === 0} onClick={repeat}>Повторить</button>}
              <button className="btn gold grow" disabled={busy === "bj_bet" || (!free && pending.main.length === 0) || cost > usd} onClick={place}>
                {free ? "Поставить бесплатно" : <>Поставить · {money(cost)} <Icon name="USD" size={16} /></>}{free && cost > 0 ? <> + {money(cost)} <Icon name="USD" size={16} /></> : null}
              </button>
            </div>
          </>
        ) : me?.ready && table.phase === "betting" ? (
          <div className="bjt-acts">
            <button className="btn dark grow" disabled={!!busy} onClick={() => run("bj_unbet")}>Снять ставку</button>
            {waiting > 0 && <button className="btn gold grow" disabled={!!busy} onClick={() => run("bj_deal")}>Раздать сейчас</button>}
          </div>
        ) : null}
      </div>
    );
  }

  // the other players fill the five boxes in seat order; my seat is the big field
  const others = table ? table.seats.map((x, i) => ({ s: x, i })).filter((x) => x.i !== mySeat).slice(0, OTHER_SEATS.length) : [];
  return (
    <Modal onClose={onClose} full>
      <div className="gstage bleed bj2">
        {/* the felt is the whole window: [?], the wallet and «встать» in the corner opposite [×] */}
        <div className="bj2-top">
          <BlackjackHelp />
          <span className="bjt-wallet"><Icon name="USD" size={16} /><b className="num">{money(usd)}</b></span>
          {table && <button className="btn small dark" disabled={!!busy} onClick={() => run("bj_leave")}>Встать</button>}
        </div>
        <div className="bjt-stage bj2-stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bjt-felt" src="/assets/yard/bj-room.webp" alt="" draggable={false} />
          {!view && <span className="bjt-loading tiny">Раскладываем стол…</span>}
          {table && (
            <>
              <div className="bjt-dealer">
                <div className="bj-cards dealer">
                  {table.dealer.map((c) => <Card key={`c${c.n}`} c={c} delay={delayOf(`c${c.n}`)} />)}
                  {table.dealerHidden && <Card key={`h${table.dealerHidden.n}`} back delay={delayOf(`h${table.dealerHidden.n}`)} />}
                </div>
                {!!table.dealer.length && <span className="bjt-dlbl">Дилер · <b className={`num ${reveal && table.dealerValue > 21 ? "bust" : ""}`}>{reveal ? table.dealerValue : "…"}</b>{table.dealerHidden ? "+?" : ""}</span>}
              </div>
              {OTHER_SEATS.map((geo, k) => {
                const o = others[k];
                return (
                  <SeatSpot key={`o${k}`} s={o?.s ?? null} i={o?.i ?? -1} geo={geo} table={table} reveal={reveal} delayOf={delayOf} myTurnHand={null}
                    betting={false} pending={NO_BET} free={false} onBox={() => {}} onSide={() => {}} onUnchip={() => {}}
                    canInvite={!!me && (!o || !o.s)} onInvite={() => setInviteSeat(k)} />
                );
              })}
              {me && mySeat !== null && (
                <SeatSpot s={me} i={mySeat} geo={MY_SEAT} table={table} reveal={reveal} delayOf={delayOf} myTurnHand={myTurn ? table.turn!.hand : null}
                  betting={betting} pending={pending} free={free} onBox={() => put("main")} onSide={(k) => put(k)} onUnchip={unchip}
                  canInvite={false} onInvite={() => {}} />
              )}
            </>
          )}
          <div className="bjt-panel bj2-panel" style={{ ...at(44, 1262), width: `${((841 - 88) / TW) * 100}%`, height: `${((1552 - 1262) / TH) * 100}%` }}>{panel}</div>
        </div>
      </div>
      {inviteSeat !== null && view && (
        <InvitePicker view={view} onClose={() => setInviteSeat(null)} onPick={async (id) => { await run("bj_invite", { playerId: id }); sfx("tap"); }} />
      )}
    </Modal>
  );
}
