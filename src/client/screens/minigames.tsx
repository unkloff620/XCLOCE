"use client";
/*
 * Мини-игры двора (пока кнопками, потом станут объектами во дворе): блэкджек, зонк (кости) и апгрейдер находок.
 * Правила и выплаты — content/games.ts, карты и кости — на сервере (server/systems/games.ts).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { Avatar, Coin, Modal, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { full } from "../format.ts";
import type { GameView, PokerPlay } from "../api.ts";
import type { Currency } from "../../content/currencies.ts";
import { BlackjackWindow } from "./blackjack.tsx";
import { Roach } from "../art/roach.tsx";
import { itemById } from "../../content/items.ts";
import {
  ITEM_VALUES, RANKS, SUITS, UPGRADE_MODES, upgradeChanceOf, upgradeMode, upgradeTarget, upgradeValue, zonkGroups, zonkScore, ZONK_ROUNDS,
  ZONK_BANK_MIN, ZONK_FAIL_XP, ZONK_LEVELS,
  POKER_BONUS_LEVELS, POKER_CHEATS, POKER_HANDS, POKER_LEVEL_BONUS, POKER_MAX_LEVEL, POKER_RULES, pokerCheats, pokerPay,
  type PokerHand, type UpgradeMode,
} from "../../content/games.ts";

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
      {(PIPS[v] ?? []).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9.5" fill={v === 1 ? "#e8173c" : "#1e1006"} />)}
    </svg>
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
function ZonkHelp() {
  return (
    <Help topic="zonk" title="Зонк">
      <p>Выбери уровень и набери его цель за {ZONK_ROUNDS} попыток. Набрал — партия сразу кончается победой.</p>
      <ul>
        {ZONK_LEVELS.map((l) => (
          <li key={l.level}>Уровень {l.level}: {full(l.target)} очков. Вход {l.entry.amount} {l.entry.currency}{l.level === 1 ? " (первая игра дня — бесплатно)" : ""}, победа — {rewardText(l.win)} и +{l.winXp} опыта.</li>
        ))}
      </ul>
      <p>В попытке бросаешь 6 костей и забираешь очковые (нажми на кость — она встанет в лесенку), потом решаешь: «Бросить» оставшиеся — рискнуть ради большего, или «Сохранить» очки попытки — это можно от {ZONK_BANK_MIN} очков. Бросок без единой очковой кости — «Зонк»: очки этой попытки сгорают. Забрал все шесть — бросаешь все шесть заново.</p>
      <p>Не набрал цель или нажал «Сдаться» — немного рублей в утешение и +{ZONK_FAIL_XP} опыта. Каждые 100 опыта — новый уровень зонка.</p>
      <p>Очки попыток пишутся мелом слева, стрелка показывает текущую. На листке сверху — лучший счёт дня среди всех игроков, на листе справа — комбинации.</p>
    </Help>
  );
}

const rewardText = (r: { currencies?: Partial<Record<string, number>> }) =>
  Object.entries(r.currencies ?? {}).map(([c, v]) => `${v} ${c}`).join(" + ");

/*
 * The room picture (public/assets/yard/zonk-room.webp, 841×1870 — every place below is in those pixels): a lamp and the
 * «ЗОНК» sign on top, the framed chalkboard in the middle, a table at the bottom. It covers the whole window; only the
 * top and the bottom (the lamp and the table) may be cut on a short screen.
 */
const ZW = 841, ZH = 1870;
const zx = (x: number) => `${(x / ZW) * 100}%`;
const zy = (y: number) => `${(y / ZH) * 100}%`;
/** chalk lines of the rounds on the left board, top to bottom */
const ZK_LINES = [561, 624, 688, 751, 815, 880, 946, 1014, 1081, 1148];
/** the chalk ladder: row r (0 = the top) has r + 1 cells; the kept dice fill it from the bottom row up */
const LADDER_ROWS = [758, 842, 927, 1014, 1103, 1194];
const LADDER_COLS = [246, 328, 409, 490, 571, 652];
/** one chalk cell */
const CELL = { w: 73, h: 78 };
/** cells per ladder row, from the bottom row up */
/* the dice take every other row from the bottom (6, 4 and 2 cells): the row between is left for the points under them */
const LADDER_CAPS = [6, 4, 2];
const ladderCell = (row: number, col: number) => ({ x: LADDER_COLS[col], y: LADDER_ROWS[LADDER_ROWS.length - 1 - row * 2] });
type LadderGroup = { dice: { v: number; i: number }[]; points: number | null; old: boolean };
/**
 * The kept dice laid into the ladder, combination by combination, from the bottom row up: a combination that does not
 * fit what is left of a row starts the next one (a group bigger than a row wraps). Every piece of a combination in a
 * row gets a chalk bracket under it; the points are written under the biggest piece.
 */
