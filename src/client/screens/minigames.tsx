"use client";
/*
 * Мини-игры двора (пока кнопками, потом станут объектами во дворе): блэкджек, зонк (кости) и апгрейдер находок.
 * Правила и выплаты — content/games.ts, карты и кости — на сервере (server/systems/games.ts).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useGame } from "../store.tsx";
import { Coin, Modal, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { full } from "../format.ts";
import type { GameView, PokerPlay } from "../api.ts";
import { BlackjackWindow } from "./blackjack.tsx";
import { itemById } from "../../content/items.ts";
import {
  GAME_RULES, ZONK_RUB_PER_1000, ZONK_USD_PER_1000, ITEM_VALUES, RANKS, SUITS, UPGRADE_MODES, upgradeChanceOf, upgradeMode, upgradeTarget, upgradeValue, zonkScore, zonkPrize, ZONK_ROUNDS,
  POKER_HANDS, POKER_LEVEL_BONUS, POKER_MAX_LEVEL, POKER_RULES, pokerPay,
  type GameKind, type PokerHand, type UpgradeMode,
} from "../../content/games.ts";

/* ---------------- shared: free games / price line and the start button ---------------- */
function StartLine({ kind, onStart, again }: { kind: GameKind; onStart: () => void; again?: boolean }) {
  const { state, busy } = useGame();
  const g = state?.games?.[kind];
  if (!g) return null;
  const free = g.freeLeft > 0;
  const usd = state?.wallet[g.price.currency] ?? 0;
  return (
    <div className="col" style={{ gap: 6 }}>
      <button className={`btn big block ${free ? "green" : "gold"}`} disabled={busy === "game_start" || (!free && usd < g.price.amount)} onClick={onStart}>
        {again ? "Ещё партию" : "Играть"} · {free ? "бесплатно" : <>{g.price.amount} <Icon name={g.price.currency} size={18} /></>}
      </button>
      <span className="tiny muted center">
        Бесплатных сегодня: <b className="num" style={{ color: "var(--ink)" }}>{g.freeLeft}/{g.freePerDay}</b>
        {!free && usd < g.price.amount && <span style={{ color: "var(--red)" }}> · не хватает {g.price.currency}</span>}
      </span>
    </div>
  );
}

function ResultLine({ g }: { g: GameView }) {
  if (g.status !== "done" || !g.result) return null;
  const won = !!g.result.reward;
  return (
    <div className={`mg-result ${won ? "win" : "lose"}`}>
      <b className="display">{g.result.title}</b>
      {g.result.reward ? <RewardChips r={g.result.reward} size={16} /> : <span className="tiny muted">без выигрыша</span>}
    </div>
  );
}

/* ---------------- a playing card (poker) ---------------- */
export function PlayingCard({ r, s, back, i }: { r?: number; s?: number; back?: boolean; i: number }) {
  if (back || r === undefined || s === undefined) return <span className="pcard back" style={{ ["--i" as string]: i }} />;
  const red = s === 1 || s === 2;
  return (
    <span className={`pcard ${red ? "red" : ""}`} style={{ ["--i" as string]: i }}>
      <b>{RANKS[r]}</b>
      <i>{SUITS[s]}</i>
      <b className="pcard-low">{RANKS[r]}</b>
    </span>
  );
}

/* ---------------- zonk ---------------- */
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};
function DieFace({ v }: { v: number }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
      {PIPS[v].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9.5" fill={v === 1 ? "#e8173c" : "#1e1006"} />)}
    </svg>
  );
}
function Die({ v, on, onClick, small, style, hint }: { v: number; on?: boolean; onClick?: () => void; small?: boolean; style?: CSSProperties; hint?: boolean }) {
  return (
    <button className={`die ${on ? "on" : ""} ${small ? "small" : ""} ${hint ? "hint" : ""}`} onClick={onClick} disabled={!onClick} aria-label={`кость ${v}`} style={style}>
      <DieFace v={v} />
    </button>
  );
}

