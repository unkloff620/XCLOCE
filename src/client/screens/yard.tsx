"use client";
import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { tasksReady, useGame, useNow } from "../store.tsx";
import { api } from "../api.ts";
import { YARD_SPOTS } from "../art/scenes.tsx";
import { ItemArt } from "../art/items.tsx";
import { YARD_DROPS, yardTime } from "../../content/yard.ts";
import { clock } from "../format.ts";
import { haptic } from "../telegram.ts";
import { setMusicTrack } from "../sound.ts";
import Link from "next/link";
import { Icon } from "../art/icons.tsx";
import { DriftingSky } from "../art/sky.tsx";
import { KioskArt } from "../art/kiosk.tsx";
import { exchangeWindow } from "../../content/currencies.ts";
import { SlotMachine } from "./slots.tsx";
import { YardGames, YardUpgrader } from "./minigames.tsx";
import { Help, HelpList } from "../help.tsx";
import { GainLine, Modal } from "../ui.tsx";
import type { Granted } from "../api.ts";

const LINKS = [
  { href: "/exchange", icon: "exchange", label: "Обменник", c: "#ffb347", hint: "Меняй одну валюту на другую. Ивент: работает один день из трёх." },
] as const;

interface YardData { items: { id: number; slot: number; drop: string; at: number }[]; max: number; nextAt: number | null; periodMs: number }

