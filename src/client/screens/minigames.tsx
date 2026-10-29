"use client";
/*
 * Мини-игры двора (пока кнопками, потом станут объектами во дворе): блэкджек, зонк (кости) и апгрейдер находок.
 * Правила и выплаты — content/games.ts, карты и кости — на сервере (server/systems/games.ts).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useGame, useNow } from "../store.tsx";
import { Avatar, Coin, Modal, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { Help } from "../help.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { full } from "../format.ts";
import { api, type DuelView, type GameView, type PokerPlay } from "../api.ts";
import type { Currency } from "../../content/currencies.ts";
import { BlackjackWindow } from "./blackjack.tsx";
import { DayTopNote } from "../day-top.tsx";
import { OPEN_GAME_EVENT, takePendingGame } from "../game-invites.tsx";
import { Roach } from "../art/roach.tsx";
import { itemById } from "../../content/items.ts";
import { yardTime } from "../../content/yard.ts";
import {
  ITEM_VALUES, RANKS, SUITS, UPGRADE_MODES, upgradeChanceOf, upgradeMode, upgradeTarget, upgradeValue, zonkGroups, zonkScore, ZONK_ROUNDS,
  ZONK_BANK_MIN, ZONK_CONT_PENALTY, ZONK_DAY_PRIZE, ZONK_FAIL_XP, ZONK_LEVELS,
  POKER_BONUS_LEVELS, POKER_CHEATS, POKER_HANDS, POKER_LEVEL_BONUS, POKER_MAX_LEVEL, POKER_RULES, POKER_CHIP, pokerCheats, pokerPay,
  type PokerHand, type UpgradeMode, DUEL_FEE, DUEL_ROUNDS, DUEL_STAKES,
} from "../../content/games.ts";

/* ---------------- a playing card (poker) ---------------- */
export function PlayingCard({ r, s, back, i, flip }: { r?: number; s?: number; back?: boolean; i: number; flip?: boolean }) {
  // the drawn deck (public/assets/cards, tools/scene/build-cards.py)
  if (back || r === undefined || s === undefined) return <span className="pcard img back" style={{ ["--i" as string]: i, backgroundImage: "url(/assets/cards/back.webp)" }} />;
  const face = { ["--i" as string]: i, backgroundImage: `url(/assets/cards/${s}-${r}.webp)` };
  // flip: the card lands face down and turns over (one after another by --i)
  if (flip) {
    return (
      <span className="pflip" role="img" aria-label={`${RANKS[r]}${SUITS[s]}`} style={{ ["--i" as string]: i }}>
        <span className="pcard img back pf-side pf-back" style={{ backgroundImage: "url(/assets/cards/back.webp)" }} />
        <span className="pcard img pf-side" style={face} />
      </span>
    );
  }
  return <span className="pcard img" role="img" aria-label={`${RANKS[r]}${SUITS[s]}`} style={face} />;
}
/** when the flip of card i (0…4) shows its face, ms — keep in step with .pflip in screens.css */
const flipAt = (i: number) => 180 + i * 140 + 220;

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
  // four of a kind and more in one line (×2, five ×4, six ×8 — told in the help): the sheet stays readable on a phone
  { key: "4k", dice: [3, 3, 3, 3], label: "×2+", test: (n) => n.some((x) => x >= 4) },
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
      <p>Четыре одинаковых кости — очки тройки ×2, пять — ×4, шесть — ×8. Шесть разных (1–6) — 1500, три пары — 750.</p>
      <p>Не набрал цель или нажал «Сдаться» — немного рублей в утешение и +{ZONK_FAIL_XP} опыта. Каждые 100 опыта — новый уровень зонка.</p>
      <p>Очки попыток пишутся мелом слева, стрелка показывает текущую. На листке сверху — лучший счёт дня среди всех игроков: в полночь по Москве он получает приз: {ZONK_DAY_PRIZE.currencies?.USD} USD и {ZONK_DAY_PRIZE.items?.[0]?.qty} фишки. На листе справа — комбинации.</p>
      <p>Набрал цель уровня — награда приходит сразу, и можно выбрать: «Закончить» или «Продолжить» ради рекорда дня. Продолжение награду не увеличит, а каждый зонк после него отнимает {full(ZONK_CONT_PENALTY)} очков.</p>
      <p>По стене бегает таракан — прихлопни его, это пара рублей (иногда фишка для покера).</p>
      <p><b>Дуэли:</b> в меню уровней нажми [+] в «Дуэлях», выбери игрока и ставку. Если он не в игре — ему придёт сообщение в Telegram. У каждого {DUEL_ROUNDS} попыток, очки соперника видны прямо во время партии. Больше очков — забираешь банк (минус {Math.round(DUEL_FEE * 100)}%), ничья — ставки назад.</p>
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
 * Now and then a small cockroach dashes along the top edge of the board's frame, either way: runs, stops for a moment
 * (legs still), runs on. Feet line and size in room pixels; the stop is between ROACH_STOP of the run.
 */
