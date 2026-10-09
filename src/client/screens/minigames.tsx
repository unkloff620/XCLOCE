"use client";
/*
 * Мини-игры двора (пока кнопками, потом станут объектами во дворе): блэкджек, зонк (кости) и апгрейдер находок.
 * Правила и выплаты — content/games.ts, карты и кости — на сервере (server/systems/games.ts).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useGame } from "../store.tsx";
import { Modal, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { full } from "../format.ts";
import type { GameView } from "../api.ts";
import { itemById } from "../../content/items.ts";
import {
  BJ_PAY, GAME_RULES, ITEM_VALUES, RANKS, SUITS, UPGRADE_MODES, upgradeChanceOf, upgradeMode, upgradeTarget, upgradeValue, zonkScore, zonkPrize,
  type GameKind, type UpgradeMode,
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

/* ---------------- blackjack ---------------- */
function PlayingCard({ r, s, back, i }: { r?: number; s?: number; back?: boolean; i: number }) {
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

function BlackjackHelp() {
  const p = BJ_PAY;
  return (
    <Help topic="blackjack" title="Блэкджек">
      <p>Набери больше дилера, но не больше 21. Картинки — 10, туз — 1 или 11. «Ещё» — взять карту, «Хватит» — дилер добирает до 17.</p>
      <p>Бесплатно — {GAME_RULES.blackjack.freePerDay} партии в день, дальше {GAME_RULES.blackjack.price.amount} USD за партию.</p>
      <ul className="small">
        <li>Бесплатная: победа — {p.free.win.currencies?.RUB} RUB, блэкджек — {p.free.blackjack.currencies?.RUB} RUB, ничья — {p.free.push.currencies?.RUB} RUB.</li>
        <li>Платная: победа — {p.paid.win.currencies?.USD} USD, блэкджек — {p.paid.blackjack.currencies?.USD} USD, ничья — ставка назад.</li>
      </ul>
    </Help>
  );
}

export function BlackjackWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const active = state?.games?.blackjack.active ?? null;
  const [last, setLast] = useState<GameView | null>(null);
  const g = active ?? last;
  const run = async (type: string, body: Record<string, unknown>) => {
    haptic.tap();
    sfx("tap");
    const r = await act<GameView>(type, body);
    if (r) {
      setLast(r);
      if (r.status === "done") {
        if (r.result?.reward) { haptic.ok(); sfx("reward"); } else haptic.err();
      }
    }
  };
  const playing = g?.status === "active";
  return (
    <Modal title={<span className="title-row">Блэкджек <BlackjackHelp /></span>} onClose={onClose}>
      <div className="mg-table bj">
        <div className="bj-side">
          <span className="tiny muted">Дилер{g ? <> · <b className="num">{g.dealerValue}</b>{playing ? "+?" : ""}</> : null}</span>
          <div className="bj-hand">
            {g ? <>{g.dealer!.map((c, i) => <PlayingCard key={i} i={i} r={c.r} s={c.s} />)}{Array.from({ length: g.dealerHidden ?? 0 }, (_, k) => <PlayingCard key={`h${k}`} i={g.dealer!.length + k} back />)}</> : <><PlayingCard i={0} back /><PlayingCard i={1} back /></>}
          </div>
        </div>
        <div className="bj-side">
          <div className="bj-hand">
            {g ? g.player!.map((c, i) => <PlayingCard key={i} i={i} r={c.r} s={c.s} />) : <><PlayingCard i={0} back /><PlayingCard i={1} back /></>}
          </div>
          <span className="tiny muted">Ты{g ? <> · <b className={`num ${(g.playerValue ?? 0) > 21 ? "bust" : ""}`}>{g.playerValue}</b></> : null}{g?.paid ? " · платная" : g ? " · бесплатная" : ""}</span>
        </div>
      </div>
      {g && <ResultLine g={g} />}
      {playing ? (
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn big grow gold" disabled={busy === "bj_move"} onClick={() => run("bj_move", { move: "hit" })}>Ещё</button>
          <button className="btn big grow red" disabled={busy === "bj_move"} onClick={() => run("bj_move", { move: "stand" })}>Хватит</button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}><StartLine kind="blackjack" again={!!g} onStart={() => run("game_start", { game: "blackjack" })} /></div>
      )}
    </Modal>
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
  { key: "111", dice: [1, 1, 1], label: "1 000", test: (n) => n[1] >= 3 },
  ...[2, 3, 4, 5, 6].map((f) => ({ key: `${f}${f}${f}`, dice: [f, f, f], label: String(f * 100), test: (n: number[]) => n[f] >= 3 })),
  { key: "4k", dice: [3, 3, 3, 3], label: "×2", test: (n) => n.some((x) => x >= 4) },
  { key: "5k", dice: [3, 3, 3, 3, 3], label: "×4", test: (n) => n.some((x) => x >= 5) },
  { key: "6k", dice: [3, 3, 3, 3, 3, 3], label: "×8", test: (n) => n.some((x) => x >= 6) },
  { key: "str", dice: [1, 2, 3, 4, 5, 6], label: "1 500", test: (n, len) => len === 6 && n.slice(1).every((x) => x === 1) },
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
  return { left: `${6 + col * 25 + r(1) * 8}%`, top: `${12 + row * 38 + r(2) * 12}%`, ["--rot" as string]: `${Math.round(r(3) * 70 - 35)}deg` };
}