export function YardScreen() {
  const { state, act, toast } = useGame();
  const now = useNow();
  const [data, setData] = useState<YardData | null>(null);
  const [flying, setFlying] = useState<number | null>(null);
  const tod = yardTime(now);
  // the exchanger works one Moscow day out of three: the kiosk is open (the dealer smokes inside) or shut
  const exOpen = exchangeWindow(now).open;
  // enough energy for a task step (or a location reward waits) → the Locations button calls for attention
  const taskHint = tasksReady(state, now);
  const [slots, setSlots] = useState(false);
  // the yard goes on to the right: a swipe left shows its second half (the kiosk, the pigeon loft), right — back
  const [page, setPage] = useState(0);
  const [drag, setDrag] = useState(0);
  const touch = useRef<{ x: number; y: number; on: boolean | null } | null>(null);
  const onStart = (e: TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, on: null }; };
  const onMove = (e: TouchEvent) => {
    const c = touch.current, t = e.touches[0];
    if (!c) return;
    const dx = t.clientX - c.x, dy = t.clientY - c.y;
    if (c.on === null && Math.hypot(dx, dy) > 12) c.on = Math.abs(dx) > Math.abs(dy) * 1.5;
    if (c.on) setDrag(page === 0 ? Math.min(0, dx) : Math.max(0, dx));
  };
  const onEnd = () => {
    const c = touch.current;
    touch.current = null;
    if (c?.on && Math.abs(drag) > 50) { haptic.tap(); setPage(drag < 0 ? 1 : 0); }
    setDrag(0);
  };
  const turn = (to: number) => { haptic.tap(); setPage(to); };
  const pan = (k: number) => ({ transform: `translateX(calc(${(k - page) * 100}% + ${drag}px))`, transition: drag ? "none" : undefined });
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

  const pick = async (id: number) => {
    if (flying) return;
    haptic.tap();
    setFlying(id);
    const r = await act<{ name: string; reward: Granted; yard: YardData }>("yard_pick", { itemId: id });
    setTimeout(() => setFlying(null), 450);
    if (r) {
      toast(<GainLine r={r.reward} />, "ok");
      setData(r.yard);
    }
  };

  return (
    <div className="fit-page">
      <div className="title">
        <div className="title-row">
          <h1 className="display">Двор</h1>
          <Help topic="yard-menu" title="Как устроен двор">
            <p>Двор длинный: свайпни влево (или нажми стрелку справа) — там продолжение: ларёк-обменник и голубятня.</p>
            <p>Каждые 5 минут во дворе появляется случайная находка, максимум 5 сразу. Время идёт, даже когда игра закрыта — заходи и собирай.</p>
            <p>Изредка попадается Клавиатура. Всё найденное можно продать в инвентаре.</p>
            <HelpList title="Кнопки слева" rows={LINKS.map((b) => ({ key: b.href, icon: <Icon name={b.icon} size={44} />, name: b.label, hint: b.hint }))} />
            <p>Игровой автомат 777 — 3 бесплатные прокрутки в час. Справа от него — автомат «Апгрейдер»: улучшай находки и оружие.</p>
            <p>Подъезд — вход в локации: задания за энергию, шаги и награды. Значок «!» — энергии хватает на задание.</p>
            <p>Стол с табло — блэкджек (3 бесплатные партии в день) и зонк (1 бесплатная игра в день), дальше партия стоит 2 USD. Нажми на стол и выбери игру.</p>
          </Help>
        </div>
        <span className="row" style={{ gap: 6 }}>
          {tod === "night" && <span className="chip yard-night" title="Ночью редкие находки попадаются чаще">ночь · редкие находки</span>}
          <span className="chip">{data?.items.length ?? state?.yard.count ?? 0}/{data?.max ?? 5}</span>
        </span>
      </div>
      <div className={`yard tod-${tod} page-${page}`} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
        {/* blurred copy of the yard fills the space above the scene on tall screens */}
        <div className="scene-backdrop" style={{ backgroundImage: `url(/assets/yard/${tod === "night" ? "court-backdrop-dark" : "court-backdrop"}.webp)` }} />
        {/* the sharp scene stands on the nav at full width; the objects sit where they are drawn on the 2000×3405 sheet */}
        <div className="yard-stage yard-pan" style={pan(0)}>
          {/* the sunset sky (the same as in the fights) drifts behind the see-through sky of the yard */}
          <DriftingSky className="court-sky" src={tod === "night" ? "/assets/yard/sky-dark.webp" : undefined} />
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
          {data?.items.map((it) => {
            const spot = YARD_SPOTS[it.slot % YARD_SPOTS.length];
            const drop = YARD_DROPS.find((d) => d.id === it.drop);
            return (
              <button
                key={it.id}
                className={`yard-item ${flying === it.id ? "fly" : ""} ${drop && drop.weight <= 3 ? "rare" : ""}`}
                style={{ left: `${spot.x}%`, top: `${spot.y}%`, ["--r" as string]: `${spot.r}deg`, ["--d" as string]: `${(it.slot % 5) * -0.45}s` }}
                onClick={() => pick(it.id)}
                aria-label={drop?.name ?? "предмет"}
              >
                <ItemArt id={drop?.icon ?? "coins"} size={52} />
              </button>
            );
          })}
        </div>
        {/* the second half of the yard (tools/scene/build-yard2.py): the exchange kiosk, the garages, the pigeon loft */}
        <div className="yard-stage yard-pan yard-stage2" style={pan(1)} aria-hidden={page !== 1}>
          <DriftingSky className="court-sky" src={tod === "night" ? "/assets/yard/sky-dark.webp" : undefined} />
          <DriftingSky className="yard-reflect" src={tod === "night" ? "/assets/yard/sky-dark.webp" : undefined} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="yard-bg" src={tod === "night" ? "/assets/yard/yard2-bg-dark.webp" : "/assets/yard/yard2-bg.webp"} alt="" draggable={false} />
          <span className="yard-tint" aria-hidden="true" />
          {/* the exchange kiosk: its own picture over the yard (a button) */}
          <Link href="/exchange" className={`yard-obj yard-kiosk kiosk-live ${exOpen ? "" : "closed"}`} aria-label={exOpen ? "Обменник" : "Обменник (закрыт)"} title={exOpen ? "Обменник" : "Обменник закрыт"} tabIndex={page === 1 ? 0 : -1}>
            <KioskArt open={exOpen} night={tod === "night"} />
          </Link>
        </div>
        <button type="button" className={`yard-pager ${page === 0 ? "next" : "prev"}`} onClick={() => turn(page === 0 ? 1 : 0)} aria-label={page === 0 ? "Дальше по двору" : "Назад во двор"}>{page === 0 ? "›" : "‹"}</button>
        <nav className="yard-side" aria-label="Места во дворе">
          {LINKS.map((b) => (
            <Link key={b.href} href={b.href} className="icon-btn-art" style={{ ["--c" as string]: b.c }} aria-label={b.label} title={b.label}>
              <Icon name={b.icon} size={58} />
            </Link>
          ))}
        </nav>
        <div className="yard-timer">
          {!data ? "…" : data.nextAt ? <>Следующая находка через <b className="num">{clock(data.nextAt - now)}</b></> : <>Двор полон — собери, чтобы появилось новое</>}
        </div>
      </div>
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