const ROACH_LANES = { frame: { feet: 323, w: 50, dur: 3 } } as const;
const ROACH_STOP = [0.4, 0.62] as const;
type RoachRun = { key: number; lane: keyof typeof ROACH_LANES; dir: "left" | "right" };
function useRoach() {
  const [run, setRun] = useState<RoachRun | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const next = (first: boolean) => {
      t = setTimeout(() => {
        setRun({ key: Date.now(), lane: "frame", dir: Math.random() < 0.5 ? "left" : "right" });
        next(false);
        // at night (Moscow time) the roaches come out more often
      }, (first ? 3 : yardTime(Date.now()) === "night" ? 5 + Math.random() * 7 : 9 + Math.random() * 14) * 1000);
    };
    next(true);
    return () => clearTimeout(t);
  }, []);
  return { run, done: () => setRun(null) };
}
function RoachRunner({ run, onDone }: { run: RoachRun; onDone: () => void }) {
  const { act } = useGame();
  const l = ROACH_LANES[run.lane];
  const h = (l.w * 480) / 660;
  // the legs stop while it stands (the run itself holds still in the CSS keyframes over the same share)
  const [still, setStill] = useState(false);
  // a tap squashes it: it stays flat where it was hit, what it paid floats up, then it is gone
  const [dead, setDead] = useState<{ text: string | null } | null>(null);
  useEffect(() => {
    const a = setTimeout(() => setStill(true), ROACH_STOP[0] * l.dur * 1000);
    const b = setTimeout(() => setStill(false), ROACH_STOP[1] * l.dur * 1000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [l.dur]);
  const squash = async () => {
    if (dead) return;
    setDead({ text: null });
    haptic.ok();
    sfx("splat");
    const r = await act<{ reward: { currencies?: Partial<Record<string, number>>; items?: { id: string; qty: number }[] } | null }>("roach_squash", {});
    const rub = r?.reward?.currencies?.RUB;
    const chip = r?.reward?.items?.some((i) => i.id === POKER_CHIP);
    setDead({ text: r?.reward ? `+${rub ?? 0} ₽${chip ? " +фишка" : ""}` : "" });
    if (chip) sfx("chips");
    setTimeout(onDone, 1400);
  };
  return (
    <button type="button" key={run.key} className={`zb-roach ${run.dir} ${still || dead ? "still" : ""} ${dead ? "dead" : ""}`} aria-label="Прихлопнуть таракана"
      onPointerDown={(e) => { e.preventDefault(); void squash(); }}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && !dead) onDone(); }}
      style={{ top: `${((l.feet - (h * 455) / 480) / ZH) * 100}%`, width: `${(l.w / ZW) * 100}%`, ["--dur" as string]: `${l.dur}s` }}>
      <Roach />
      {dead?.text && <b className="zb-roach-got num">{dead.text}</b>}
    </button>
  );
}

interface Rival { id: number; name: string; photo: string | null; xp: number; online: boolean }

