"use client";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { usePageReady } from "../route-loader.tsx";
import { tasksReady, useGame, useNow } from "../store.tsx";
import { api } from "../api.ts";
import { yardSpot } from "../art/scenes.tsx";
import { ItemArt } from "../art/items.tsx";
import { YARD_DROPS, yardTime } from "../../content/yard.ts";
import { craftById } from "../../content/craft.ts";
import { clock } from "../format.ts";
import { haptic } from "../telegram.ts";
import { setMusicTrack } from "../sound.ts";
import Link from "next/link";
import { DriftingSky } from "../art/sky.tsx";
import { KioskArt } from "../art/kiosk.tsx";
import { Pigeons } from "../art/pigeons.tsx";
import { exchangeWindow } from "../../content/currencies.ts";
import { SlotMachine } from "./slots.tsx";
import { VanWindow, YardVan } from "./van.tsx";
import { YardGames, YardUpgrader } from "./minigames.tsx";
import { Help } from "../help.tsx";
import { GainLine, Modal } from "../ui.tsx";
import type { Granted } from "../api.ts";

const LINKS = [
  { href: "/exchange", icon: "exchange", label: "Обменник", c: "#ffb347", hint: "Меняй одну валюту на другую. Ивент: работает один день из трёх." },
] as const;

/** where the yard was left (its `pos`): the next visit opens there */
const POS_KEY = "yard-pos";

interface YardData { items: { id: number; slot: number; drop: string; at: number }[]; max: number; nextAt: number | null; periodMs: number }