function layoutLadder(groups: LadderGroup[]) {
  const dice: { v: number; i: number; old: boolean; row: number; col: number }[] = [];
  const marks: { row: number; from: number; to: number; label: string | null; bad: boolean; old: boolean }[] = [];
  let row = 0, col = 0;
  for (const gr of groups) {
    if (row >= LADDER_CAPS.length) break;
    if (col > 0 && gr.dice.length <= LADDER_CAPS[row] && col + gr.dice.length > LADDER_CAPS[row]) { row++; col = 0; }
    const pieces: { row: number; from: number; to: number }[] = [];
    for (const d of gr.dice) {
      if (row < LADDER_CAPS.length && col >= LADDER_CAPS[row]) { row++; col = 0; }
      if (row >= LADDER_CAPS.length) break;
      dice.push({ ...d, old: gr.old, row, col });
      const last = pieces[pieces.length - 1];
      if (last && last.row === row) last.to = col; else pieces.push({ row, from: col, to: col });
      col++;
    }
    const main = pieces.reduce((b, p, k) => (p.to - p.from > pieces[b].to - pieces[b].from ? k : b), 0);
    pieces.forEach((p, k) => marks.push({ ...p, label: k === main ? (gr.points === null ? "✕" : full(gr.points)) : null, bad: gr.points === null, old: gr.old }));
  }
  return { dice, marks };
}
/** where the dice land: the open chalk field above the ladder */
const FIELD_SLOTS = [[250, 470], [356, 470], [250, 566], [356, 566], [250, 662], [356, 662], [462, 662]] as const;
/** the cup lies in the field's top right corner, its mouth to the dice */
const CUP = { x: 520, y: 545 };
function landing(seed: number, i: number) {
  const r = (k: number) => {
    const v = Math.sin(seed * 9301 + i * 49297 + k * 233) * 10000;
    return v - Math.floor(v);
  };
  // every die takes its own slot of the field (the slots shuffled by the roll), nudged a little inside it
  const order = FIELD_SLOTS.map((_, k) => k).sort((p, q) => Math.sin(seed * 131 + p * 17) - Math.sin(seed * 131 + q * 17));
  const [sx, sy] = FIELD_SLOTS[order[i % FIELD_SLOTS.length]];
  return { x: sx + r(1) * 30, y: sy + r(2) * 26, rot: Math.round(r(3) * 44 - 22), spin: (r(4) > 0.5 ? 1 : -1) * (360 + Math.round(r(5) * 360)) };
}

/**
 * Now and then a cockroach runs across the room: along the table at the bottom of the picture or along the top edge of
 * the board's frame, either way. Feet line and size in room pixels.
 */
const ROACH_LANES = { table: { feet: 1712, w: 104, dur: 4.2 }, frame: { feet: 323, w: 78, dur: 5.2 } } as const;
type RoachRun = { key: number; lane: keyof typeof ROACH_LANES; dir: "left" | "right" };
function useRoach() {
  const [run, setRun] = useState<RoachRun | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const next = (first: boolean) => {
      t = setTimeout(() => {
        setRun({ key: Date.now(), lane: Math.random() < 0.55 ? "table" : "frame", dir: Math.random() < 0.5 ? "left" : "right" });
        next(false);
      }, (first ? 3 : 9 + Math.random() * 14) * 1000);
    };
    next(true);
    return () => clearTimeout(t);
  }, []);
  return { run, done: () => setRun(null) };
}
function RoachRunner({ run, onDone }: { run: RoachRun; onDone: () => void }) {
  const l = ROACH_LANES[run.lane];
  const h = (l.w * 480) / 660;
  return (
    <span key={run.key} className={`zb-roach ${run.dir}`} onAnimationEnd={(e) => { if (e.target === e.currentTarget) onDone(); }}
      style={{ top: `${((l.feet - (h * 455) / 480) / ZH) * 100}%`, width: `${(l.w / ZW) * 100}%`, ["--dur" as string]: `${l.dur}s` }}>
      <Roach />
    </span>
  );
}