/** [+] in the duels: find a player (who is in the game now, my clan, my last rivals — or by name) and the stake */
function DuelPicker({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Rival[] | null>(null);
  const [who, setWho] = useState<Rival | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api.get<{ players: Rival[] }>(`/api/duel-rivals?q=${encodeURIComponent(q.trim())}`).then((r) => { if (alive) setList(r.players); }).catch(() => { if (alive) setList([]); });
    }, q ? 350 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const usd = state?.wallet.USD ?? 0;
  const busyWith = new Set((state?.duels ?? []).filter((d) => d.status === "open" || d.status === "playing").map((d) => d.rival.id));
  const call = async (stake: number) => {
    if (!who) return;
    const r = await act("duel_create", { to: who.id, stake }, `Вызов отправлен: ${who.name}, ставка ${stake} $`);
    if (r) { haptic.ok(); onClose(); }
  };
  return (
    <Modal title="Вызов на дуэль" onClose={onClose} maxWidth={420}>
      <div className="dp">
        <div className="dp-rules">{DUEL_ROUNDS} попыток у каждого · у кого больше очков — забирает банк (−{Math.round(DUEL_FEE * 100)}%) · ничья — ставки назад</div>
        {!who ? (
          <>
            <input className="dp-search" placeholder="Ник игрока" value={q} onChange={(e) => setQ(e.target.value)} maxLength={32} />
            {!q && <span className="tiny muted">В игре сейчас, твой клан и прошлые соперники</span>}
            <div className="dp-list">
              {list === null ? <span className="tiny muted center">Ищем…</span>
                : !list.length ? <span className="tiny muted center">{q ? "Никого не нашли" : "Сейчас никого — найди по нику"}</span>
                : list.map((p) => {
                  const taken = busyWith.has(p.id);
                  return (
                    <button key={p.id} type="button" className="dp-row" disabled={taken} onClick={() => { haptic.tap(); setWho(p); }}>
                      <span className="dp-ava"><Avatar name={p.name} photo={p.photo} size={34} />{p.online && <i className="dp-on" aria-label="в игре" />}</span>
                      <b className="ellipsis grow">{p.name}</b>
                      <small>{taken ? "уже дуэль" : p.online ? "в игре" : "напишем в Telegram"}</small>
                    </button>
                  );
                })}
            </div>
          </>
        ) : (
          <>
            <div className="dp-who">
              <Avatar name={who.name} photo={who.photo} size={48} />
              <span className="grow col" style={{ minWidth: 0 }}>
                <b className="ellipsis">{who.name}</b>
                <small className="muted">{who.online ? "сейчас в игре" : "не в сети — получит уведомление в Telegram"}</small>
              </span>
              <button className="btn dark sm" onClick={() => setWho(null)}>Другой</button>
            </div>
            <span className="tiny muted">Ставка (спишется сейчас, вернётся при отказе):</span>
            <div className="dp-stakes">
              {DUEL_STAKES.map((st) => (
                <button key={st} className="btn green" disabled={busy === "duel_create" || usd < st} onClick={() => call(st)}>
                  {st} <Icon name="USD" size={15} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** the end of a duel: who won, and both players' points attempt by attempt */
function DuelResult({ d, onClose }: { d: DuelView; onClose: () => void }) {
  const { state } = useGame();
  const done = d.status === "done";
  const head = !done ? "Ждём соперника" : d.won === true ? "Победа!" : d.won === false ? "Поражение" : "Ничья";
  const cls = !done ? "wait" : d.won === true ? "win" : d.won === false ? "lose" : "draw";
  const me = state?.player;
  const myTotal = d.myPoints ?? d.myRounds.reduce((a, b) => a + b, 0);
  const rivalTotal = d.rivalPoints ?? 0;
  useEffect(() => {
    if (!done) return;
    if (d.won === true) { haptic.big(); sfx("reward"); } else if (d.won === false) { haptic.err(); sfx("error"); }
  }, [done, d.won]);
  return (
    <Modal title="Дуэль в зонк" onClose={onClose} maxWidth={420}>
      <div className={`dr ${cls}`}>
        <b className="dr-head display">{head}</b>
        <div className="dr-vs">
          <span className="dr-side"><Avatar name={me?.name ?? "Я"} photo={me?.photo ?? null} size={44} /><i className="ellipsis">Ты</i></span>
          <b className="dr-score num">{full(myTotal)} : {d.rivalPoints === null && !d.rivalRounds.length ? "—" : full(rivalTotal)}</b>
          <span className="dr-side"><Avatar name={d.rival.name} photo={d.rival.photo} size={44} /><i className="ellipsis">{d.rival.name}</i></span>
        </div>
        <div className="dr-table">
          <span className="dr-th">Попытка</span><span className="dr-th">Ты</span><span className="dr-th ellipsis">{d.rival.name}</span>
          {Array.from({ length: DUEL_ROUNDS }, (_, i) => {
            const a = d.myRounds[i], b = d.rivalRounds[i];
            return [
              <span key={`n${i}`} className="dr-n num">{i + 1}</span>,
              <span key={`a${i}`} className={`num ${a === undefined ? "none" : a === 0 ? "zonk" : a > (b ?? -1) ? "best" : ""}`}>{a === undefined ? "—" : a === 0 ? "зонк" : full(a)}</span>,
              <span key={`b${i}`} className={`num ${b === undefined ? "none" : b === 0 ? "zonk" : b > (a ?? -1) ? "best" : ""}`}>{b === undefined ? "—" : b === 0 ? "зонк" : full(b)}</span>,
            ];
          })}
          <span className="dr-tot">Итого</span><b className="num dr-tot">{full(myTotal)}</b><b className="num dr-tot">{d.rivalPoints === null && !d.rivalRounds.length ? "—" : full(rivalTotal)}</b>
        </div>
        <div className="dr-money">
          {!done ? (d.rivalPlaying ? `${d.rival.name} ещё играет: попытка ${Math.min(d.rivalRounds.length + 1, DUEL_ROUNDS)}/${DUEL_ROUNDS}` : d.rivalRounds.length ? "Соперник доигрывает" : `${d.rival.name} ещё не начинал — пришлём итог, когда сыграет`)
            : d.won === true ? <>Банк твой: +{d.pot} <Icon name="USD" size={15} /></>
            : d.won === false ? <>Ставка ушла: −{d.stake} <Icon name="USD" size={15} /></>
            : "Ставки вернулись обоим"}
        </div>
        <button className="btn gold block" onClick={onClose}>Ок</button>
      </div>
    </Modal>
  );
}

const SEEN_KEY = "xc-duels-seen";
function seenDuels(): number[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"); } catch { return []; }
}
function markSeen(id: number) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([id, ...seenDuels().filter((x) => x !== id)].slice(0, 40))); } catch { /* storage blocked */ }
}

/** «4:12» till a call goes away */
function clockLeft(at: number) {
  const s = Math.max(0, Math.round((at - Date.now()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** zonk duels in the level menu: [+] to call someone, calls to me (yes / no), my calls, duels to play, results */
function DuelsList({ onPlay, onShow }: { onPlay: (id: number) => void; onShow: (id: number) => void }) {
  const { state, act, busy } = useGame();
  useNow();
  const [pick, setPick] = useState(false);
  const list = (state?.duels ?? []).filter((d) => d.status === "open" || d.status === "playing" || d.status === "done");
  return (
    <div className="zb-duels">
      <div className="zb-duels-top">
        <b className="zb-duels-h">Дуэли</b>
        <button type="button" className="zb-duel-add" onClick={() => { haptic.tap(); setPick(true); }} aria-label="Вызвать на дуэль">+<small>вызвать</small></button>
      </div>
      {!list.length && <small className="zb-duels-none">Вызови игрока: {DUEL_ROUNDS} попыток у каждого, банк — тому, у кого больше</small>}
      {list.slice(0, 4).map((d) => {
        const vs = <span className="zb-duel-vs"><Avatar name={d.rival.name} photo={d.rival.photo} size={20} /><i className="ellipsis">{d.rival.name}</i></span>;
        const stake = <span className="zb-duel-stake num">{d.stake} <Icon name="USD" size={12} /></span>;
        let tail: ReactNode = null;
        if (d.status === "open" && !d.mine) {
          tail = <span className="zb-duel-acts">
            {d.expiresAt && <small>{clockLeft(d.expiresAt)}</small>}
            <button className="zb-duel-btn ok" disabled={!!busy} onClick={() => act("duel_answer", { id: d.id, answer: "accept" }, "Вызов принят — играй свою партию")}>Принять</button>
            <button className="zb-duel-btn" disabled={!!busy} onClick={() => act("duel_answer", { id: d.id, answer: "decline" }, "Вызов отклонён")}>✕</button>
          </span>;
        } else if (d.status === "open") {
          tail = <span className="zb-duel-acts"><small>ждём{d.expiresAt ? ` · ${clockLeft(d.expiresAt)}` : ""}</small><button className="zb-duel-btn" disabled={!!busy} onClick={() => act("duel_answer", { id: d.id, answer: "cancel" }, "Вызов отменён, ставка вернулась")}>✕</button></span>;
        } else if (d.status === "playing") {
          tail = d.myPoints !== null ? <button className="zb-duel-btn" onClick={() => onShow(d.id)}>{full(d.myPoints)} : {d.rivalPoints === null ? "—" : full(d.rivalPoints)}</button>
            : d.started ? <small>доиграй партию</small>
            : <button className="zb-duel-btn ok" disabled={!!busy} onClick={() => onPlay(d.id)}>Играть</button>;
        } else {
          tail = <button className={`zb-duel-btn res ${d.won === true ? "win" : d.won === false ? "lose" : ""}`} onClick={() => onShow(d.id)}>{full(d.myPoints ?? 0)}:{full(d.rivalPoints ?? 0)} · {d.won === true ? `+${d.pot}` : d.won === false ? "проигрыш" : "ничья"}</button>;
        }
        return <div key={d.id} className={`zb-duel ${d.status}`}>{vs}{stake}{tail}</div>;
      })}
      {pick && <DuelPicker onClose={() => setPick(false)} />}
    </div>
  );
}

export function ZonkWindow({ onClose }: { onClose: () => void }) {
  const roach = useRoach();
  const { state, act, busy } = useGame();
  const info = state?.games?.zonk;
  const active = info?.active ?? null;
  const [last, setLast] = useState<GameView | null>(null);
  const g = active ?? last;
  // the duel result window: opens when my duel game ends and when a duel I played has finished since I looked
  const [showDuel, setShowDuel] = useState<number | null>(null);
  const duelOpen = showDuel !== null ? (state?.duels ?? []).find((d) => d.id === showDuel) ?? null : null;
  useEffect(() => {
    if (showDuel !== null) return;
    const seen = seenDuels();
    const fresh = (state?.duels ?? []).find((d) => d.status === "done" && d.started && !seen.includes(d.id));
    if (fresh) setShowDuel(fresh.id);
  }, [state?.duels, showDuel]);
  const closeDuel = () => {
    const d = duelOpen;
    if (d && d.status === "done") markSeen(d.id);
    setShowDuel(null);
  };
  const duelNow = g?.duel ? (state?.duels ?? []).find((d) => d.id === g.duel) ?? null : null;
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
  // the cup rattles, then the dice knock on the board
  useEffect(() => {
    if (!throwing) return;
    sfx("shake");
    const t = setTimeout(() => sfx("dice"), 320);
    return () => clearTimeout(t);
  }, [throwing]);
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
    const scoresBefore = type === "game_start" || type === "duel_play" ? 0 : scores.length;
    const r = await act<GameView>(type, body);
    if (!r) return;
    setLast(r);
    // the hints switch changes nothing on the table: no new throw
    if (type === "zonk_hints") return;
    if (r.ask && !g?.ask) { haptic.ok(); sfx("reward"); }
    const done = () => {
      if (r.status === "done" && r.duel) { setShowDuel(r.duel); return; }
      if (r.status === "done") { if (r.result?.won) { haptic.ok(); sfx("reward"); } else { haptic.err(); sfx("error"); } }
    };
    const zonk = r.last?.zonk && r.last.roll && (r.scores?.length ?? 0) > scoresBefore && type !== "zonk_give_up" ? r.last : null;
    if (zonk) {
      setShow({ key: Date.now() % 100000, roll: zonk.roll!, points: zonk.points, history: before });
      setThrowing((t) => t + 1);
      timers.current.push(setTimeout(() => { haptic.err(); sfx("zonk"); }, 1250));
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
  const toggle = (i: number) => { haptic.tap(); sfx("tap"); setPick((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i])); };
  const bankMin = info?.bankMin ?? ZONK_BANK_MIN;
  const turn = (g?.turn ?? 0) + (pts ?? 0);
  const nRoll = counts(playing ? roll : []);
  const nPick = counts(picked);
  // hints (the scoring dice and combinations light up) only when switched on for this game — they cost 2 $ once a game
  const hintsOn = playing && !!g?.hints;
  const hints = hintsOn ? new Set(bestPick(roll)) : new Set<number>();
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
  const hint = !hintsOn || show || g?.ask ? null
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
                <span>{g.duel ? "Дуэль" : <>Уровень <b className="num">{g.level ?? 1}</b></>} · попытка <b className="num">{Math.min(scores.length + (onBoard ? 1 : 0), rounds)}/{rounds}</b></span>
                <span className="zb-score"><b className="num">{full(total)}</b>{!g.duel && !g.reached && <small className="num">/{full(target)}</small>}{g.reached && <small className="zb-got">приз ✓</small>}</span>
                {duelNow && (
                  <span className="zb-rival">
                    <Avatar name={duelNow.rival.name} photo={duelNow.rival.photo} size={18} />
                    <i className="ellipsis">{duelNow.rival.name}</i>
                    <b className="num">{duelNow.rivalPoints === null ? "—" : full(duelNow.rivalPoints)}</b>
                    <small className="num">{duelNow.rivalDone ? "сыграл" : duelNow.rivalRounds.length ? `${duelNow.rivalRounds.length}/${DUEL_ROUNDS}` : "ещё не играл"}</small>
                  </span>
                )}
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
              const can = hintsOn && c.test(nRoll, roll.length);
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
          {/* the hints switch: off at the start of every game; the first switch-on of a game costs 2 $ */}
          {playing && !show && (
            <button className={`zb-hints ${hintsOn ? "on" : ""}`} style={{ left: zx(246), top: zy(1372), width: zx(372), height: zy(66) }} disabled={busy === "zonk_hints"}
              onClick={() => run("zonk_hints", { on: !g?.hints })} aria-pressed={hintsOn}>
              <i className="zb-hints-sw" aria-hidden="true"><em /></i>
              <span className="zb-hints-t">{hint ?? "Подсказки"}{!g?.hintsPaid && <small className="num">2 $</small>}</span>
            </button>
          )}

          <button className="zb-btn grey" style={{ left: zx(630), top: zy(1308), width: zx(164), height: zy(61) }} disabled={!playing || !!show || busy === "zonk_move" || pts === null}
            onClick={() => run("zonk_move", { pick, then: "roll" })}>Бросить<small className="num">{left}</small></button>
          <button className={`zb-btn grey ${canBank ? "ready" : ""}`} style={{ left: zx(630), top: zy(1383), width: zx(164), height: zy(61) }} disabled={!canBank || busy === "zonk_move"}
            onClick={() => run("zonk_move", { pick, then: "bank" })}>Сохранить</button>

          {/* the target reached: the prize is already paid — finish, or play on for the day record */}
          {playing && !show && g?.ask && (
            <div className="zb-ask" style={{ left: zx(236), top: zy(520), width: zx(562) }}>
              <b className="display">Цель набрана!</b>
              <span className="num zb-ask-pts">{full(total)} очков</span>
              <span className="zb-res-got">{g.prize?.reward && <RewardChips r={g.prize.reward} size={14} />}<em>+{g.prize?.xp ?? 0} опыта</em></span>
              <small>Награда уже твоя. Продолжишь — она не вырастет, а каждый зонк отнимет {full(ZONK_CONT_PENALTY)} очков. Зато можно побить рекорд дня.</small>
              <span className="zb-ask-btns">
                <button className="zb-duel-btn" disabled={!!busy} onClick={() => run("zonk_choice", { go: "end" })}>Закончить</button>
                <button className="zb-duel-btn ok" disabled={!!busy} onClick={() => run("zonk_choice", { go: "continue" })}>Продолжить</button>
              </span>
            </div>
          )}

          {/* no game running: the levels to choose from (and how the last game ended) */}
          {!playing && !show && info && (
            <div className="zb-menu" style={{ left: zx(236), top: zy(440), width: zx(562), height: zy(850) }}>
              {g?.status === "done" && g.result && g.duel ? (
                <button type="button" className="zb-res" onClick={() => setShowDuel(g.duel!)}>
                  <b className="display">Дуэль сыграна</b>
                  <span className="num">{full(g.result.points ?? 0)} очков</span>
                  <span className="zb-res-got"><em>посмотреть итог</em></span>
                </button>
              ) : g?.status === "done" && g.result && (
                <div className={`zb-res ${g.result.won ? "win" : "lose"}`}>
                  <b className="display">{g.result.won ? "Пройдено!" : g.result.outcome === "gave_up" ? "Сдался" : "Не хватило"}</b>
                  <span className="num">{full(g.result.points ?? 0)} из {full(g.target ?? 0)}</span>
                  <span className="zb-res-got">{g.result.reward && <RewardChips r={g.result.reward} size={14} />}<em>+{g.result.xp ?? 0} опыта</em></span>
                </div>
              )}
              <DuelsList onPlay={(id) => run("duel_play", { id })} onShow={setShowDuel} />
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
      {duelOpen && <DuelResult d={duelOpen} onClose={closeDuel} />}
    </Modal>
  );
}

/* ---------------- poker ---------------- */
function PokerHelp() {
  return (
    <Help topic="poker" title="Покер">
      <p>Сразу сдаётся 5 карт. Собралась комбинация из таблицы под картами — получаешь награду, чем старше комбинация, тем больше.</p>
      <p>Раздача — {POKER_RULES.price.amount} USD, до {POKER_RULES.perDay} раздач в сутки. «Фишка» из двора оплачивает одну раздачу вместо денег.</p>
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
  // two cells, always (an empty one when the combination pays only money): the column of the list stays even
  return (
    <>
      {[0, 1].map((k) => {
        const p = parts[k];
        return p
          ? <span key={p.key} className="pkt-cell" title={p.title}>{p.icon}<b className="num">{p.key in (pay.currencies ?? {}) ? qtyText(p.n) : `×${p.n}`}</b></span>
          : <span key={`e${k}`} className="pkt-cell empty" />;
      })}
    </>
  );
}

/* the felt picture (public/assets/yard/poker-room.webp, 1080×2400, the whole window): the five gold frames for the cards */
const PW = 1080, PH = 2400;
const px = (x: number) => `${(x / PW) * 100}%`;
const py = (y: number) => `${(y / PH) * 100}%`;
const SLOTS = [107, 284, 459, 634, 810];

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
  const chips = p?.chips ?? 0;
  const cheats = p?.cheats ?? pokerCheats(level);
  const drawing = open?.phase === "draw";
  const nextCheat = POKER_CHEATS.slice().reverse().find((c) => level < c.level);
  const run = async (type: string, body: Record<string, unknown> = {}) => {
    haptic.tap();
    sfx("tap");
    const r = await act<PokerPlay>(type, body);
    if (r) {
      setPlay(r);
      if (type === "poker_play") {
        setDeal((d) => d + 1);
        // the five cards slide in, then each turns over with a snap
        sfx(body.chip ? "chips" : "deal");
        for (let k = 0; k < 5; k++) setTimeout(() => sfx("card"), flipAt(k));
      }
      if (type === "poker_swap") setTimeout(() => sfx("card"), flipAt(0));
      if (r.phase === "done") { if (r.reward) { haptic.ok(); sfx("reward"); } else haptic.err(); }
    }
  };
  const hand: PokerHand | null = open && open.phase === "done" ? open.hand : null;
  return (
    <Modal onClose={onClose} full>
      <div className="gstage bleed">
        {/* the felt is the whole window: [?] in the corner opposite [×] */}
        <DayTopNote game="poker" refresh={deal} />
        <div className="zb-help pk-help"><PokerHelp /></div>
        <div className="pkt">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pkt-bg" src="/assets/yard/poker-room.webp" alt="" draggable={false} />

          {/* above the title: the poker level, its experience, the swaps it gives, the hands left today */}
          <div className="pkt-top" style={{ left: px(90), top: py(395), width: px(900) }}>
            <span className="pkt-lvl" title={p ? `${p.xp}${p.to !== null ? ` / ${p.to}` : ""} опыта покера` : undefined}>
              <b className="display num">{level}</b><small>ур.</small>
            </span>
            <span className="pkt-xp"><i style={{ width: `${pct}%` }} /></span>
            <span className="pkt-cheat" title="Шулерство: замены карт после раздачи">
              {cheats > 0 ? <>🃏 <b className="num">{cheats}</b> {cheats === 1 ? "замена" : "замены"}</> : nextCheat ? <>замены с {nextCheat.level} ур.</> : null}
            </span>
            <span className="pkt-left num" title="Раздач сегодня">{p?.perDay ? `${p.perDay - left}/${p.perDay}` : `${p?.played ?? 0} сегодня`}</span>
          </div>

          {/* the five cards in the gold frames; while swaps are left a tap changes a card */}
          {SLOTS.map((x, i) => {
            const c = open?.cards[i];
            const swappedNow = !!open?.swapped.includes(i);
            const usedCard = hand && hand !== "high" ? open!.used.includes(i) : false;
            const dim = hand && hand !== "high" && !open!.used.includes(i);
            return (
              <button key={i} className={`pkt-slot ${drawing && open!.swapsLeft > 0 ? "can" : ""} ${usedCard ? "used" : ""} ${dim ? "dim" : ""}`} style={{ left: px(x), top: py(902), width: px(163), height: py(200) }}
                disabled={!drawing || open!.swapsLeft <= 0 || busy === "poker_swap"} onClick={() => run("poker_swap", { index: i })} aria-label={drawing ? `Заменить карту ${i + 1}` : undefined}>
                {c
                  ? <PlayingCard key={`${deal}-${i}-${c.r}-${c.s}`} i={swappedNow ? 0 : i} r={c.r} s={c.s} flip />
                  : <PlayingCard key={`b${i}`} i={i} back />}
                {drawing && open!.swapsLeft > 0 && <span className="pkt-swap" aria-hidden="true">⇄</span>}
                {drawing && swappedNow && <span className="pkt-new" aria-hidden="true">новая</span>}
              </button>
            );
          })}

          {/* under the cards: what came (or how many swaps are left) */}
          <div className="pkt-res" style={{ left: px(70), top: py(1128), width: px(940), height: py(96) }}>
            {!open ? <span className="pkt-hint">Сдаём 5 карт — собери комбинацию</span>
              : drawing ? <span className="pkt-hint">{open.swapsLeft > 0 ? <>Нажми на карту, чтобы заменить · осталось <b className="num">{open.swapsLeft}</b></> : "Замены кончились — посмотри карты и вскрывай"}</span>
              : (
                <span className={`pkt-out ${open.reward ? "win" : ""}`}>
                  <b className="display">{open.title}</b>
                  {open.reward ? <RewardChips r={open.reward} size={14} /> : <small>без выигрыша</small>}
                  <small>+{open.gainedXp} оп.{open.levelUp ? <b className="pk-up"> · уровень {level}!</b> : null}</small>
                </span>
              )}
          </div>

          {/* the combinations in the free felt: the sample cards and the prize as icons, no words */}
          <div className="pkt-table" style={{ left: px(70), top: py(1250), width: px(940), height: py(650) }}>
            {POKER_HANDS.filter((h) => h.id !== "high").map((h) => (
              // the combination on the table lights its five sample cards (not the whole line): gold when counted, dashed while swapping
              <div key={h.id} className={`pkt-row ${hand === h.id ? "on" : ""} ${drawing && open?.hand === h.id ? "now" : ""}`} title={h.name}>
                <span className="pkt-row-cards">{h.sample.map((c, k) => <MiniCard key={k} r={c.r} s={c.s} />)}</span>
                <PrizeIcons hand={h.id} level={level} />
              </div>
            ))}
          </div>

          <div className="pkt-ctrl" style={{ left: px(250), top: py(1950), width: px(580) }}>
            {drawing ? (
              <button className="btn big green block" disabled={busy === "poker_stand" || busy === "poker_swap"} onClick={() => run("poker_stand")}>Вскрыть</button>
            ) : (
              <div className="pkt-btns">
                <button className="btn big gold block" disabled={busy === "poker_play" || left <= 0 || usd < POKER_RULES.price.amount} onClick={() => run("poker_play")}>
                  {left <= 0 ? "Завтра" : <>Раздать · {POKER_RULES.price.amount} <Icon name={POKER_RULES.price.currency} size={18} /></>}
                </button>
                {/* a «Фишка» from the yard: one hand without the money */}
                {chips > 0 && left > 0 && (
                  <button className="btn big pkt-chip" disabled={busy === "poker_play"} onClick={() => run("poker_play", { chip: true })} aria-label={`Раздать за фишку, фишек: ${chips}`}>
                    <ItemArt id={POKER_CHIP} size={30} /><b className="num">{chips}</b>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- upgrader ---------------- */
const pctText = (c: number) => `${(Math.round(c * 10000) / 100).toLocaleString("ru-RU")}%`;

/*
 * The upgrader cabinet (public/assets/upgrader/room.webp, 1024×1536, tools/upgrader/build-upgrader.py): the drawn
 * machine with two empty item slots and a big round brass dial; everything else sits on it at picture coordinates.
 */
const UW = 1024, UH = 1536;
const ux = (x: number) => `${(x / UW) * 100}%`;
const uy = (y: number) => `${(y / UH) * 100}%`;
// the dial: centre and radius of the dark ring track inside the brass rim (picture pixels)
const DIAL = { x: 511, y: 611, r: 157, box: 420 };

function Gauge({ chance, roll, spinning, won }: { chance: number; roll: number | null; spinning: boolean; won: boolean | null }) {
  // the arc: the lit part is the chance (from the top, clockwise), the arrow lands on the roll
  const k = 200 / DIAL.box, r = DIAL.r * k, c = 2 * Math.PI * r;
  const angle = roll === null ? 0 : roll * 360;
  const tone = chance >= 0.35 ? "hi" : chance >= 0.2 ? "mid" : "lo";
  return (
    <div className={`ug-dial ${tone} ${won === true ? "won" : won === false ? "lost" : ""} ${spinning ? "spinning" : ""}`}
      style={{ left: ux(DIAL.x - DIAL.box / 2), top: uy(DIAL.y - DIAL.box / 2), width: ux(DIAL.box), height: uy(DIAL.box) }}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle className="ug-track" cx="100" cy="100" r={r} />
        <circle className="ug-arc" cx="100" cy="100" r={r} strokeDasharray={`${Math.max(0.5, chance * c)} ${c}`} transform="rotate(-90 100 100)" />
      </svg>
      <div className={`ug-needle ${spinning ? "spin" : ""}`} style={{ ["--a" as string]: `${angle + (spinning ? 1440 : 0)}deg` }} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/upgrader/needle.webp" alt="" draggable={false} style={{ top: `${50 - (DIAL.r / DIAL.box) * 100 - 8}%` }} />
      </div>
      <div className="ug-center">
        <b className="display num">{pctText(chance)}</b>
        <span>{won === true ? "прокачано!" : won === false ? "сгорело" : spinning ? "крутим…" : tone === "hi" ? "хороший шанс" : tone === "mid" ? "средний шанс" : "низкий шанс"}</span>
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
      <p>Вещь для ставки выбирается внизу, на полке автомата. В день есть бесплатные прокруты, дальше прокрут платный — цена на кнопке. Новые бесплатные — после полуночи по Москве.</p>
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
  const stakeName = cur ? `${itemById(curId)?.name ?? ""}${up ? " ★" : q > 1 ? ` ×${q}` : ""}` : "";
  // the six mode buttons and the long button fill the big panel; the stake list lies in the tray at the bottom
  const MODE_W = 115, MODE_GAP = 10, MODE_X = 150;
  return (
    <Modal onClose={onClose} page>
      <div className="sl-help"><UpgraderHelp /></div>
      <div className="sl-stage">
        <div className={`ug ${won === true ? "res-won" : won === false ? "res-lost" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sl-bg" src="/assets/upgrader/room.webp" alt="" draggable={false} />
          <b className="ug-title display" style={{ left: ux(140), top: uy(160), width: ux(620), height: uy(130) }}>Апгрейдер</b>

          {/* the stake slot (cyan) and its plate */}
          <div className={`ug-slot stake ${up ? "upgraded" : ""}`} style={{ left: ux(165), top: uy(420), width: ux(110), height: uy(350) }}>
            <span className="ug-cap">ставка</span>
            {cur || snap ? (
              snap ? (
                <span className={`upg-art ${snap.burn ? "upg-burn" : ""}`} onAnimationEnd={(e) => { if (e.animationName === "upg-burn") setSnap(null); }}>
                  <ItemArt id={snap.id} size={64} />{snap.up && <i className="up-star">★</i>}
                  {snap.burn && <i className="upg-embers" aria-hidden="true" />}
                </span>
              ) : (
                <span className="upg-art"><ItemArt id={curId} size={64} />{up && <i className="up-star">★</i>}</span>
              )
            ) : (
              <span className="ug-empty">пусто</span>
            )}
            <span className="ug-price num">{cur ? `${full(stakeValue)} ₽` : ""}</span>
          </div>
          <span className="ug-plate" style={{ left: ux(160), top: uy(792), width: ux(122), height: uy(52) }} title={stakeName}>{stakeName}</span>

          <Gauge chance={chance} roll={roll} spinning={spinning} won={won} />

          {/* the target slot (gold) and its plate */}
          <div className="ug-slot target upgraded" style={{ left: ux(748), top: uy(420), width: ux(132), height: uy(350) }}>
            <span className="ug-cap">цель</span>
            <span className="upg-art"><ItemArt id={target} size={64} /><i className="up-star">★</i></span>
            <span className="ug-price num gold">{full(value)} ₽</span>
          </div>
          <span className="ug-plate" style={{ left: ux(742), top: uy(792), width: ux(142), height: uy(52) }}>{itemById(target)?.name} ★</span>

          {/* the strip under the dial: how many of the stake go in, or what the spin is about */}
          <div className="ug-strip" style={{ left: ux(140), top: uy(878), width: ux(744), height: uy(48) }}>
            {!snap && cur?.kind === "plain" && have > 1 ? (
              <>
                <span className="num">×{q}</span>
                <input type="range" min={1} max={have} value={q} onChange={(e) => { setQty(Number(e.target.value)); setWon(null); }} aria-label="Сколько ставить" />
                <span className="num">из {have}</span>
              </>
            ) : cur ? (
              <span>{full(stakeValue)} ₽ → <b className="gold">{full(value)} ₽</b></span>
            ) : (
              <span>Нечего ставить. Собери находки во дворе.</span>
            )}
          </div>

          {UPGRADE_MODES.map((x, i) => (
            <button key={x.id} className={`ug-mode ${x.id.startsWith("c") ? `ch-${x.id}` : ""} ${x.id === mode ? "on" : ""}`}
              style={{ left: ux(MODE_X + i * (MODE_W + MODE_GAP)), top: uy(1024), width: ux(MODE_W), height: uy(68) }}
              onClick={() => { setMode(x.id); setWon(null); setRoll(null); }} disabled={spinning}>
              {x.label}
            </button>
          ))}
          <button className="ug-go" style={{ left: ux(162), top: uy(1108), width: ux(700), height: uy(122) }}
            disabled={!cur || spinning || busy === "upgrade" || !canSpin} onClick={go}>
            <span>{spinning ? "Крутим…" : spinFree ? `Прокачать · бесплатно ${spins!.freeLeft}/${spins!.freePerDay}` : <>Прокачать · <Coin c={spinPrice.currency} v={spinPrice.amount} size={14} /></>}</span>
          </button>

          {/* the tray: what to put in */}
          <div className="ug-tray" style={{ left: ux(132), top: uy(1292), width: ux(762), height: uy(104) }}>
            {ups.map((u) => (
              <button key={`u${u.uid}`} className={`ug-chip upgraded ${cur?.kind === "up" && cur.uid === u.uid ? "on" : ""}`} onClick={() => pickStake({ kind: "up", uid: u.uid })} title={`${itemById(u.itemId)?.name} ★`} disabled={spinning}>
                <ItemArt id={u.itemId} size={30} /><span className="num">{full(u.value)}</span>
              </button>
            ))}
            {plain.map((id) => (
              <button key={id} className={`ug-chip ${cur?.kind === "plain" && cur.id === id ? "on" : ""}`} onClick={() => pickStake({ kind: "plain", id })} title={itemById(id)?.name} disabled={spinning}>
                <ItemArt id={id} size={30} /><span className="num">×{inv.get(id)}</span>
              </button>
            ))}
            {!ups.length && !plain.length && <span className="ug-empty">пусто</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- the game objects standing in the yard ---------------- */
/** The blackjack table with the «Зонк» board behind it: one object; a tap asks which game to play. */
export function YardGames() {
  const { state } = useGame();
  const [open, setOpen] = useState<"pick" | "blackjack" | "zonk" | "poker" | null>(null);
  // a call accepted from the pop-up (game-invites.tsx) opens its game here
  useEffect(() => {
    const g = takePendingGame();
    if (g) setOpen(g);
    const on = (e: Event) => { takePendingGame(); setOpen((e as CustomEvent<"blackjack" | "zonk" | "poker">).detail); };
    window.addEventListener(OPEN_GAME_EVENT, on);
    return () => window.removeEventListener(OPEN_GAME_EVENT, on);
  }, []);
  const zk = state?.games?.zonk;
  const invites = state?.bjInvites ?? 0;
  // zonk duel calls waiting for my answer (and duels where my game is still to play)
  const calls = (state?.duels ?? []).filter((d) => (d.status === "open" && !d.mine) || (d.status === "playing" && !d.started && d.myPoints === null)).length;
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
                note: state?.poker?.active ? "ждёт замен" : state?.poker?.perDay ? `${state.poker.left}/${state.poker.perDay} раздач` : `раздача ${POKER_RULES.price.amount} USD`, live: !!state?.poker?.active },
              { id: "blackjack", name: "Блэкджек", img: "/assets/yard/game-blackjack.webp",
                note: invites > 0 ? `зовут (${invites})` : "1–25 USD", live: invites > 0 },
              { id: "zonk", name: "Зонк", img: "/assets/yard/game-zonk.webp", note: calls > 0 ? `вызов (${calls})` : note(zk, "4 уровня"), live: !!zk?.active || calls > 0 },
            ] as const).map((gm) => (
              <button key={gm.id} type="button" data-game={gm.id} className={`game-tile ${gm.live ? "live" : ""}`} onClick={() => setOpen(gm.id)}>
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
