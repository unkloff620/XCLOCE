"use client";
import { useCallback, useEffect, useState } from "react";
import { tasksReady, useGame, useNow } from "../store.tsx";
import { api } from "../api.ts";
import { YARD_SPOTS } from "../art/scenes.tsx";
import { ItemArt } from "../art/items.tsx";
import { YARD_DROPS } from "../../content/yard.ts";
import { clock } from "../format.ts";
import { haptic } from "../telegram.ts";
import Link from "next/link";
import { Icon } from "../art/icons.tsx";
import { SlotMachine } from "./slots.tsx";
import { DriftingSky } from "../art/sky.tsx";
import { Help, HelpList } from "../help.tsx";
import { GainLine, Modal } from "../ui.tsx";
import { ART_VER } from "../preload.ts";
import type { Granted } from "../api.ts";

const LINKS = [
  { href: "/shop", icon: "shop", label: "Магазин", c: "#ff4d6d", hint: "Оружие, энергия, одежда и разное за игровую валюту." },
  { href: "/exchange", icon: "exchange", label: "Обменник", c: "#ffb347", hint: "Меняй одну валюту на другую (комиссия 5%)." },
  { href: "/locations", icon: "map", label: "Локации", c: "#3ddc84", hint: "Задания за энергию: проходи шаги и забирай награды. Значок «!» — энергии хватает на задание, пора её потратить." },
] as const;

interface YardData { items: { id: number; slot: number; drop: string; at: number }[]; max: number; nextAt: number | null; periodMs: number }

export function YardScreen() {
  const { state, act, toast } = useGame();
  const now = useNow();
  const [data, setData] = useState<YardData | null>(null);
  const [flying, setFlying] = useState<number | null>(null);
  // enough energy for a task step (or a location reward waits) → the Locations button calls for attention
  const taskHint = tasksReady(state, now);
  const [slots, setSlots] = useState(false);
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
            <p>Каждые 5 минут во дворе появляется случайная находка, максимум 5 сразу. Время идёт, даже когда игра закрыта — заходи и собирай.</p>
            <p>Изредка попадаются Красная свеча и Клавиатура. Всё найденное можно продать в инвентаре.</p>
            <HelpList title="Кнопки слева" rows={LINKS.map((b) => ({ key: b.href, icon: <Icon name={b.icon} size={44} />, name: b.label, hint: b.hint }))} />
            <p>Справа стоит игровой автомат 777 — 3 бесплатные прокрутки в час.</p>
          </Help>
        </div>
        <span className="chip">{data?.items.length ?? state?.yard.count ?? 0}/{data?.max ?? 5}</span>
      </div>
      <div className="yard">
        {/* full-screen scene: a blurred copy fills the screen, the sharp scene stands on the nav at full width */}
        {/* the sky drifts behind the yard */}
        <DriftingSky className="yard-sky" />
        <div className="yard-stage">
          {/* the sky upside down under the ground: it shows through the transparent puddles */}
          <DriftingSky className="yard-reflect" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="yard-bg" src={`/assets/yard/bg.webp?v=${ART_VER.yardBg}`} alt="" draggable={false} />
          <button className={`yard-slots ${state && state.slots.left > 0 ? "ready" : ""}`} onClick={() => setSlots(true)} aria-label="Игровой автомат 777">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/yard/slot.webp" alt="" draggable={false} />
            {state && <span className="yard-slots-left num">{state.slots.left}/{state.slots.max}</span>}
          </button>
          {data?.items.map((it) => {
            const spot = YARD_SPOTS[it.slot % YARD_SPOTS.length];
            const drop = YARD_DROPS.find((d) => d.id === it.drop);
            return (
              <button
                key={it.id}
                className={`yard-item ${flying === it.id ? "fly" : ""} ${drop && drop.weight <= 3 ? "rare" : ""}`}
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                onClick={() => pick(it.id)}
                aria-label={drop?.name ?? "предмет"}
              >
                <ItemArt id={drop?.icon ?? "coins"} size={52} />
              </button>
            );
          })}
        </div>
        <nav className="yard-side" aria-label="Места во дворе">
          {LINKS.map((b) => (
            <Link key={b.href} href={b.href} className={`icon-btn-art ${b.href === "/locations" && taskHint ? "glow" : ""}`} style={{ ["--c" as string]: b.c }} aria-label={b.label} title={b.label}>
              <Icon name={b.icon} size={58} />
              {b.href === "/locations" && taskHint && <span className="side-alert">!</span>}
            </Link>
          ))}
        </nav>
        <div className="yard-timer">
          {!data ? "…" : data.nextAt ? <>Следующая находка через <b className="num">{clock(data.nextAt - now)}</b></> : <>Двор полон — собери, чтобы появилось новое</>}
        </div>
      </div>
      {slots && (
        <Modal title={<span className="title-row">Игровой автомат <SlotsHelp /></span>} onClose={() => setSlots(false)}>
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
