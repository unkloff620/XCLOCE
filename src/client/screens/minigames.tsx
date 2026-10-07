"use client";
/*
 * Мини-игры двора (пока кнопками, потом станут объектами во дворе): блэкджек, зонк (кости) и апгрейдер находок.
 * Правила и выплаты — content/games.ts, карты и кости — на сервере (server/systems/games.ts).
 */
import { useEffect, useMemo, useState } from "react";
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
  BJ_PAY, GAME_RULES, RANKS, SUITS, UPGRADE_MAX, UPGRADE_STAKES, UPGRADE_TARGETS, upgradeChance, zonkScore, zonkPrize,
  type GameKind,
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
function Die({ v, on, onClick, small }: { v: number; on?: boolean; onClick?: () => void; small?: boolean }) {
  const scoring = v === 1 || v === 5;
  return (
    <button className={`die ${on ? "on" : ""} ${small ? "small" : ""} ${scoring ? "scoring" : ""}`} onClick={onClick} disabled={!onClick} aria-label={`кость ${v}`}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
        {PIPS[v].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9.5" fill={v === 1 ? "#e8173c" : "#1e1006"} />)}
      </svg>
    </button>
  );
}

function ZonkHelp() {
  return (
    <Help topic="zonk" title="Зонк">
      <p>Бросаешь 6 костей и откладываешь очковые. Потом решаешь: бросить оставшиеся — рискнуть ради большего — или забрать очки. Бросок без единой очковой кости — «Зонк»: всё набранное сгорает. Отложил все шесть — бросаешь все шесть заново.</p>
      <ul className="small">
        <li>1 — 100, 5 — 50.</li>
        <li>Три одинаковых — номинал × 100 (три единицы — 1000). Четыре — вдвое больше, пять — вчетверо, шесть — в 8 раз.</li>
        <li>Стрит 1–6 — 1500, три пары — 750.</li>
      </ul>
      <p>Бесплатно — {GAME_RULES.zonk.freePerDay} игра в день: очки / 5 = рубли (1000 очков = 200 RUB). Дальше {GAME_RULES.zonk.price.amount} USD за игру: 1000 очков = 2,5 USD.</p>
    </Help>
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
  return (
    <Modal title={<span className="title-row">Зонк <ZonkHelp /></span>} onClose={onClose}>
      <div className="mg-table zonk">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="tiny muted">Очки хода</span>
          <b className="display zonk-turn num">{full(playing ? turn : g?.result?.points ?? g?.turn ?? 0)}</b>
        </div>
        <div className="zonk-dice">
          {playing ? roll.map((v, i) => <Die key={`${g!.id}-${(g!.history ?? []).length}-${i}`} v={v} on={pick.includes(i)} onClick={() => toggle(i)} />) : g ? <span className="tiny muted">Игра окончена</span> : [1, 2, 3, 4, 5, 6].map((v) => <Die key={v} v={v} />)}
        </div>
        {playing && (
          <span className="tiny muted center">
            {pick.length === 0 ? "Нажми на очковые кости, чтобы отложить их" : pts === null ? "Среди выбранных есть кости без очков" : <>Отложено: +{pts}. Выигрыш сейчас: <RewardChips r={zonkPrize(turn, !!g?.paid)} size={13} /></>}
          </span>
        )}
        {(g?.history?.length ?? 0) > 0 && (
          <div className="zonk-hist">
            {g!.history!.map((h, i) => (
              <span key={i} className="zonk-kept">{h.kept.map((v, k) => <Die key={k} v={v} small />)}<b className="num">+{h.points}</b></span>
            ))}
          </div>
        )}
      </div>
      {g && <ResultLine g={g} />}
      {playing ? (
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
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

function Gauge({ chance, roll, spinning }: { chance: number; roll: number | null; spinning: boolean }) {
  // the arc: the green part is the chance (from the top, clockwise), the needle lands on the roll
  const r = 70, c = 2 * Math.PI * r;
  const angle = roll === null ? 0 : roll * 360;
  return (
    <div className="upg-gauge">
      <svg viewBox="0 0 180 180" aria-hidden="true">
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" />
        <circle cx="90" cy="90" r={r} fill="none" stroke="#2ee88a" strokeWidth="16" strokeDasharray={`${Math.max(0.5, chance * c)} ${c}`} transform="rotate(-90 90 90)" strokeLinecap="butt" />
        <g className={`upg-needle ${spinning ? "spin" : ""}`} style={{ ["--a" as string]: `${angle + (spinning ? 1440 : 0)}deg` }}>
          <path d="M90 14 L84 34 H96 Z" fill="#ffd23f" stroke="#1e1006" strokeWidth="2" />
        </g>
      </svg>
      <div className="upg-center">
        <b className="display num">{pctText(chance)}</b>
        <span className="tiny muted">{chance >= 0.35 ? "хороший шанс" : chance >= 0.1 ? "средний шанс" : chance > 0 ? "низкий шанс" : "выбери ставку и цель"}</span>
      </div>
    </div>
  );
}

function UpgraderHelp() {
  return (
    <Help topic="upgrader" title="Апгрейдер">
      <p>Ставишь находки из двора — одну или несколько одинаковых — и пробуешь превратить их в вещь дороже. Чем дороже цель, тем ниже шанс; больше штук в ставке — шанс выше (до {Math.round(UPGRADE_MAX * 100)}%).</p>
      <p>Получилось — цель в инвентаре. Не повезло — ставка сгорает. С крышки от энергетика можно дойти даже до Rug Pull Gun, но шанс крошечный.</p>
    </Help>
  );
}

export function UpgraderWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const inv = useMemo(() => new Map((state?.inventory ?? []).map((x) => [x.id, x.qty])), [state?.inventory]);
  const stakes = Object.keys(UPGRADE_STAKES).filter((id) => (inv.get(id) ?? 0) > 0);
  const [stake, setStake] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [target, setTarget] = useState(UPGRADE_TARGETS[3].id);
  const [roll, setRoll] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [res, setRes] = useState<{ won: boolean; target: string } | null>(null);
  const cur = stake && (inv.get(stake) ?? 0) > 0 ? stake : stakes[0] ?? null;
  const have = cur ? inv.get(cur) ?? 0 : 0;
  const q = Math.max(1, Math.min(qty, have));
  const chance = cur ? upgradeChance(cur, q, target) : 0;
  const go = async () => {
    if (!cur || !chance) return;
    setRes(null);
    setSpinning(true);
    haptic.tap();
    sfx("tap");
    const r = await act<{ won: boolean; roll: number; target: string }>("upgrade", { stake: cur, qty: q, target });
    if (!r) {
      setSpinning(false);
      return;
    }
    setRoll(r.roll);
    setTimeout(() => {
      setSpinning(false);
      setRes({ won: r.won, target: r.target });
      if (r.won) { haptic.big(); sfx("levelup"); } else { haptic.err(); sfx("error"); }
    }, 1600);
  };
  return (
    <Modal title={<span className="title-row">Апгрейдер <UpgraderHelp /></span>} onClose={onClose} wide>
      <div className="upg">
        <div className="upg-box stake">
          <span className="tiny upg-cap">ТВОЯ СТАВКА</span>
          {cur ? (
            <>
              <ItemArt id={cur} size={72} />
              <b className="small center">{itemById(cur)?.name}</b>
              <span className="tiny muted num">{full((UPGRADE_STAKES[cur] ?? 0) * q)} ₽ · ×{q} из {have}</span>
              <input type="range" min={1} max={Math.max(1, have)} value={q} onChange={(e) => setQty(Number(e.target.value))} aria-label="Сколько ставить" />
            </>
          ) : (
            <span className="small muted center">Нет находок для ставки. Собери что-нибудь во дворе.</span>
          )}
        </div>
        <Gauge chance={chance} roll={roll} spinning={spinning} />
        <div className="upg-box target">
          <span className="tiny upg-cap">ЦЕЛЬ</span>
          <ItemArt id={target} size={72} />
          <b className="small center">{itemById(target)?.name}</b>
          <span className="tiny muted num">{full(UPGRADE_TARGETS.find((t) => t.id === target)?.value ?? 0)} ₽</span>
        </div>
      </div>
      {res && (
        <div className={`mg-result ${res.won ? "win" : "lose"}`}>
          <b className="display">{res.won ? "Прокачано!" : "Сгорело"}</b>
          <span className="tiny muted">{res.won ? `${itemById(res.target)?.name} — в инвентаре` : "Ставка ушла в никуда. Ещё разок?"}</span>
        </div>
      )}
      <button className="btn big block gold" style={{ marginTop: 10 }} disabled={!chance || spinning || busy === "upgrade"} onClick={go}>
        {spinning ? "Крутим…" : "Прокачать"}
      </button>
      <span className="tiny muted">Ставка</span>
      <div className="upg-pick">
        {stakes.length ? stakes.map((id) => (
          <button key={id} className={`upg-chip ${id === cur ? "on" : ""}`} onClick={() => { setStake(id); setRes(null); }} title={itemById(id)?.name}>
            <ItemArt id={id} size={34} /><span className="num">{inv.get(id)}</span>
          </button>
        )) : <span className="tiny muted">пусто</span>}
      </div>
      <span className="tiny muted">Цель</span>
      <div className="upg-pick">
        {UPGRADE_TARGETS.map((t) => {
          const c = cur ? upgradeChance(cur, q, t.id) : 0;
          return (
            <button key={t.id} className={`upg-chip ${t.id === target ? "on" : ""} ${c ? "" : "off"}`} onClick={() => { setTarget(t.id); setRes(null); }} title={itemById(t.id)?.name}>
              <ItemArt id={t.id} size={34} /><span className="num">{c ? pctText(c) : "—"}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/* ---------------- the buttons in the yard ---------------- */
function GameIcon({ kind }: { kind: "blackjack" | "zonk" | "upgrader" }) {
  const OL = "#1e1006";
  if (kind === "blackjack") return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
      <rect x="6" y="9" width="22" height="30" rx="4" fill="#f4ecdc" stroke={OL} strokeWidth="3" transform="rotate(-12 17 24)" />
      <rect x="18" y="7" width="22" height="30" rx="4" fill="#fff" stroke={OL} strokeWidth="3" transform="rotate(10 29 22)" />
      <text x="30" y="27" textAnchor="middle" fontSize="13" fontWeight="900" fill="#e8173c" transform="rotate(10 29 22)">A</text>
    </svg>
  );
  if (kind === "zonk") return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
      <rect x="5" y="14" width="22" height="22" rx="5" fill="#fff" stroke={OL} strokeWidth="3" transform="rotate(-10 16 25)" />
      <rect x="21" y="8" width="22" height="22" rx="5" fill="#ffd23f" stroke={OL} strokeWidth="3" transform="rotate(12 32 19)" />
      {[[12, 21], [20, 29], [16, 25]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill="#e8173c" />)}
      {[[27, 14], [37, 14], [27, 24], [37, 24]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill={OL} transform="rotate(12 32 19)" />)}
    </svg>
  );
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
      <circle cx="24" cy="24" r="18" fill="#2a0614" stroke={OL} strokeWidth="3" />
      <path d="M24 6 A18 18 0 0 1 41 18" stroke="#2ee88a" strokeWidth="6" fill="none" />
      <path d="M24 33 V16 M16 23 L24 15 L32 23" stroke="#ffd23f" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function YardGames() {
  const { state } = useGame();
  const [open, setOpen] = useState<"blackjack" | "zonk" | "upgrader" | null>(null);
  const bj = state?.games?.blackjack;
  const zk = state?.games?.zonk;
  return (
    <>
      <div className="yard-games" aria-label="Мини-игры">
        <button className="yard-game" onClick={() => setOpen("blackjack")}>
          <GameIcon kind="blackjack" /><span>Блэкджек</span>
          {bj && (bj.active ? <i className="yg-badge live">идёт</i> : bj.freeLeft > 0 && <i className="yg-badge">{bj.freeLeft}</i>)}
        </button>
        <button className="yard-game" onClick={() => setOpen("zonk")}>
          <GameIcon kind="zonk" /><span>Зонк</span>
          {zk && (zk.active ? <i className="yg-badge live">идёт</i> : zk.freeLeft > 0 && <i className="yg-badge">{zk.freeLeft}</i>)}
        </button>
        <button className="yard-game" onClick={() => setOpen("upgrader")}>
          <GameIcon kind="upgrader" /><span>Апгрейд</span>
        </button>
      </div>
      {open === "blackjack" && <BlackjackWindow onClose={() => setOpen(null)} />}
      {open === "zonk" && <ZonkWindow onClose={() => setOpen(null)} />}
      {open === "upgrader" && <UpgraderWindow onClose={() => setOpen(null)} />}
    </>
  );
}
