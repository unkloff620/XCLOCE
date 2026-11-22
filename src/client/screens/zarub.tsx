"use client";
/*
 * «Зарубы» (content/zarub.ts, server/systems/zarub.ts): the hub (зарубный уровень, кольца, самородки and «Переплавить»,
 * the difficulties' bags of tattoo sets opened for кольца), the start (three cards, «Погнали») and the race (8 tasks,
 * the rivals' progress, the finish window with the place and the reward).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api.ts";
import type { Granted } from "../api.ts";
import { useGame, useNow } from "../store.tsx";
import { usePageReady } from "../route-loader.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { GainLine, Modal } from "../ui.tsx";
import { clock, full } from "../format.ts";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { ART_VER } from "../preload.ts";
import { CURRENCIES } from "../../content/currencies.ts";
import { tattooPiece } from "../../content/tattoos.ts";
import {
  NUGGET, NUGGETS_PER_RING, RING, ZARUB_DAILY, ZARUB_MODES, ZARUB_SKIP_GOLD, zarubMode, zarubTaskDef, type ZarubMode,
} from "../../content/zarub.ts";
import type { ZarubView } from "../../server/systems/zarub.ts";

const A = "/assets/zarub";
/** «+60 к автомату» */
const TO_WEAPON: Record<string, string> = { "rug-pull-gun": "автомату", keyboard: "ножу", gpu: "пистолету" };
const pic = (name: string) => `${A}/${name}.webp?v=${ART_VER.items}`;

/** a task's picture: a currency / authority icon or an item */
function TaskIcon({ id, size }: { id: string; size: number }) {
  return (CURRENCIES as readonly string[]).includes(id) || id === "xp" ? <Icon name={id as "xp"} size={size} /> : <ItemArt id={id} size={size} />;
}

export function ZarubScreen() {
  const { act, busy } = useGame();
  const [v, setV] = useState<ZarubView | null>(null);
  // the start (three cards, «Погнали») is the main screen; the hub (the bags, «Переплавить») opens from it
  const [view, setView] = useState<"hub" | "pick">("pick");
  const load = useCallback(() => api.get<ZarubView>("/api/zarub").then(setV).catch(() => {}), []);
  useEffect(() => { void load(); const t = window.setInterval(load, 20_000); return () => clearInterval(t); }, [load]);
  usePageReady(!!v);
  if (!v) return <div className="fit-page zr-page" />;
  const run = async <T extends ZarubView>(type: string, body: Record<string, unknown> = {}) => {
    const r = await act<T>(type, body);
    if (r) setV(r);
    return r;
  };
  return (
    <div className="fit-page zr-page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="zr-bg" src={pic("bg")} alt="" draggable={false} />
      {/* the lamp on the wall flickers (its spot on the picture, the picture's own units: cover, like the img) */}
      <svg className="zr-lamp" viewBox="0 0 768 1152" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="zr-lamp-g">
            <stop offset="0" stopColor="#ffe2a0" stopOpacity="0.85" />
            <stop offset="0.3" stopColor="#ffb85a" stopOpacity="0.35" />
            <stop offset="1" stopColor="#ff9a30" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect className="zr-lamp-dark" x="0" y="0" width="768" height="1152" fill="#000" />
        <ellipse className="zr-lamp-glow" cx="218" cy="285" rx="190" ry="210" fill="url(#zr-lamp-g)" />
      </svg>
      {v.race ? <Race v={v} run={run} busy={!!busy} />
        : view === "pick" ? <Pick v={v} run={run} busy={!!busy} onBags={() => { haptic.tap(); setView("hub"); }} />
        : <Hub v={v} run={run} busy={!!busy} onStart={() => { haptic.tap(); setView("pick"); }} />}
    </div>
  );
}

type Run = <T extends ZarubView>(type: string, body?: Record<string, unknown>) => Promise<T | null>;

/** the axe with my зарубный уровень and the bar to the next */
function LevelBadge({ v }: { v: ZarubView }) {
  const frac = v.levelTo > v.levelFrom ? (v.xp - v.levelFrom) / (v.levelTo - v.levelFrom) : 1;
  return (
    <div className="zr-level" aria-label={`Уровень заруб ${v.level}`}>
      <span className="zr-level-axe">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pic("icon")} alt="" draggable={false} />
        <b className="num">{v.level}</b>
      </span>
      <span className="zr-level-bar"><i style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} /></span>
    </div>
  );
}