export function ZonkWindow({ onClose }: { onClose: () => void }) {
  const roach = useRoach();
  const { state, act, busy } = useGame();
  const info = state?.games?.zonk;
  const active = info?.active ?? null;
  const [last, setLast] = useState<GameView | null>(null);
  const g = active ?? last;
  const roll = g?.roll ?? [];
  // the picked dice belong to one roll: a new roll starts with nothing picked — in the same render, so a stale index
  // never points past the new roll
  const rollKey = `${g?.id}:${g?.status}:${g?.round}:${g?.history?.length ?? 0}:${roll.join(",")}`;
  const [sel, setSel] = useState<{ key: string; idx: number[] }>({ key: "", idx: [] });
  const pick = sel.key === rollKey ? sel.idx.filter((i) => i < roll.length) : [];
  const setPick = (f: number[] | ((p: number[]) => number[])) => setSel((s0) => {
    const cur = s0.key === rollKey ? s0.idx : [];
    return { key: rollKey, idx: typeof f === "function" ? f(cur) : f };
  });
  const picked = pick.map((i) => roll[i]);
  const pts = picked.length ? zonkScore(picked) : null;
  const playing = g?.status === "active";
  const seed = (g?.id ?? 1) * 13 + (g?.history?.length ?? 0) * 7 + (g?.round ?? 1) * 31;
  // the cup shakes and pours every time a new roll comes
  const [throwing, setThrowing] = useState(0);
  /*
   * A roll without points: the dice first fall on the board as they came (the kept ones stay in the ladder), and only
   * then «Зонк! −N» jumps out; after that the next attempt is thrown. The server has already moved on — this is the replay.
   */
  const [show, setShow] = useState<{ key: number; roll: number[]; points: number; history: { kept: number[]; points: number }[] } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const run = async (type: string, body: Record<string, unknown>) => {
    haptic.tap();
    sfx("tap");
    const before = type === "zonk_move" && body.then === "roll" ? [...(g?.history ?? []), ...(picked.length && pts !== null ? [{ kept: picked, points: pts }] : [])] : [];
    const scoresBefore = type === "game_start" ? 0 : scores.length;
    const r = await act<GameView>(type, body);
    if (!r) return;
    setLast(r);
    const done = () => {
      if (r.status === "done") { if (r.result?.won) { haptic.ok(); sfx("reward"); } else { haptic.err(); sfx("error"); } }
    };
    const zonk = r.last?.zonk && r.last.roll && (r.scores?.length ?? 0) > scoresBefore && type !== "zonk_give_up" ? r.last : null;
    if (zonk) {
      setShow({ key: Date.now() % 100000, roll: zonk.roll!, points: zonk.points, history: before });
      setThrowing((t) => t + 1);
      timers.current.push(setTimeout(() => { haptic.err(); sfx("error"); }, 1250));
      timers.current.push(setTimeout(() => {
        setShow(null);
        if (r.status === "active") setThrowing((t) => t + 1);
        done();
      }, 2900));
      return;
    }
    if (r.status === "active") setThrowing((t) => t + 1);
    done();
  };
  const toggle = (i: number) => { haptic.tap(); setPick((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i])); };
  const bankMin = info?.bankMin ?? ZONK_BANK_MIN;
  const turn = (g?.turn ?? 0) + (pts ?? 0);
  const nRoll = counts(playing ? roll : []);
  const nPick = counts(picked);
  const hints = playing ? new Set(bestPick(roll)) : new Set<number>();
  // the ladder: earlier throws of this attempt (fixed) and the dice picked now (a tap puts one back), with their points
  const ladder = layoutLadder([
    ...(show ? show.history : playing ? g?.history ?? [] : []).flatMap((h) => zonkGroups(h.kept).map((gr) => ({ dice: gr.dice.map((v) => ({ v, i: -1 })), points: gr.points, old: true }))),
    ...(show || !playing ? [] : (() => {
      const free = [...pick];
      return zonkGroups(picked).map((gr) => ({
        dice: gr.dice.map((v) => { const k = free.findIndex((i) => roll[i] === v); const i = free[k]; free.splice(k, 1); return { v, i }; }),
        points: gr.points, old: false,
      }));
    })()),
  ]);
  const onBoard = playing || !!show;
  const fieldRoll = show ? show.roll : playing ? roll : [];
  const fieldSeed = show ? show.key : seed;
  const rounds = g?.rounds ?? ZONK_ROUNDS;
  // while a zonk replays, its attempt is not written on the board yet
  const scores = (g?.scores ?? []).slice(0, show ? -1 : undefined);
  const total = playing ? g?.total ?? 0 : g?.result?.points ?? g?.total ?? 0;
  const target = g?.target ?? 0;
  const left = (() => { const l = (g?.left ?? 6) - pick.length; return l <= 0 ? 6 : l; })();
  const canBank = playing && !show && pts !== null && turn >= bankMin;
  const lvl = info ? Math.max(0, Math.min(100, ((info.xp - info.from) / Math.max(1, info.to - info.from)) * 100)) : 0;
  const hint = !playing || show ? null
    : pick.length === 0 ? "Нажми на очковые кости"
    : pts === null ? "Есть кости без очков — верни их"
    : turn < bankMin ? `Сохранить можно от ${bankMin}`
    : null;
  const rec = info?.record ?? null;
  return (
    <Modal onClose={onClose} full>
      <div className="gstage bleed">
        {/* the picture is the whole window: no title line, just [?] in the corner opposite [×] */}
        <div className="zb-help"><ZonkHelp /></div>
        <div className="zb" style={{ ["--throw" as string]: throwing }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="zb-bg" src="/assets/yard/zonk-room.webp" alt="" draggable={false} />
          {/* the lamp over the sign is alive: its light breathes, dims and flickers, the room darkens with it */}
          <span className="zb-dark" aria-hidden="true" />
          <span className="zb-lamp" aria-hidden="true" />
          <span className="zb-bulb" aria-hidden="true" style={{ left: zx(395), top: zy(8), width: zx(60), height: zy(40) }} />
          {roach.run && <RoachRunner key={roach.run.key} run={roach.run} onDone={roach.done} />}

          {/* the paper at the top left: the best game of the day */}
          <div className="zb-rec" style={{ left: zx(30), top: zy(350), width: zx(162), height: zy(100) }}>
            <b className="zb-rec-h">{rec?.day === "yesterday" ? "Рекорд вчера" : "Рекорд дня"}</b>
            {rec ? (
              <span className="zb-rec-who">
                <Avatar name={rec.name} photo={rec.photo} size={26} />
                <span className="zb-rec-name">
                  <i className="ellipsis">{rec.name}</i>
                  <b className="num">{full(rec.points)}</b>
                </span>
              </span>
            ) : <span className="zb-rec-none">пока никого</span>}
          </div>

          {/* the left board: every attempt's points in chalk over its line; the arrow points at the attempt now */}
          {ZK_LINES.slice(0, rounds).map((y, i) => {
            const sc = scores[i];
            return (
              <span key={i} className={`zb-rd ${sc ? (sc.zonk ? "zonk" : "ok") : ""}`} style={{ left: zx(46), width: zx(132), top: zy(y - 56), height: zy(54) }}>
                <i>{i + 1}</i>
                <b className="num">{sc ? (sc.zonk ? "Зонк" : full(sc.points)) : ""}</b>
              </span>
            );
          })}
          {onBoard && scores.length < rounds && (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={scores.length} className="zb-arrow" src="/assets/yard/zonk-arrow.webp" alt="" draggable={false}
              style={{ left: zx(176), top: zy(ZK_LINES[scores.length] - 50), width: zx(64) }} />
          )}
          <button className="zb-btn red" style={{ left: zx(39), top: zy(1369), width: zx(145), height: zy(76) }} disabled={!playing || !!show || busy === "zonk_give_up"}
            onClick={() => run("zonk_give_up", {})}>Сдаться</button>

          {/* the chalk head of the big board: the level, the score against the target, this attempt */}
          <div className="zb-head" style={{ left: zx(244), top: zy(368), width: zx(360) }}>
            {g ? (
              <>
                <span>Уровень <b className="num">{g.level ?? 1}</b> · попытка <b className="num">{Math.min(scores.length + (onBoard ? 1 : 0), rounds)}/{rounds}</b></span>
                <span className="zb-score"><b className="num">{full(total)}</b><small className="num">/{full(target)}</small></span>
              </>
            ) : <span>Выбери уровень</span>}
          </div>

          {/* the thrown dice in the open field; a tap sends a die to the ladder */}
          {fieldRoll.map((v, i) => {
            if (!show && pick.includes(i)) return null;
            const l = landing(fieldSeed, i);
            return (
              <button key={`${fieldSeed}-${throwing}-${i}`} className={`zb-die ${!show && hints.has(i) ? "hint" : ""} ${show ? "dead" : ""}`} disabled={!!show}
                onClick={() => toggle(i)} aria-label={`кость ${v}`}
                style={{ left: zx(l.x), top: zy(l.y), ["--rot" as string]: `${l.rot}deg`, ["--spin" as string]: `${l.spin}deg`,
                  ["--fx" as string]: `${((CUP.x - 20 - l.x) / ZW) * 100}cqw`, ["--fy" as string]: `${((CUP.y - l.y) / ZW) * 100}cqw`, ["--d" as string]: `${0.28 + i * 0.05}s` }}>
                <DieFace v={v} />
              </button>
            );
          })}
          <span key={`cup-${throwing}`} className={`zb-cup ${throwing ? "pour" : ""}`} style={{ left: zx(CUP.x - 30), top: zy(CUP.y - 60), width: zx(92) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/yard/zonk-cup.webp" alt="" draggable={false} />
          </span>

          {/* the chalk ladder: the dice kept this attempt (earlier throws fixed, the ones picked now go back on a tap) */}
          {ladder.dice.map((d, k) => {
            const c = ladderCell(d.row, d.col);
            const style = { left: zx(c.x + 7), top: zy(c.y + 9), width: zx(59), height: zy(59) };
            return d.i < 0
              ? <span key={`k${k}`} className="zb-kept old" style={style}><DieFace v={d.v} /></span>
              : <button key={`p${d.i}`} className="zb-kept" style={style} onClick={() => toggle(d.i)} aria-label={`вернуть ${d.v}`}><DieFace v={d.v} /></button>;
          })}
          {/* chalk brackets under each combination and what it scores (picture: 1-1-1 → 1000, 5 → 50) */}
          {ladder.marks.map((m, k) => {
            const a = ladderCell(m.row, m.from), b = ladderCell(m.row, m.to);
            return (
              <span key={`m${k}-${m.row}-${m.from}`} className={`zb-br ${m.bad ? "bad" : ""} ${m.old ? "old" : ""}`} style={{ left: zx(a.x + 8), width: zx(b.x + CELL.w - 8 - (a.x + 8)), top: zy(a.y + CELL.h + 4), height: zy(34) }}>
                <i />{m.label && <b className="num">{m.label}</b>}
              </span>
            );
          })}
          {/* this attempt's points so far: what «Сохранить» would write down */}
          {playing && !show && turn > 0 && (
            <span key={turn} className={`zb-turn ${pts === null && pick.length ? "bad" : ""}`} style={{ left: zx(246), top: zy(1312), width: zx(372), height: zy(46) }}>+{full(turn)}</span>
          )}

          {/* the sheet on the right: the combinations; a row lights up when the roll has it, brighter when it is picked */}
          <div className="zb-sheet" style={{ left: zx(670), top: zy(438), width: zx(150), height: zy(596) }}>
            <b className="zb-sheet-h">Комбинации</b>
            {COMBOS.map((c) => {
              const can = c.test(nRoll, roll.length);
              const on = picked.length > 0 && c.test(nPick, picked.length);
              return (
                <div key={c.key} className={`zb-combo ${can ? "can" : ""} ${on ? "on" : ""}`}>
                  <span className="zb-mini">{c.dice.map((d, k) => <i key={k}><DieFace v={d} /></i>)}</span>
                  <b className="num">{c.label}</b>
                </div>
              );
            })}
          </div>

          {show ? (
            <div key={`z${show.key}`} className="zb-flash zonk late" style={{ left: zx(236), top: zy(560), width: zx(380) }}>
              {show.points ? `Зонк! −${full(show.points)}` : "Зонк!"}
            </div>
          ) : playing && g?.last && !g.last.zonk ? (
            <div key={`${g.round}-${scores.length}`} className="zb-flash" style={{ left: zx(236), top: zy(560), width: zx(380) }}>
              +{full(g.last.points)} записано
            </div>
          ) : null}
          {hint && <span className="zb-hint" style={{ left: zx(246), top: zy(1362), width: zx(372) }}>{hint}</span>}

          <button className="zb-btn grey" style={{ left: zx(630), top: zy(1308), width: zx(164), height: zy(61) }} disabled={!playing || !!show || busy === "zonk_move" || pts === null}
            onClick={() => run("zonk_move", { pick, then: "roll" })}>Бросить<small className="num">{left}</small></button>
          <button className={`zb-btn grey ${canBank ? "ready" : ""}`} style={{ left: zx(630), top: zy(1383), width: zx(164), height: zy(61) }} disabled={!canBank || busy === "zonk_move"}
            onClick={() => run("zonk_move", { pick, then: "bank" })}>Сохранить</button>

          {/* no game running: the levels to choose from (and how the last game ended) */}
          {!playing && !show && info && (
            <div className="zb-menu" style={{ left: zx(236), top: zy(440), width: zx(562), height: zy(850) }}>
              {g?.status === "done" && g.result && (
                <div className={`zb-res ${g.result.won ? "win" : "lose"}`}>
                  <b className="display">{g.result.won ? "Пройдено!" : g.result.outcome === "gave_up" ? "Сдался" : "Не хватило"}</b>
                  <span className="num">{full(g.result.points ?? 0)} из {full(g.target ?? 0)}</span>
                  <span className="zb-res-got">{g.result.reward && <RewardChips r={g.result.reward} size={14} />}<em>+{g.result.xp ?? 0} опыта</em></span>
                </div>
              )}
              <div className="zb-xp" title={`${info.xp} опыта зонка`}>
                <span>Зонк <b className="num">{info.level}</b> ур.</span>
                <span className="zb-xp-bar"><i style={{ width: `${lvl}%` }} /></span>
                <small className="num">{info.xp - info.from}/{info.to - info.from}</small>
              </div>
              {info.levels.map((l) => {
                const free = l.level === 1 && info.freeLeft > 0;
                const cash = state?.wallet[l.entry.currency] ?? 0;
                const poor = !free && cash < l.entry.amount;
                return (
                  <button key={l.level} className={`zb-lvl ${poor ? "poor" : ""}`} disabled={poor || busy === "game_start"} onClick={() => run("game_start", { game: "zonk", level: l.level })}>
                    <b className="zb-lvl-n display">{l.level}</b>
                    <span className="zb-lvl-main">
                      <b className="num">{full(l.target)} очков</b>
                      <span className="zb-lvl-win">приз {Object.entries(l.win.currencies ?? {}).map(([c, v]) => <Coin key={c} c={c as Currency} v={v ?? 0} size={13} />)} · +{l.winXp} опыта</span>
                    </span>
                    <span className="zb-lvl-pay">{free ? "бесплатно" : <>{l.entry.amount} <Icon name={l.entry.currency} size={15} /></>}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- poker ---------------- */
function PokerHelp() {
  return (
    <Help topic="poker" title="Покер">
      <p>Сразу сдаётся 5 карт. Собралась комбинация из таблицы под картами — получаешь награду, чем старше комбинация, тем больше.</p>
      <p>Раздача — {POKER_RULES.price.amount} USD, до {POKER_RULES.perDay} раздач в день.</p>
      <p>Каждая раздача даёт опыт покера (за старшие комбинации — больше). Каждый уровень покера до {POKER_BONUS_LEVELS}-го добавляет +{Math.round(POKER_LEVEL_BONUS * 1000) / 10}% к денежной награде; всего уровней {POKER_MAX_LEVEL}.</p>
      <p>Шулерство: {POKER_CHEATS.slice().reverse().map((c) => `с ${c.level} уровня — ${c.swaps} ${c.swaps === 1 ? "замена" : "замены"}`).join(", ")}. После раздачи нажми на любую карту на столе — она уйдёт, а на её место придёт новая из колоды. Комбинация считается, когда замены кончатся или ты нажмёшь «Вскрыть».</p>
    </Help>
  );
}

function MiniCard({ r, s }: { r: number; s: number }) {
  return <span className={`pk-mini ${s === 1 || s === 2 ? "red" : ""}`}><b>{RANKS[r]}</b><i>{SUITS[s]}</i></span>;
}

/** an amount over a reward icon: 3000 → 3K, 2.3 → 2.3 */
const qtyText = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(Math.round(v * 100) / 100));
/** a combination's prize as icons only, the amount at the icon's top right */
function PrizeIcons({ hand, level }: { hand: PokerHand; level: number }) {
  const pay = pokerPay(hand, level);
  const parts = [
    ...Object.entries(pay.currencies ?? {}).map(([c, v]) => ({ key: c, icon: <Icon name={c as Currency} size={22} />, n: v ?? 0, title: `${v} ${c}` })),
    ...(pay.items ?? []).map((it) => ({ key: it.id, icon: <ItemArt id={it.id} size={24} />, n: it.qty, title: `${itemById(it.id)?.name ?? it.id} ×${it.qty}` })),
  ];
  return (
    <span className="pkt-prize">
      {parts.map((p) => <span key={p.key} className="pkt-ico" title={p.title}>{p.icon}<b className="num">{qtyText(p.n)}</b></span>)}
    </span>
  );
}

/* the felt picture (public/assets/yard/poker-table.webp, 1060×1484): the five gold frames for the cards */
const PW = 1060, PH = 1484;
const px = (x: number) => `${(x / PW) * 100}%`;
const py = (y: number) => `${(y / PH) * 100}%`;
const SLOTS = [108, 280, 453, 626, 798];

export function PokerWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const info = state?.poker;
  const [play, setPlay] = useState<PokerPlay | null>(null);
  const [deal, setDeal] = useState(0);
  const p = play?.poker ?? info;
  // a hand left waiting for its swaps (the window was closed): it comes back
  const open = play ?? (info?.active ? { kind: "poker" as const, phase: "draw" as const, ...info.active, poker: info } : null);
  const level = p?.level ?? 0;
  const pct = !p ? 0 : p.to === null ? 100 : Math.max(0, Math.min(100, ((p.xp - p.from) / (p.to - p.from)) * 100));
  const usd = state?.wallet[POKER_RULES.price.currency] ?? 0;
  const left = p?.left ?? 0;
  const cheats = p?.cheats ?? pokerCheats(level);
  const drawing = open?.phase === "draw";
  const nextCheat = POKER_CHEATS.slice().reverse().find((c) => level < c.level);
  const run = async (type: string, body: Record<string, unknown> = {}) => {
    haptic.tap();
    sfx("tap");
    const r = await act<PokerPlay>(type, body);
    if (r) {
      setPlay(r);
      if (type === "poker_play") setDeal((d) => d + 1);
      if (r.phase === "done") { if (r.reward) { haptic.ok(); sfx("reward"); } else haptic.err(); }
    }
  };
  const hand: PokerHand | null = open && open.phase === "done" ? open.hand : null;
  return (
    <Modal title={<span className="title-row">Покер <PokerHelp /></span>} onClose={onClose} full>
      <div className="gstage">
        <div className="pkt">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pkt-bg" src="/assets/yard/poker-table.webp" alt="" draggable={false} />

          {/* above the title: the poker level, its experience, the swaps it gives, the hands left today */}
          <div className="pkt-top" style={{ left: px(70), top: py(60), width: px(920) }}>
            <span className="pkt-lvl" title={p ? `${p.xp}${p.to !== null ? ` / ${p.to}` : ""} опыта покера` : undefined}>
              <b className="display num">{level}</b><small>ур.</small>
            </span>
            <span className="pkt-xp"><i style={{ width: `${pct}%` }} /></span>
            <span className="pkt-cheat" title="Шулерство: замены карт после раздачи">
              {cheats > 0 ? <>🃏 <b className="num">{cheats}</b> {cheats === 1 ? "замена" : "замены"}</> : nextCheat ? <>замены с {nextCheat.level} ур.</> : null}
            </span>
            <span className="pkt-left num">{(p?.perDay ?? POKER_RULES.perDay) - left}/{p?.perDay ?? POKER_RULES.perDay}</span>
          </div>

          {/* the five cards in the gold frames; while swaps are left a tap changes a card */}
          {SLOTS.map((x, i) => {
            const c = open?.cards[i];
            const swappedNow = !!open?.swapped.includes(i);
            const usedCard = hand && hand !== "high" ? open!.used.includes(i) : false;
            const dim = hand && hand !== "high" && !open!.used.includes(i);
            return (
              <button key={i} className={`pkt-slot ${drawing ? "can" : ""} ${usedCard ? "used" : ""} ${dim ? "dim" : ""}`} style={{ left: px(x), top: py(652), width: px(155), height: py(192) }}
                disabled={!drawing || busy === "poker_swap"} onClick={() => run("poker_swap", { index: i })} aria-label={drawing ? `Заменить карту ${i + 1}` : undefined}>
                {c
                  ? <PlayingCard key={`${deal}-${i}-${c.r}-${c.s}`} i={swappedNow ? 0 : i} r={c.r} s={c.s} />
                  : <PlayingCard key={`b${i}`} i={i} back />}
                {drawing && <span className="pkt-swap" aria-hidden="true">⇄</span>}
              </button>
            );
          })}

          {/* under the cards: what came (or how many swaps are left) */}
          <div className="pkt-res" style={{ left: px(80), top: py(855), width: px(900) }}>
            {!open ? <span className="pkt-hint">Сдаём 5 карт — собери комбинацию</span>
              : drawing ? <span className="pkt-hint">Нажми на карту, чтобы заменить · осталось <b className="num">{open.swapsLeft}</b></span>
              : (
                <span className={`pkt-out ${open.reward ? "win" : ""}`}>
                  <b className="display">{open.title}</b>
                  {open.reward ? <RewardChips r={open.reward} size={14} /> : <small>без выигрыша</small>}
                  <small>+{open.gainedXp} оп.{open.levelUp ? <b className="pk-up"> · уровень {level}!</b> : null}</small>
                </span>
              )}
          </div>

          {/* the combinations in the free felt: the sample cards and the prize as icons, no words */}
          <div className="pkt-table" style={{ left: px(60), top: py(915), width: px(940), height: py(420) }}>
            {POKER_HANDS.filter((h) => h.id !== "high").map((h) => (
              <div key={h.id} className={`pkt-row ${hand === h.id ? "on" : ""} ${drawing && open?.hand === h.id ? "now" : ""}`} title={h.name}>
                <span className="pkt-row-cards">{h.sample.map((c, k) => <MiniCard key={k} r={c.r} s={c.s} />)}</span>
                <PrizeIcons hand={h.id} level={level} />
              </div>
            ))}
          </div>

          <div className="pkt-ctrl" style={{ left: px(230), top: py(1355), width: px(600) }}>
            {drawing ? (
              <button className="btn big green block" disabled={busy === "poker_stand" || busy === "poker_swap"} onClick={() => run("poker_stand")}>Вскрыть</button>
            ) : (
              <button className="btn big gold block" disabled={busy === "poker_play" || left <= 0 || usd < POKER_RULES.price.amount} onClick={() => run("poker_play")}>
                {left <= 0 ? "Приходи завтра" : <>{open ? "Ещё раздачу" : "Раздать"} · {POKER_RULES.price.amount} <Icon name={POKER_RULES.price.currency} size={18} /></>}
              </button>
            )}
          </div>
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
  const note = (g: typeof zk, paid: string) => (g?.active ? "партия идёт" : g && g.freeLeft > 0 ? `бесплатно: ${g.freeLeft}` : paid);
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
          {/* three pictures in a row, the name and a short line under each */}
          <div className="game-pick">
            {([
              { id: "poker", name: "Покер", img: "/assets/yard/game-poker.webp",
                note: state?.poker?.active ? "ждёт замен" : state?.poker ? `${state.poker.left}/${state.poker.perDay} раздач` : "3 USD", live: !!state?.poker?.active },
              { id: "blackjack", name: "Блэкджек", img: "/assets/yard/game-blackjack.webp",
                note: invites > 0 ? `зовут (${invites})` : "1–25 USD", live: invites > 0 },
              { id: "zonk", name: "Зонк", img: "/assets/yard/game-zonk.webp", note: note(zk, "4 уровня"), live: !!zk?.active },
            ] as const).map((gm) => (
              <button key={gm.id} type="button" className={`game-tile ${gm.live ? "live" : ""}`} onClick={() => setOpen(gm.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gm.img} alt="" draggable={false} />
                <b className="display">{gm.name}</b>
                <small>{gm.note}</small>
              </button>
            ))}
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