export function YardScreen() {
  const { state, act } = useGame();
  const now = useNow();
  const [data, setData] = useState<YardData | null>(null);
  usePageReady(!!data);
  // picked finds vanish at once (several can be picked in a row); what each gave floats up where it lay, like a pigeon's roubles
  const [gone, setGone] = useState<Set<number>>(() => new Set());
  const [gains, setGains] = useState<{ key: number; page: -1 | 0 | 1; x: number; y: number; r: Granted }[]>([]);
  const tod = yardTime(now);
  // the exchanger works one Moscow day out of three: the kiosk is open (the dealer smokes inside) or shut
  const exOpen = exchangeWindow(now, state?.exchangeSchedule).open;
  // enough energy for a task step (or a location reward waits) → the Locations button calls for attention
  const taskHint = tasksReady(state, now);
  const [slots, setSlots] = useState(false);
  const [van, setVan] = useState(false);
  // the yard is three pictures side by side — -1 the back yard on the left (the mural wall, the arch), 0 the court, 1 the
  // kiosk and the pigeon loft on the right — one long yard the finger moves freely (the user 2026-11-27): `pos` is where
  // the screen stands (-1 … 1, in screens), it stays where it was let go (with a little glide), and the next visit opens
  // there again (POS_KEY). The arrows glide to the next picture's middle.
  const yardRef = useRef<HTMLDivElement>(null);
  const pos = useRef(0);
  const [page, setPage] = useState(0); // the picture mostly on screen (for the arrows, the counts and the keyboard)
  const anim = useRef(0);
  const apply = () => {
    yardRef.current?.style.setProperty("--pos", pos.current.toFixed(4));
  };
  const settle = () => {
    setPage(Math.max(-1, Math.min(1, Math.round(pos.current))));
    try { localStorage.setItem(POS_KEY, pos.current.toFixed(3)); } catch { /* storage blocked */ }
  };
  useEffect(() => {
    let p = 0;
    try { p = Number(localStorage.getItem(POS_KEY) ?? 0) || 0; } catch { /* storage blocked */ }
    pos.current = Math.max(-1, Math.min(1, p));
    apply();
    setPage(Math.max(-1, Math.min(1, Math.round(pos.current))));
    return () => cancelAnimationFrame(anim.current);
  }, []);
  // over the ends the yard gives way only a little (rubber) and springs back on release
  const rubber = (p: number) => (p < -1 ? -1 - (-1 - p) * 0.3 : p > 1 ? 1 + (p - 1) * 0.3 : p);
  const glide = (v: number) => {
    // after the finger: the speed dies down (screens per second); over an end — back to it
    cancelAnimationFrame(anim.current);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      v *= Math.pow(0.04, dt);
      pos.current += v * dt;
      const out = pos.current < -1 ? -1 : pos.current > 1 ? 1 : null;
      if (out !== null) { v = 0; pos.current += (out - pos.current) * Math.min(1, dt * 14); if (Math.abs(out - pos.current) < 0.002) pos.current = out; }
      apply();
      if (Math.abs(v) > 0.02 || (out !== null && pos.current !== out)) anim.current = requestAnimationFrame(step);
      else settle();
    };
    anim.current = requestAnimationFrame(step);
  };
  const glideTo = (to: number) => {
    cancelAnimationFrame(anim.current);
    const from = pos.current, t0 = performance.now(), dur = 380;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      pos.current = from + (to - from) * e;
      apply();
      if (k < 1) anim.current = requestAnimationFrame(step);
      else settle();
    };
    anim.current = requestAnimationFrame(step);
  };
  // the finger (or the mouse): sideways moves the yard; a tap that moved is no tap
  const drag = useRef<{ x: number; y: number; p: number; on: boolean | null; lx: number; lt: number; v: number } | null>(null);
  const moved = useRef(false);
  const begin = (x: number, y: number) => {
    cancelAnimationFrame(anim.current);
    drag.current = { x, y, p: pos.current, on: null, lx: x, lt: performance.now(), v: 0 };
    moved.current = false;
  };
  const move = (x: number, y: number) => {
    const d = drag.current;
    if (!d) return;
    const dx = x - d.x, dy = y - d.y;
    if (d.on === null && Math.hypot(dx, dy) > 10) d.on = Math.abs(dx) > Math.abs(dy);
    if (!d.on) return;
    moved.current = true;
    const w = yardRef.current?.clientWidth || 1;
    const now = performance.now();
    if (now > d.lt) d.v = d.v * 0.5 + (-(x - d.lx) / w / ((now - d.lt) / 1000)) * 0.5;
    d.lx = x; d.lt = now;
    pos.current = rubber(d.p - dx / w);
    apply();
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    glide(Math.max(-6, Math.min(6, performance.now() - d.lt > 90 ? 0 : d.v)));
  };
  const onStart = (e: TouchEvent) => begin(e.touches[0].clientX, e.touches[0].clientY);
  const onMove = (e: TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY);
  const onDown = (e: MouseEvent) => { if (e.button === 0) begin(e.clientX, e.clientY); };
  const onMouseMove = (e: MouseEvent) => { if (drag.current && e.buttons & 1) move(e.clientX, e.clientY); };
  const turn = (to: number) => { haptic.tap(); glideTo(Math.max(-1, Math.min(1, to))); };
  const pan = (k: number) => ({ ["--k" as string]: k });
  const load = useCallback(async () => {
    try {
      setData(await api.get<YardData>("/api/yard"));
    } catch {
      /* keep */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, state?.yard.count]);
  // the yard sounds like outdoors: leaves in the wind and birds instead of the music; the music comes back on leaving
  useEffect(() => {
    setMusicTrack("yard");
    return () => setMusicTrack("calm");
  }, []);
  // when the timer runs out, look again
  useEffect(() => {
    if (data?.nextAt && now >= data.nextAt + 500) void load();
  }, [now, data?.nextAt, load]);

  const pick = async (id: number, at: { page: -1 | 0 | 1; x: number; y: number }) => {
    if (gone.has(id)) return;
    haptic.tap();
    setGone((g) => new Set(g).add(id));
    const r = await act<{ name: string; reward: Granted; yard: YardData }>("yard_pick", { itemId: id });
    if (r) {
      setGains((l) => [...l.slice(-5), { key: Date.now() + id, page: at.page, x: at.x, y: at.y, r: r.reward }]);
      setData(r.yard);
    } else setGone((g) => { const n = new Set(g); n.delete(id); return n; });
  };

  // the finds lie on all three screens of the yard (art/scenes.tsx yardSpot); the gains pop up where they were picked
  const left = data?.items.filter((it) => !gone.has(it.id)) ?? [];
  const finds = (pg: -1 | 0 | 1) => (
    <>
      {gains.filter((g) => g.page === pg).map((g) => (
        <span key={g.key} className="pg-gain yard-gain num" style={{ left: `${g.x}%`, top: `${g.y}%` }} onAnimationEnd={() => setGains((l) => l.filter((x) => x.key !== g.key))}>
          <GainLine r={g.r} size={20} times={false} />
        </span>
      ))}
      {left.map((it) => ({ it, spot: yardSpot(it.slot) })).filter(({ spot }) => spot.page === pg).map(({ it, spot }) => {
        // a craft part lies there by its own id
        const part = it.drop.startsWith("part-") ? craftById(it.drop) : null;
        const drop = part ? { name: part.name, icon: part.id, weight: 10 } : YARD_DROPS.find((d) => d.id === it.drop);
        return (
          <button
            key={it.id}
            className={`yard-item ${drop && drop.weight <= 10 ? "rare" : ""}`}
            style={{ left: `${spot.x}%`, top: `${spot.y}%`, ["--r" as string]: `${spot.r}deg`, ["--d" as string]: `${(it.slot % 5) * -0.45}s` }}
            onClick={() => pick(it.id, spot)}
            tabIndex={page === pg ? 0 : -1}
            aria-label={drop?.name ?? "предмет"}
          >
            <ItemArt id={drop?.icon ?? "coins"} size={38} />
          </button>
        );
      })}
    </>
  );
  // finds on the screens to the left / to the right of this one: a count on the arrow
  const onLeft = left.filter((it) => yardSpot(it.slot).page < page).length;
  const onRight = left.filter((it) => yardSpot(it.slot).page > page).length;

  return (
    <div className="fit-page">
      <div className="title">
        <div className="title-row">
          <h1 className="display">Двор</h1>
          <Help topic="yard-menu" title="Как устроен двор">
            <p>Двор длинный: веди пальцем влево-вправо (или жми стрелки) — справа ларёк-обменник и голубятня, слева задний двор. Где остановился — там двор и откроется в следующий раз.</p>
            <p>Каждые 5 минут во дворе появляется случайная находка, максимум 5 сразу. Время идёт, даже когда игра закрыта — заходи и собирай.</p>
            <p>Изредка попадается Клавиатура. Всё найденное можно продать в инвентаре.</p>
            <p>Обменник — ларёк в правой части двора. {LINKS[0].hint}</p>
            <p>Игровой автомат 777 — 3 бесплатные прокрутки в час. Справа от него — автомат «Апгрейдер»: улучшай находки и оружие.</p>
            {state?.fortune?.on && <p>Задний двор (левая часть) — люк «Колесо удачи»: крути за билеты, джекпот растёт с каждой прокруткой.</p>}
            <p>Подъезд — вход в локации: задания за энергию, шаги и награды. Значок «!» — энергии хватает на задание.</p>
            <p>Стол с табло — блэкджек (3 бесплатные партии в день) и зонк (1 бесплатная игра в день), дальше партия стоит рубли. Нажми на стол и выбери игру.</p>
          </Help>
        </div>
        <span className="row" style={{ gap: 6 }}>
          {tod === "night" && <span className="chip yard-night">ночь</span>}
          <span className="chip">{data?.items.length ?? state?.yard.count ?? 0}/{data?.max ?? 5}</span>
        </span>
      </div>
      <div ref={yardRef} className={`yard yard-free tod-${tod} page-${page < 0 ? "left" : page}`} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={end} onTouchCancel={end}
        onMouseDown={onDown} onMouseMove={onMouseMove} onMouseUp={end} onMouseLeave={end}
        onClickCapture={(e) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } }}>
        {/* blurred copy of the yard fills the space above the scene on tall screens */}
        <div className="scene-backdrop" style={{ backgroundImage: `url(/assets/yard/${tod === "night" ? "court-backdrop-dark" : "court-backdrop"}.webp)` }} />
        {/* one sky over the whole long yard (behind its three pictures, moving with them): no seams between them */}
        <div className="yard-stage yard-sky-all" aria-hidden="true">
          <DriftingSky className="court-sky" copies={6} src={tod === "night" ? "/assets/yard/sky-dark.webp" : undefined} />
        </div>
        {/* the sharp scene stands on the nav at full width; the objects sit where they are drawn on the 2000×3405 sheet */}
        <div className="yard-stage yard-pan" style={pan(0)}>
          {/* the same sky upside down under the ground: it shows in the see-through puddles */}
          <DriftingSky className="yard-reflect" src={tod === "night" ? "/assets/yard/sky-dark.webp" : undefined} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* the night has its own drawn yard (lit windows, the lamp, the neon) and its own sky: no dark filter on top */}
          <img className="yard-bg" src={tod === "night" ? "/assets/yard/court-dark.webp" : "/assets/yard/court-night.webp"} alt="" draggable={false} />
          {/* the time of day in Moscow tints the yard: a cool bright day, the drawn sunset in the evening, a dark blue night */}
          <span className="yard-tint" aria-hidden="true" />
          {/* the street lamp at night: its light flickers now and then */}
          {tod === "night" && <span className="yard-lamp" aria-hidden="true"><i /></span>}
          {/* the entrance leads to the locations with tasks */}
          <Link href="/locations" className={`yard-obj yard-entrance ${taskHint ? "call" : ""}`} aria-label="Локации" title="Локации">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="yard-ring" src="/assets/yard/court-entrance-ring.webp" alt="" draggable={false} />
            <img src={tod === "night" ? "/assets/yard/court-entrance-dark.webp" : "/assets/yard/court-entrance.webp"} alt="" draggable={false} />
            {taskHint && <span className="side-alert">!</span>}
          </Link>
          <YardGames />
          <button className={`yard-obj yard-slots ${state && state.slots.left > 0 ? "ready" : ""}`} onClick={() => setSlots(true)} aria-label="Игровой автомат 777">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="yard-ring" src="/assets/yard/court-slot-ring.webp" alt="" draggable={false} />
            <img src="/assets/yard/court-slot.webp" alt="" draggable={false} />
            {state && <span className="yard-slots-left num">{state.slots.left}/{state.slots.max}</span>}
          </button>
          <YardUpgrader />
          {/* pigeons on the ground in front of the machines (low, clear of the finds) */}
          <Pigeons area={{ x0: 8, x1: 92, y0: 3, y1: 9 }} n={2} />
          {finds(0)}
        </div>
        {/* the back yard on the left (tools/scene/build-yard0.py): the manhole of «Колесо удачи» */}
        <div className="yard-stage yard-pan yard-stage0" style={pan(-1)} aria-hidden={page !== -1}>
          <DriftingSky className="yard-reflect" src={tod === "night" ? "/assets/yard/sky-dark.webp" : undefined} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="yard-bg" src={tod === "night" ? "/assets/yard/yard0-bg-dark.webp" : "/assets/yard/yard0-bg.webp"} alt="" draggable={false} />
          <span className="yard-tint" aria-hidden="true" />
          {finds(-1)}
          {/* «Барыга на газели»: Friday to Sunday, the artist's van idling in the back yard */}
          {state?.van?.open && <YardVan onOpen={() => setVan(true)} focusable={page === -1} />}
          {/* «Колесо удачи»: a manhole on the ground (the admins see it before the players) */}
          {state?.fortune?.on && (
            <Link href="/yard/fortune" className="yard-obj yard-fortune" aria-label="Колесо удачи" title="Колесо удачи" tabIndex={page === -1 ? 0 : -1}>
              {/* the hole under the lid: light from below, brighter when the lid jumps */}
              <span className="yard-fortune-hole" aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/fortune/yard-lid.webp" alt="" draggable={false} />
            </Link>
          )}
        </div>
        {/* the second half of the yard (tools/scene/build-yard2.py): the exchange kiosk, the garages, the pigeon loft */}
        <div className="yard-stage yard-pan yard-stage2" style={pan(1)} aria-hidden={page !== 1}>
          <DriftingSky className="yard-reflect" src={tod === "night" ? "/assets/yard/sky-dark.webp" : undefined} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="yard-bg" src={tod === "night" ? "/assets/yard/yard2-bg-dark.webp" : "/assets/yard/yard2-bg.webp"} alt="" draggable={false} />
          <span className="yard-tint" aria-hidden="true" />
          <Pigeons area={{ x0: 55, x1: 94, y0: 6, y1: 22 }} n={3} first={2} />
          {/* the exchange kiosk: its own picture over the yard (a button) */}
          {finds(1)}
          <Link href="/exchange" className={`yard-obj yard-kiosk kiosk-live ${exOpen ? "" : "closed"}`} aria-label={exOpen ? "Обменник" : "Обменник (закрыт)"} title={exOpen ? "Обменник" : "Обменник закрыт"} tabIndex={page === 1 ? 0 : -1}>
            <KioskArt open={exOpen} night={tod === "night"} />
          </Link>
          {/* «Бандитский фарт» (screens/bandit.tsx): a plain button right of the exchange until the artist's machine is drawn */}
          <Link href="/yard/bandit" className="yard-obj yard-bandit" aria-label="Бандитский фарт" title="Бандитский фарт" tabIndex={page === 1 ? 0 : -1}><span className="btn gold">Слоты</span></Link>
        </div>
        {page > -1 && <button type="button" className="yard-pager prev" onClick={() => turn(page - 1)} aria-label={page === 0 ? "Задний двор" : "Назад во двор"}>‹{onLeft > 0 && <span className="yard-pager-n num">{onLeft}</span>}</button>}
        {page < 1 && <button type="button" className="yard-pager next" onClick={() => turn(page + 1)} aria-label={page === 0 ? "Дальше по двору" : "Назад во двор"}>›{onRight > 0 && <span className="yard-pager-n num">{onRight}</span>}</button>}
        <div className="yard-timer">
          {!data ? "…" : data.nextAt ? <>Следующая находка через <b className="num">{clock(data.nextAt - now)}</b></> : <>Двор полон — собери, чтобы появилось новое</>}
        </div>
      </div>
      {van && <VanWindow onClose={() => setVan(false)} />}
      {slots && (
        <Modal onClose={() => setSlots(false)} page>
          <div className="sl-help"><SlotsHelp /></div>
          <SlotMachine />
        </Modal>
      )}
    </div>
  );
}

function SlotsHelp() {
  return (
    <Help topic="slots" title="Автомат 777">
      <p>Крутить бесплатно, 3 раза за любые 60 минут.</p>
      <ul>
        <li>Три одинаковых символа — приз.</li>
        <li>Любые два одинаковых — немного рублей.</li>
        <li>777 — куш: деньги и оружие.</li>
      </ul>
      <p>Все выплаты — под кнопкой «Выплаты».</p>
    </Help>
  );
}