const counts = (dice: number[]) => {
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) n[d]++;
  return n;
};
/** the scoring table on the right of the board; a row lights up when the roll has it, brighter when it is picked */
const COMBOS: { key: string; dice: number[]; label: string; test: (n: number[], len: number) => boolean }[] = [
  { key: "1", dice: [1], label: "100", test: (n) => n[1] >= 1 },
  { key: "5", dice: [5], label: "50", test: (n) => n[5] >= 1 },
  { key: "111", dice: [1, 1, 1], label: "1000", test: (n) => n[1] >= 3 },
  ...[2, 3, 4, 5, 6].map((f) => ({ key: `${f}${f}${f}`, dice: [f, f, f], label: String(f * 100), test: (n: number[]) => n[f] >= 3 })),
  { key: "4k", dice: [3, 3, 3, 3], label: "×2", test: (n) => n.some((x) => x >= 4) },
  { key: "5k", dice: [3, 3, 3, 3, 3], label: "×4", test: (n) => n.some((x) => x >= 5) },
  { key: "6k", dice: [3, 3, 3, 3, 3, 3], label: "×8", test: (n) => n.some((x) => x >= 6) },
  { key: "str", dice: [1, 2, 3, 4, 5, 6], label: "1500", test: (n, len) => len === 6 && n.slice(1).every((x) => x === 1) },
  { key: "pairs", dice: [2, 2, 4, 4, 6, 6], label: "750", test: (n, len) => len === 6 && n.filter((x) => x === 2).length === 3 },
];
/** the dice worth keeping: everything that scores (all six for a straight or three pairs) */
function bestPick(roll: number[]): number[] {
  const n = counts(roll);
  if (roll.length === 6 && (n.slice(1).every((x) => x === 1) || n.filter((x) => x === 2).length === 3)) return roll.map((_, i) => i);
  return roll.map((v, i) => (v === 1 || v === 5 || n[v] >= 3 ? i : -1)).filter((i) => i >= 0);
}
/** where the dice land on the board: one per cell of a 3×2 grid, nudged and turned (stable for one roll) */
function scatter(seed: number, i: number) {
  const r = (k: number) => {
    const x = Math.sin(seed * 9301 + i * 49297 + k * 233) * 10000;
    return x - Math.floor(x);
  };
  const col = i % 3, row = Math.floor(i / 3);
  return { left: `${6 + col * 25 + r(1) * 8}%`, top: `${20 + row * 36 + r(2) * 10}%`, ["--rot" as string]: `${Math.round(r(3) * 70 - 35)}deg` };
}

function ZonkHelp() {
  const p = GAME_RULES.zonk;
  return (
    <Help topic="zonk" title="Зонк">
      <p>В партии {ZONK_ROUNDS} попыток. В каждой бросаешь 6 костей и забираешь очковые (нажми на кость — она уходит с поля наверх), потом решаешь: бросить оставшиеся — рискнуть ради большего — или записать очки попытки. Бросок без единой очковой кости — «Зонк»: очки этой попытки сгорают. Забрал все шесть — бросаешь все шесть заново.</p>
      <p>Очки каждой попытки записываются в столбик слева. Награда — только когда сыграны все {ZONK_ROUNDS} попыток: общий счёт превращается в деньги.</p>
      <p>Бесплатно — {p.freePerDay} игра в день: 1000 очков = {ZONK_RUB_PER_1000} RUB. Дальше {p.price.amount} USD за игру: 1000 очков = {ZONK_USD_PER_1000} USD.</p>
      <p>Таблица справа: строка светится, если такая комбинация есть в броске, и горит ярко, когда ты её забрал. «?» сама заберёт все очковые кости.</p>
    </Help>
  );
}