function ZonkHelp() {
  return (
    <Help topic="zonk" title="Зонк">
      <p>Бросаешь 6 костей и откладываешь очковые. Потом решаешь: бросить оставшиеся — рискнуть ради большего — или забрать очки. Бросок без единой очковой кости — «Зонк»: всё набранное сгорает. Отложил все шесть — бросаешь все шесть заново.</p>
      <p>Таблица справа подсказывает: строка светится, если такая комбинация есть в броске, и горит ярко, когда ты её выбрал. «Подсказка» сама выберет все очковые кости.</p>
      <p>Бесплатно — {GAME_RULES.zonk.freePerDay} игра в день: очки / 5 = рубли (1000 очков = 200 RUB). Дальше {GAME_RULES.zonk.price.amount} USD за игру: 1000 очков = 2,5 USD.</p>
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
  const seed = (g?.id ?? 1) * 13 + (g?.history?.length ?? 0) * 7;
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
  const toggle = (i: number) => setPick((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const turn = (g?.turn ?? 0) + (pts ?? 0);
  const nRoll = counts(playing ? roll : []);
  const nPick = counts(picked);
  const hints = playing ? new Set(bestPick(roll)) : new Set<number>();
  const kept = (g?.history ?? []).flatMap((h) => h.kept);
  return (
    <Modal title={<span className="title-row">Зонк <ZonkHelp /></span>} onClose={onClose} wide>
      <div className="zk">
        <div className="zk-board">
          <div className="zk-score">
            <span className="tiny">ОЧКИ ХОДА</span>
            <b className="display num">{full(playing ? turn : g?.result?.points ?? g?.turn ?? 0)}</b>
          </div>
          {playing
            ? roll.map((v, i) => <Die key={`${seed}-${i}`} v={v} on={pick.includes(i)} hint={hints.has(i) && !pick.includes(i)} onClick={() => toggle(i)} style={scatter(seed, i)} />)
            : !g && [1, 2, 3, 4, 5, 6].map((v, i) => <Die key={v} v={v} style={scatter(3, i)} />)}
          {g?.status === "done" && <div className={`zk-over display ${g.result?.outcome === "zonk" ? "zonk" : ""}`}>{g.result?.outcome === "zonk" ? "ЗОНК!" : `+${full(g.result?.points ?? 0)}`}</div>}
          <span className="zk-cup"><Cup /></span>
          {/* the kept dice line up along the left edge, like on the real board */}
          <div className="zk-kept" aria-label="Отложено">
            {Array.from({ length: 12 }, (_, i) => <span key={i} className="zk-slot">{kept[i] !== undefined && <Die v={kept[i]} small />}</span>)}
          </div>
        </div>
        <div className="zk-table">
          <b className="tiny zk-table-h">УДАЧНЫЕ КОМБИНАЦИИ</b>
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
      {playing && (
        <span className="tiny muted zk-note">
          {pick.length === 0 ? "Нажми на очковые кости (они подсвечены), чтобы отложить" : pts === null ? "Среди выбранных есть кости без очков" : <>Отложено: +{pts}. Если забрать сейчас: <RewardChips r={zonkPrize(turn, !!g?.paid)} size={13} /></>}
        </span>
      )}
      {g && <ResultLine g={g} />}
      {playing ? (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <button className="btn dark" disabled={busy === "zonk_move"} onClick={() => setPick(bestPick(roll))}>Подсказка</button>
          <button className="btn big grow gold" disabled={busy === "zonk_move" || pts === null} onClick={() => run("zonk_move", { pick, then: "roll" })}>
            Бросить {(() => { const left = (g?.left ?? 6) - pick.length; return left <= 0 ? 6 : left; })()}
          </button>
          <button className="btn big grow green" disabled={busy === "zonk_move" || pts === null} onClick={() => run("zonk_move", { pick, then: "bank" })}>Забрать</button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}><StartLine kind="zonk" again={!!g} onStart={() => run("game_start", { game: "zonk" })} /></div>
      )}
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
  const go = async () => {
    if (!cur || spinning) return;
    setWon(null);
    setSpinning(true);
    haptic.tap();
    sfx("tap");
    const body = cur.kind === "up" ? { uid: cur.uid, mode } : { stake: cur.id, qty: q, mode };
    const r = await act<{ won: boolean; roll: number; uid: number | null }>("upgrade", body);
    if (!r) {
      setSpinning(false);
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
      } else {
        haptic.err();
        sfx("error");
      }
    }, 1600);
  };
  return (
    <Modal title={<span className="title-row">Апгрейдер <UpgraderHelp /></span>} onClose={onClose} wide>
      <div className="upg">
        <div className={`upg-box stake ${up ? "upgraded" : ""}`}>
          <span className="tiny upg-cap">ТВОЯ СТАВКА</span>
          {cur ? (
            <>
              <span className="upg-art"><ItemArt id={curId} size={72} />{up && <i className="up-star">★</i>}</span>
              <b className="small center">{itemById(curId)?.name}{up ? " ★" : q > 1 ? ` ×${q}` : ""}</b>
              <span className="upg-price num">{full(stakeValue)} ₽</span>
              {cur.kind === "plain" && have > 1 && <input type="range" min={1} max={have} value={q} onChange={(e) => { setQty(Number(e.target.value)); setWon(null); }} aria-label="Сколько ставить" />}
            </>
          ) : (
            <span className="small muted center">Нечего ставить. Собери находки во дворе.</span>
          )}
        </div>
        <Gauge chance={chance} roll={roll} spinning={spinning} won={won} />
        <div className="upg-box target upgraded">
          <span className="tiny upg-cap">ЦЕЛЬ</span>
          <span className="upg-art"><ItemArt id={target} size={72} /><i className="up-star">★</i></span>
          <b className="small center">{itemById(target)?.name} ★</b>
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
      <button className="btn big block gold upg-go" disabled={!cur || spinning || busy === "upgrade"} onClick={go}>
        {spinning ? "Крутим…" : "⇪ Прокачать"}
      </button>
      <span className="tiny muted">Что поставить</span>
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
  const [open, setOpen] = useState<"pick" | "blackjack" | "zonk" | null>(null);
  const bj = state?.games?.blackjack;
  const zk = state?.games?.zonk;
  const free = (bj?.active || zk?.active) ? "идёт" : (bj?.freeLeft ?? 0) + (zk?.freeLeft ?? 0);
  const note = (g: typeof bj, paid: string) => (g?.active ? "партия идёт — продолжить" : g && g.freeLeft > 0 ? `бесплатно: ${g.freeLeft}` : paid);
  return (
    <>
      <button className="yard-obj yard-table" onClick={() => setOpen("pick")} aria-label="Блэкджек и зонк" title="Блэкджек и зонк">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="yard-ring" src="/assets/yard/court-table-ring.webp" alt="" draggable={false} />
        <img src="/assets/yard/court-table.webp" alt="" draggable={false} />
        {free !== 0 && <i className={`yg-badge ${free === "идёт" ? "live" : ""}`}>{free}</i>}
      </button>
      {open === "pick" && (
        <Modal title="Во что сыграем?" onClose={() => setOpen(null)}>
          <div className="game-pick">
            <button className="btn big block green" onClick={() => setOpen("blackjack")}>
              Блэкджек<small>{note(bj, "партия — 2 USD")}</small>
            </button>
            <button className="btn big block gold" onClick={() => setOpen("zonk")}>
              Зонк<small>{note(zk, "игра — 2 USD")}</small>
            </button>
          </div>
        </Modal>
      )}
      {open === "blackjack" && <BlackjackWindow onClose={() => setOpen(null)} />}
      {open === "zonk" && <ZonkWindow onClose={() => setOpen(null)} />}
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