function Hub({ v, run, busy, onStart }: { v: ZarubView; run: Run; busy: boolean; onStart: () => void }) {
  const [mode, setMode] = useState<ZarubMode>("pacan");
  const [bag, setBag] = useState(0);
  const [got, setGot] = useState<{ tattoo: string; reward: Granted } | null>(null);
  const m = v.modes.find((x) => x.id === mode)!;
  const b = v.bags[mode][bag];
  const left = b.sets.some((s) => s.have < s.total);
  const go = (d: number) => { haptic.tap(); sfx("page"); setBag((x) => (x + d + 3) % 3); };
  return (
    <>
      <div className="zr-top">
        <button type="button" className="back-btn" onClick={onStart} aria-label="Назад">‹</button>
        <LevelBadge v={v} />
      </div>
      <div className="zr-wallet">
        <span><ItemArt id={RING} size={30} /><b className="num">{full(v.rings)}</b></span>
        <span><ItemArt id={NUGGET} size={30} /><b className="num">{full(v.nuggets)}</b></span>
      </div>
      {/* the nuggets towards the next кольцо, and «Переплавить» */}
      <div className="zr-melt">
        <div className="zr-nuggets">
          {Array.from({ length: NUGGETS_PER_RING }, (_, i) => <i key={i} className={i < Math.min(NUGGETS_PER_RING, v.nuggets) ? "on" : ""} />)}
        </div>
        <button type="button" className="btn gold sm zr-melt-btn" disabled={busy || v.nuggets < NUGGETS_PER_RING} onClick={() => { haptic.tap(); void run("zarub_melt"); }}>Переплавить</button>
      </div>
      <div className="zr-modes" role="tablist">
        {ZARUB_MODES.map((d) => {
          const open = v.modes.find((x) => x.id === d.id)!.open;
          return (
            <button key={d.id} type="button" role="tab" aria-selected={mode === d.id} className={`zr-mode ${d.id} ${mode === d.id ? "on" : ""} ${open ? "" : "locked"}`}
              onClick={() => { haptic.tap(); setMode(d.id); setBag(0); }}>
              {d.name}
              {!open && <small>с {d.level} ур.</small>}
            </button>
          );
        })}
      </div>
      {/* «ЗАРУБЫ»: to the start — the letters glow red and flicker; it darkens when pressed */}
      <button type="button" className="zr-sign" onClick={onStart} aria-label="Зарубы: начать">
        <span className="zr-sign-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic("sign")} alt="" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="zr-sign-text" src={pic("sign-text")} alt="" draggable={false} />
        </span>
      </button>
      {/* the bag: its 3 sets, how many tattoos of each are mine */}
      <div className="zr-shelf">
        <ul className="zr-sets">
          {b.sets.map((s) => (
            <li key={s.id} className={s.have >= s.total ? "done" : ""}>
              <b>«{s.name}»</b> <span className="num">{s.have}/{s.total}</span>
              <small>+{s.damage} к {TO_WEAPON[s.weapon] ?? s.weapon}</small>
            </li>
          ))}
        </ul>
        <div className="zr-bag-row">
          <button type="button" className="zr-arrow" data-nosfx onClick={() => go(-1)} aria-label="Предыдущая сумка">◀</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={`${mode}${bag}`} className="zr-bag" src={pic(`bag-${mode}-${bag}`)} alt="" draggable={false} />
          <button type="button" className="zr-arrow" data-nosfx onClick={() => go(1)} aria-label="Следующая сумка">▶</button>
        </div>
        <span className="zr-bag-n num">{bag + 1}/3</span>
        <button type="button" className="btn gold zr-open" disabled={busy || !m.open || !left || v.rings < b.price}
          onClick={async () => {
            haptic.tap();
            const r = await run<ZarubView & { tattoo: string; reward: Granted }>("zarub_bag", { mode, bag });
            if (r) setGot({ tattoo: r.tattoo, reward: r.reward });
          }}>
          {left ? <>Открыть · <ItemArt id={RING} size={22} /> {b.price}</> : "Собрано"}
        </button>
      </div>
      {got && (
        <Modal title="Сумка" onClose={() => setGot(null)}>
          <div className="col center" style={{ gap: 8, alignItems: "center" }}>
            <ItemArt id={got.tattoo} size={120} />
            <b className="display">{tattooPiece(got.tattoo)?.name ?? "Наколка"}</b>
            <button type="button" className="btn gold" onClick={() => setGot(null)}>Забрать</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** the start: the three difficulties, today's finishes of each, «Погнали» */
function Pick({ v, run, busy, onBags }: { v: ZarubView; run: Run; busy: boolean; onBags: () => void }) {
  const [mode, setMode] = useState<ZarubMode>("pacan");
  const d = zarubMode(mode)!;
  const m = v.modes.find((x) => x.id === mode)!;
  return (
    <>
      <div className="zr-top">
        <Link href="/" className="back-btn" aria-label="Домой">‹</Link>
        <LevelBadge v={v} />
        {/* the bags (tattoo sets for кольца) and «Переплавить» */}
        <button type="button" className="zr-bags-btn" onClick={onBags} aria-label="Сумки">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic("bag-pacan-0")} alt="" draggable={false} />
          <span className="num"><ItemArt id={RING} size={16} />{full(v.rings)}</span>
        </button>
      </div>
      <span className="zr-pick-sign">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pic("sign")} alt="Зарубы" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="zr-sign-text" src={pic("sign-text")} alt="" draggable={false} />
      </span>
      <div className="zr-cards">
        {ZARUB_MODES.map((x) => {
          const s = v.modes.find((y) => y.id === x.id)!;
          return (
            <button key={x.id} type="button" className={`zr-card ${x.id} ${mode === x.id ? "on" : ""} ${s.open ? "" : "locked"}`} onClick={() => { haptic.tap(); setMode(x.id); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pic(`zek-${x.id}`)} alt="" draggable={false} />
              {s.open ? <span className="zr-card-n num">{s.today}/{ZARUB_DAILY}</span> : <span className="zr-card-lock"><Icon name="lock" size={22} />{x.level} ур.</span>}
              <b className="zr-card-name">{x.name}</b>
            </button>
          );
        })}
      </div>
      <div className="zr-go">
        <button type="button" className="btn gold big" disabled={busy || !m.open || m.today >= ZARUB_DAILY} onClick={() => { haptic.tap(); void run("zarub_start", { mode }); }}>Погнали</button>
        <span className="zr-win">Награда за победу <b className="num">{d.rings}</b><ItemArt id={RING} size={30} /></span>
      </div>
    </>
  );
}

/** the race: my 8 tasks (bought out for слитки), the rivals' progress, the time */
function Race({ v, run, busy }: { v: ZarubView; run: Run; busy: boolean }) {
  const r = v.race!;
  const now = useNow();
  const d = zarubMode(r.mode)!;
  const over = r.finished || r.timedOut;
  return (
    <>
      <div className="zr-top">
        <Link href="/" className="back-btn" aria-label="Домой">‹</Link>
        <LevelBadge v={v} />
        <span className="zr-race-time num"><Icon name="clock" size={14} />{clock(Math.max(0, r.endsAt - now))}</span>
      </div>
      <div className="zr-race">
        <div className="zr-race-head">
          <b className="display">{d.name}</b>
          <span className="num">{r.done}/{r.tasks.length}</span>
        </div>
        <ol className="zr-rivals">
          {r.rivals.map((x, i) => (
            <li key={i} className={`${x.me ? "me" : ""} ${x.place === 1 ? "first" : ""}`}>
              <span className="zr-rival-place num">{x.place ?? "·"}</span>
              <span className="zr-rival-name">{x.name}</span>
              <span className="zr-rival-bar"><i style={{ width: `${Math.round(x.share * 100)}%` }} /></span>
              <span className="zr-rival-pct num">{Math.round(x.share * 100)}%</span>
            </li>
          ))}
        </ol>
        <ul className="zr-tasks">
          {r.tasks.map((t, i) => {
            const def = zarubTaskDef(t.kind);
            const done = t.progress >= t.target;
            return (
              <li key={i} className={done ? "done" : ""}>
                <TaskIcon id={def.icon} size={30} />
                <div className="zr-task-body">
                  <b>{def.title(t.target)}</b>
                  <span className="zr-task-bar"><i style={{ width: `${(t.progress / t.target) * 100}%` }} /></span>
                  <span className="zr-task-n num">{full(t.progress)}/{full(t.target)}</span>
                </div>
                {done ? <span className="zr-task-ok" aria-label="выполнено">✓</span> : !over && (
                  <button type="button" className="btn sm zr-skip" disabled={busy} onClick={() => { haptic.tap(); void run("zarub_skip", { index: i }); }}>
                    <Icon name="GOLD" size={16} />{ZARUB_SKIP_GOLD}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {over && (
        <Modal title={r.finished ? "Заруба пройдена!" : "Время вышло"} onClose={() => { void run("zarub_close"); }}>
          <div className="col center zr-done" style={{ gap: 10, alignItems: "center" }}>
            {r.finished && r.place && <b className="zr-done-place display">{r.place} место</b>}
            {r.reward ? <GainLine r={r.reward} size={30} /> : r.finished ? <span className="muted small">Лимит на сегодня — без награды</span> : null}
            {r.reward?.zarubXp ? <span className="zr-done-xp">+{r.reward.zarubXp} опыта заруб</span> : null}
            <button type="button" className="btn gold" onClick={() => { haptic.big(); void run("zarub_close"); }}>Забрать</button>
          </div>
        </Modal>
      )}
    </>
  );
}