function Cup() {
  return (
    <svg viewBox="0 0 80 90" width="100%" height="100%" aria-hidden="true">
      <path d="M10 14 L70 14 L62 84 Q40 90 18 84 Z" fill="#c98a52" stroke="#3a1d0b" strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="40" cy="14" rx="30" ry="9" fill="#7a4720" stroke="#3a1d0b" strokeWidth="4" />
      <path d="M16 30 L64 30 M17 66 L63 66" stroke="#3a1d0b" strokeWidth="3" opacity="0.45" />
      <path d="M22 22 L26 78" stroke="#f0c08a" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

function RollIcon() {
  return (
    <svg viewBox="0 0 48 40" width="34" height="28" aria-hidden="true">
      <rect x="3" y="10" width="22" height="22" rx="5" fill="#fffdf6" stroke="#1e1006" strokeWidth="3" transform="rotate(-14 14 21)" />
      <circle cx="10" cy="17" r="2.4" fill="#1e1006" /><circle cx="17" cy="24" r="2.4" fill="#1e1006" />
      <rect x="22" y="5" width="22" height="22" rx="5" fill="#fffdf6" stroke="#1e1006" strokeWidth="3" transform="rotate(12 33 16)" />
      <circle cx="28" cy="11" r="2.4" fill="#1e1006" /><circle cx="33" cy="16" r="2.4" fill="#e8173c" /><circle cx="38" cy="21" r="2.4" fill="#1e1006" />
      <path d="M8 37 q8 -4 16 0 M28 33 q6 -3 12 0" stroke="#1e1006" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
function BankIcon() {
  return (
    <svg viewBox="0 0 40 40" width="28" height="28" aria-hidden="true">
      <rect x="6" y="4" width="26" height="32" rx="4" fill="#fffdf6" stroke="#1e1006" strokeWidth="3" />
      <path d="M11 12 H27 M11 18 H22" stroke="#1e1006" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <path d="M12 26 l5 5 l11 -12" stroke="#13a35a" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ZonkWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const active = state?.games?.zonk.active ?? null;
  const [last, setLast] = useState<GameView | null>(null);
  const g = active ?? last;
  const [pick, setPick] = useState<number[]>([]);
  useEffect(() => setPick([]), [g?.roll?.join(","), g?.status]);
  const roll = g?.roll ?? [];
  const picked = pick.map((i) => roll[i]);
  const pts = picked.length ? zonkScore(picked) : null;
  const playing = g?.status === "active";
  const seed = (g?.id ?? 1) * 13 + (g?.history?.length ?? 0) * 7 + (g?.round ?? 1) * 31;
  const run = async (type: string, body: Record<string, unknown>) => {
    haptic.tap();
    sfx("tap");
    const r = await act<GameView>(type, body);
    if (r) {
      setLast(r);
      if (r.status === "done") {
        if (r.result?.reward) { haptic.ok(); sfx("reward"); } else { haptic.err(); sfx("error"); }
      }
    }
  };
  const toggle = (i: number) => { haptic.tap(); setPick((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i])); };
  const turn = (g?.turn ?? 0) + (pts ?? 0);
  const nRoll = counts(playing ? roll : []);
  const nPick = counts(picked);
  const hints = playing ? new Set(bestPick(roll)) : new Set<number>();
  const kept = playing ? (g?.history ?? []).flatMap((h) => h.kept) : [];
  const rounds = g?.rounds ?? ZONK_ROUNDS;
  const scores = g?.scores ?? [];
  const round = Math.min(g?.round ?? 1, rounds);
  const total = playing ? g?.total ?? 0 : g?.result?.points ?? g?.total ?? 0;
  const left = (() => { const l = (g?.left ?? 6) - pick.length; return l <= 0 ? 6 : l; })();
  const status = !g ? "Сыграй 10 попыток — общий счёт превратится в награду"
    : !playing ? (g.result?.title ?? "")
    : pick.length === 0 ? "Нажми на очковые кости (подсвечены), чтобы забрать"
    : pts === null ? "Среди забранных есть кости без очков — верни их"
    : null;
  return (
    <Modal title={<span className="title-row">Зонк <ZonkHelp /></span>} onClose={onClose} maxWidth={500}>
      <div className="zk-head">
        <span>ПОПЫТКА <b className="num">{g ? round : 0}/{rounds}</b></span>
        <span>ВСЕГО <b className="num">{full(total)}</b></span>
        <span>ХОД <b className="num">{full(playing ? turn : 0)}</b></span>
      </div>
      <div className="zk">
        <div className="zk-board">
          {/* every attempt's points, top to bottom */}
          <div className="zk-rounds" aria-label="Очки попыток">
            {Array.from({ length: rounds }, (_, i) => {
              const sc = scores[i];
              const now = playing && i === scores.length;
              return (
                <span key={i} className={`zk-rd ${sc ? (sc.zonk ? "zonk" : "ok") : ""} ${now ? "now" : ""}`}>
                  <i>{i + 1}</i>
                  <b className="num">{sc ? (sc.zonk ? "✕" : sc.points >= 1000 ? `${Math.round(sc.points / 100) / 10}k` : sc.points) : now ? "…" : ""}</b>
                </span>
              );
            })}
          </div>
          {/* what is taken this attempt: earlier throws (fixed) and the dice picked now (tap to put back) */}
          <div className="zk-tray" aria-label="Забрано">
            {kept.map((v, i) => <span key={`k${i}`} className="zk-tray-die old"><DieFace v={v} /></span>)}
            {pick.map((i) => <button key={`p${i}`} className="zk-tray-die" onClick={() => toggle(i)} aria-label={`вернуть ${roll[i]}`}><DieFace v={roll[i]} /></button>)}
          </div>
          {playing && g?.last && (
            <div key={`${g.round}-${scores.length}`} className={`zk-last ${g.last.zonk ? "zonk" : ""}`}>{g.last.zonk ? (g.last.points ? `Зонк! −${full(g.last.points)}` : "Зонк!") : `+${full(g.last.points)} в счёт`}</div>
          )}
          {playing
            ? roll.map((v, i) => (pick.includes(i) ? null : <Die key={`${seed}-${i}`} v={v} hint={hints.has(i)} onClick={() => toggle(i)} style={scatter(seed, i)} />))
            : !g && [1, 2, 3, 4, 5, 6].map((v, i) => <Die key={v} v={v} style={scatter(3, i)} />)}
          {g?.status === "done" && <div className={`zk-over display ${g.result?.outcome === "zonk" ? "zonk" : ""}`}>{g.result?.outcome === "zonk" ? "ЗОНК!" : full(g.result?.points ?? 0)}</div>}
          <span className="zk-cup"><Cup /></span>
        </div>
        <div className="zk-table">
          <b className="tiny zk-table-h">КОМБИНАЦИИ</b>
          {COMBOS.map((c) => {
            const can = c.test(nRoll, roll.length);
            const on = picked.length > 0 && c.test(nPick, picked.length);
            return (
              <div key={c.key} className={`zk-row ${can ? "can" : ""} ${on ? "on" : ""}`}>
                <span className="zk-mini">{c.dice.map((d, k) => <i key={k}><DieFace v={d} /></i>)}</span>
                <b className="num">{c.label}</b>
              </div>
            );
          })}
        </div>
      </div>
      {/* one fixed-height line: the window never jumps */}
      <div className="zk-status">
        {status !== null ? <span className="tiny">{status}</span> : (
          <span className="tiny zk-status-row">Забрано +{pts} → в счёте будет {full((g?.total ?? 0) + turn)} = <RewardChips r={zonkPrize((g?.total ?? 0) + turn, !!g?.paid)} size={13} /></span>
        )}
        {!playing && g?.result?.reward && <RewardChips r={g.result.reward} size={14} />}
      </div>
      {playing ? (
        <div className="zk-ctrl">
          <button className="zk-q" disabled={busy === "zonk_move"} onClick={() => setPick(bestPick(roll))} aria-label="Подсказка" title="Подсказка: забрать все очковые">?</button>
          <button className="zk-act gold" disabled={busy === "zonk_move" || pts === null} onClick={() => run("zonk_move", { pick, then: "roll" })}>
            <RollIcon /><small>Бросить {left}</small>
          </button>
          <button className="zk-act green" disabled={busy === "zonk_move" || pts === null} onClick={() => run("zonk_move", { pick, then: "bank" })}>
            <BankIcon /><small>{round >= rounds ? "Записать и закончить" : "Записать"}</small>
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}><StartLine kind="zonk" again={!!g} onStart={() => run("game_start", { game: "zonk" })} /></div>
      )}
    </Modal>
  );
}

/* ---------------- poker ---------------- */
function PokerHelp() {
  return (
    <Help topic="poker" title="Покер">
      <p>Сразу сдаётся 5 карт. Собралась комбинация из таблицы — получаешь награду, чем старше комбинация, тем больше.</p>
      <p>Раздача — {POKER_RULES.price.amount} USD, до {POKER_RULES.perDay} раздач в день.</p>
      <p>Каждая раздача даёт опыт покера (за старшие комбинации — больше). Каждый уровень покера добавляет +{Math.round(POKER_LEVEL_BONUS * 1000) / 10}% к денежной награде, максимум {POKER_MAX_LEVEL} уровень.</p>
    </Help>
  );
}

function MiniCard({ r, s }: { r: number; s: number }) {
  return <span className={`pk-mini ${s === 1 || s === 2 ? "red" : ""}`}><b>{RANKS[r]}</b><i>{SUITS[s]}</i></span>;
}

export function PokerWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const info = state?.poker;
  const [play, setPlay] = useState<PokerPlay | null>(null);
  const [deal, setDeal] = useState(0);
  const p = play?.poker ?? info;
  const level = p?.level ?? 0;
  const pct = !p ? 0 : p.to === null ? 100 : Math.max(0, Math.min(100, ((p.xp - p.from) / (p.to - p.from)) * 100));
  const usd = state?.wallet[POKER_RULES.price.currency] ?? 0;
  const left = p?.left ?? 0;
  const run = async () => {
    haptic.tap();
    sfx("tap");
    const r = await act<PokerPlay>("poker_play", {});
    if (r) {
      setPlay(r);
      setDeal((d) => d + 1);
      if (r.reward) { haptic.ok(); sfx("reward"); } else haptic.err();
    }
  };
  const hand: PokerHand | null = play?.hand ?? null;
  return (
    <Modal title={<span className="title-row">Покер <PokerHelp /></span>} onClose={onClose} maxWidth={780}>
      <div className="pk">
        <div className="pk-lvl" title={p ? `${p.xp}${p.to !== null ? ` / ${p.to}` : ""} опыта покера` : undefined}>
          <b className="display num">{level}</b>
          <span className="tiny">ур.</span>
          <div className="pk-bar"><i style={{ height: `${pct}%` }} /></div>
        </div>
        <div className="mg-table pk-felt">
          <div className="pk-cards" key={deal}>
            {play
              ? play.cards.map((c, i) => (
                <span key={i} className={`pk-slot ${play.used.includes(i) && hand !== "high" ? "used" : ""} ${hand !== "high" && !play.used.includes(i) ? "dim" : ""}`}>
                  <PlayingCard i={i} r={c.r} s={c.s} />
                </span>
              ))
              : Array.from({ length: 5 }, (_, i) => <span key={i} className="pk-slot"><PlayingCard i={i} back /></span>)}
          </div>
          {play ? (
            <div className={`pk-res ${play.reward ? "win" : ""}`}>
              <b className="display">{play.title}</b>
              {play.reward ? <RewardChips r={play.reward} size={15} /> : <span className="tiny muted">без выигрыша</span>}
              <span className="tiny">+{play.gainedXp} опыта покера{play.levelUp ? <b className="pk-up"> · новый уровень {level}!</b> : null}</span>
            </div>
          ) : (
            <div className="pk-res"><span className="tiny muted">Сдаём 5 карт — собери комбинацию из таблицы</span></div>
          )}
          <button className="btn big gold pk-go" disabled={busy === "poker_play" || left <= 0 || usd < POKER_RULES.price.amount} onClick={run}>
            {play ? "Ещё раздачу" : "Раздать"} · {POKER_RULES.price.amount} <Icon name={POKER_RULES.price.currency} size={18} />
          </button>
          <span className="tiny pk-left">
            Раздач сегодня: <b className="num">{(p?.perDay ?? POKER_RULES.perDay) - left}/{p?.perDay ?? POKER_RULES.perDay}</b>
            {left > 0 && usd < POKER_RULES.price.amount && <span style={{ color: "var(--red)" }}> · не хватает USD</span>}
            {left <= 0 && <span> · приходи завтра</span>}
          </span>
        </div>
        <div className="pk-table">
          {POKER_HANDS.filter((h) => h.id !== "high").map((h) => (
            <div key={h.id} className={`pk-row ${hand === h.id ? "on" : ""}`}>
              <span className="pk-row-cards">{h.sample.map((c, k) => <MiniCard key={k} r={c.r} s={c.s} />)}</span>
              <span className="pk-row-name tiny">{h.name}</span>
              <span className="pk-row-pay"><RewardChips r={pokerPay(h.id, level)} size={12} /></span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- upgrader ---------------- */
const pctText = (c: number) => `${(Math.round(c * 10000) / 100).toLocaleString("ru-RU")}%`;

function Gauge({ chance, roll, spinning, won }: { chance: number; roll: number | null; spinning: boolean; won: boolean | null }) {
  // the arc: the green part is the chance (from the top, clockwise), the needle lands on the roll
  const r = 70, c = 2 * Math.PI * r;
  const angle = roll === null ? 0 : roll * 360;
  return (
    <div className={`upg-gauge ${won === true ? "won" : won === false ? "lost" : ""}`}>
      <svg viewBox="0 0 180 180" aria-hidden="true">
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" />
        <circle cx="90" cy="90" r={r} fill="none" stroke={chance >= 0.35 ? "#2ee88a" : chance >= 0.2 ? "#ffcc33" : "#ff7a45"} strokeWidth="16" strokeDasharray={`${Math.max(0.5, chance * c)} ${c}`} transform="rotate(-90 90 90)" />
        <g className={`upg-needle ${spinning ? "spin" : ""}`} style={{ ["--a" as string]: `${angle + (spinning ? 1440 : 0)}deg` }}>
          <path d="M90 14 L84 34 H96 Z" fill="#ffd23f" stroke="#1e1006" strokeWidth="2" />
        </g>
      </svg>
      <div className="upg-center">
        <b className="display num">{pctText(chance)}</b>
        <span className="tiny muted">{won === true ? "прокачано!" : won === false ? "сгорело" : chance >= 0.35 ? "хороший шанс" : chance >= 0.2 ? "средний шанс" : "низкий шанс"}</span>
      </div>
    </div>
  );
}

function UpgraderHelp() {
  return (
    <Help topic="upgrader" title="Апгрейдер">
      <p>Ставишь вещь — находку, оружие, энергетик (можно несколько одинаковых) или уже улучшенную вещь — и выбираешь множитель: ×2, ×4, ×8, или шанс: 15%, 30%, 70%. Шанс = 90% ÷ множитель.</p>
      <p>Получилось — в инвентарь падает <b>улучшенная</b> вещь с золотой обводкой: она стоит «ставка × множитель» и столько же даёт при продаже. В остальном это та же вещь: энергетик даёт ту же энергию, оружие бьёт так же (возьми его в бой). Не повезло — ставка сгорает.</p>
      <p>Улучшенную вещь можно поставить снова — и так дойти хоть до Rug Pull Gun.</p>
    </Help>
  );
}

type Stake = { kind: "plain"; id: string } | { kind: "up"; uid: number };

export function UpgraderWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const inv = useMemo(() => new Map((state?.inventory ?? []).map((x) => [x.id, x.qty])), [state?.inventory]);
  const ups = state?.upgraded ?? [];
  const plain = Object.keys(ITEM_VALUES).filter((id) => (inv.get(id) ?? 0) > 0).sort((a, b) => ITEM_VALUES[a] - ITEM_VALUES[b]);
  const [stake, setStake] = useState<Stake | null>(null);
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState<UpgradeMode>("x2");
  const [roll, setRoll] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<boolean | null>(null);
  // the stake as it was when the spin started: shown while the needle runs, then it burns away on a loss
  const [snap, setSnap] = useState<{ id: string; up: boolean; burn: boolean } | null>(null);
  // the stake that is still there (after a spin the old one may be gone)
  const cur: Stake | null = (() => {
    if (stake?.kind === "up" && ups.some((u) => u.uid === stake.uid)) return stake;
    if (stake?.kind === "plain" && (inv.get(stake.id) ?? 0) > 0) return stake;
    if (ups[0]) return { kind: "up", uid: ups[0].uid };
    return plain[0] ? { kind: "plain", id: plain[0] } : null;
  })();
  const up = cur?.kind === "up" ? ups.find((u) => u.uid === cur.uid) ?? null : null;
  const curId = cur ? (cur.kind === "up" ? up?.itemId ?? "" : cur.id) : "";
  const have = cur?.kind === "plain" ? inv.get(cur.id) ?? 0 : 1;
  const q = cur?.kind === "plain" ? Math.max(1, Math.min(qty, have)) : 1;
  const stakeValue = cur ? (cur.kind === "up" ? up?.value ?? 0 : (ITEM_VALUES[cur.id] ?? 0) * q) : 0;
  const m = upgradeMode(mode)!;
  const chance = upgradeChanceOf(m.mult);
  const value = upgradeValue(stakeValue, m.mult);
  const target = upgradeTarget(value);
  const pickStake = (s: Stake) => {
    setStake(s);
    setQty(1);
    setWon(null);
    setRoll(null);
  };
  const spins = state?.upgradeSpins;
  const spinFree = (spins?.freeLeft ?? 1) > 0;
  const spinPrice = spins?.price ?? { currency: "RUB" as const, amount: 500 };
  const canSpin = spinFree || (state?.wallet[spinPrice.currency] ?? 0) >= spinPrice.amount;
  const go = async () => {
    if (!cur || spinning) return;
    setWon(null);
    setSpinning(true);
    setSnap({ id: curId, up: !!up, burn: false });
    haptic.tap();
    sfx("tap");
    const body = cur.kind === "up" ? { uid: cur.uid, mode } : { stake: cur.id, qty: q, mode };
    const r = await act<{ won: boolean; roll: number; uid: number | null }>("upgrade", body);
    if (!r) {
      setSpinning(false);
      setSnap(null);
      return;
    }
    setRoll(r.roll);
    setTimeout(() => {
      setSpinning(false);
      setWon(r.won);
      if (r.won) {
        haptic.big();
        sfx("levelup");
        // the prize becomes the next stake: one more tap to go higher
        if (r.uid) setStake({ kind: "up", uid: r.uid });
        setSnap(null);
      } else {
        haptic.err();
        sfx("error");
        setSnap((s) => (s ? { ...s, burn: true } : null));
      }
    }, 1600);
  };
  return (
    <Modal title={<span className="title-row">Апгрейдер <UpgraderHelp /></span>} onClose={onClose} wide>
      <div className="upg">
        {/* the name and the price sit under the box, in fixed-height lines: nothing jumps when the stake changes */}
        <div className="upg-side">
          <div className={`upg-box stake ${up ? "upgraded" : ""}`}>
            <span className="tiny upg-cap">ТВОЯ СТАВКА</span>
            {cur || snap ? (
              <>
                {snap ? (
                  <span className={`upg-art ${snap.burn ? "upg-burn" : ""}`} onAnimationEnd={(e) => { if (e.animationName === "upg-burn") setSnap(null); }}>
                    <ItemArt id={snap.id} size={72} />{snap.up && <i className="up-star">★</i>}
                    {snap.burn && <i className="upg-embers" aria-hidden="true" />}
                  </span>
                ) : (
                  <span className="upg-art"><ItemArt id={curId} size={72} />{up && <i className="up-star">★</i>}</span>
                )}
                <span className="upg-range">{!snap && cur?.kind === "plain" && have > 1 && <input type="range" min={1} max={have} value={q} onChange={(e) => { setQty(Number(e.target.value)); setWon(null); }} aria-label="Сколько ставить" />}</span>
              </>
            ) : (
              <span className="small muted center">Нечего ставить. Собери находки во дворе.</span>
            )}
          </div>
          <b className="upg-name">{cur ? `${itemById(curId)?.name ?? ""}${up ? " ★" : q > 1 ? ` ×${q}` : ""}` : ""}</b>
          <span className="upg-price num">{cur ? `${full(stakeValue)} ₽` : ""}</span>
        </div>
        <Gauge chance={chance} roll={roll} spinning={spinning} won={won} />
        <div className="upg-side">
          <div className="upg-box target upgraded">
            <span className="tiny upg-cap">ЦЕЛЬ</span>
            <span className="upg-art"><ItemArt id={target} size={72} /><i className="up-star">★</i></span>
            <span className="upg-range" />
          </div>
          <b className="upg-name">{itemById(target)?.name} ★</b>
          <span className="upg-price num gold">{full(value)} ₽</span>
        </div>
      </div>
      <div className="upg-modes">
        {UPGRADE_MODES.map((x) => (
          <button key={x.id} className={`upg-mode ${x.id.startsWith("c") ? `ch ch-${x.id}` : ""} ${x.id === mode ? "on" : ""}`} onClick={() => { setMode(x.id); setWon(null); setRoll(null); }} disabled={spinning}>
            {x.label}
          </button>
        ))}
      </div>
      <button className="btn big block gold upg-go" disabled={!cur || spinning || busy === "upgrade" || !canSpin} onClick={go}>
        {spinning ? "Крутим…" : spinFree ? `⇪ Прокачать · бесплатно ${spins!.freeLeft}/${spins!.freePerDay}` : <>⇪ Прокачать · <Coin c={spinPrice.currency} v={spinPrice.amount} size={16} /></>}
      </button>
      {!spinFree && <span className="tiny muted center upg-note">Бесплатные прокруты на сегодня кончились ({spins?.freePerDay ?? 3} в день) — дальше {full(spinPrice.amount)} ₽ за прокрут. Новые — после полуночи по Москве.</span>}
      <span className="tiny muted" style={{ display: "block" }}>Что поставить</span>
      <div className="upg-pick">
        {ups.map((u) => (
          <button key={`u${u.uid}`} className={`upg-chip upgraded ${cur?.kind === "up" && cur.uid === u.uid ? "on" : ""}`} onClick={() => pickStake({ kind: "up", uid: u.uid })} title={`${itemById(u.itemId)?.name} ★`}>
            <ItemArt id={u.itemId} size={34} /><span className="num">{full(u.value)} ₽</span>
          </button>
        ))}
        {plain.map((id) => (
          <button key={id} className={`upg-chip ${cur?.kind === "plain" && cur.id === id ? "on" : ""}`} onClick={() => pickStake({ kind: "plain", id })} title={itemById(id)?.name}>
            <ItemArt id={id} size={34} /><span className="num">×{inv.get(id)}</span>
          </button>
        ))}
        {!ups.length && !plain.length && <span className="tiny muted">пусто</span>}
      </div>
    </Modal>
  );
}

/* ---------------- the game objects standing in the yard ---------------- */
/** The blackjack table with the «Зонк» board behind it: one object; a tap asks which game to play. */
export function YardGames() {
  const { state } = useGame();
  const [open, setOpen] = useState<"pick" | "blackjack" | "zonk" | "poker" | null>(null);
  const zk = state?.games?.zonk;
  const invites = state?.bjInvites ?? 0;
  const free = invites > 0 ? "♠" : zk?.active ? "идёт" : zk?.freeLeft ?? 0;
  const note = (g: typeof zk, paid: string) => (g?.active ? "партия идёт — продолжить" : g && g.freeLeft > 0 ? `бесплатно: ${g.freeLeft}` : paid);
  return (
    <>
      <button className="yard-obj yard-table" onClick={() => setOpen("pick")} aria-label="Блэкджек, зонк и покер" title="Блэкджек, зонк и покер">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="yard-ring" src="/assets/yard/court-table-ring.webp" alt="" draggable={false} />
        <img src="/assets/yard/court-table.webp" alt="" draggable={false} />
        {free !== 0 && <i className={`yg-badge ${free === "идёт" || free === "♠" ? "live" : ""}`}>{free}</i>}
      </button>
      {open === "pick" && (
        <Modal title="Во что сыграем?" onClose={() => setOpen(null)}>
          <div className="game-pick">
            <button className="btn big block green" onClick={() => setOpen("blackjack")}>
              Блэкджек<small>{invites > 0 ? `тебя зовут за стол (${invites})` : "стол до 6 игроков · ставки 1–25 USD"}</small>
            </button>
            <button className="btn big block gold" onClick={() => setOpen("zonk")}>
              Зонк<small>{note(zk, "игра — 2 USD")}</small>
            </button>
            <button className="btn big block red" onClick={() => setOpen("poker")}>
              Покер<small>{state?.poker ? `раздача — ${state.poker.price.amount} USD · осталось ${state.poker.left}/${state.poker.perDay}` : "раздача — 3 USD"}</small>
            </button>
          </div>
        </Modal>
      )}
      {open === "blackjack" && <BlackjackWindow onClose={() => setOpen(null)} />}
      {open === "zonk" && <ZonkWindow onClose={() => setOpen(null)} />}
      {open === "poker" && <PokerWindow onClose={() => setOpen(null)} />}
    </>
  );
}

/** The upgrader: an arcade cabinet standing in the yard right of the 777 machine. */
export function YardUpgrader() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="yard-obj yard-upgrader" onClick={() => setOpen(true)} aria-label="Апгрейдер" title="Апгрейдер">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="yard-ring" src="/assets/yard/court-upgrader-ring.webp" alt="" draggable={false} />
        <img src="/assets/yard/court-upgrader.webp" alt="" draggable={false} />
      </button>
      {open && <UpgraderWindow onClose={() => setOpen(false)} />}
    </>
  );
}
