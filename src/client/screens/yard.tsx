"use client";
import { useCallback, useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { api } from "../api.ts";
import { YardScene, YARD_SPOTS } from "../art/scenes.tsx";
import { ItemArt } from "../art/items.tsx";
import { YARD_DROPS } from "../../content/yard.ts";
import { clock } from "../format.ts";
import { haptic } from "../telegram.ts";
import Link from "next/link";
import { Icon } from "../art/icons.tsx";
import { SlotMachine, SlotCabinet } from "./slots.tsx";
import { Help } from "../help.tsx";
import { Modal } from "../ui.tsx";

const LINKS = [
  { href: "/shop", icon: "shop", label: "Магазин", c: "#ff4d6d" },
  { href: "/exchange", icon: "exchange", label: "Обменник", c: "#3fd2ff" },
  { href: "/locations", icon: "map", label: "Локации", c: "#3ddc84" },
] as const;

interface YardData { items: { id: number; slot: number; drop: string; at: number }[]; max: number; nextAt: number | null; periodMs: number }

export function YardScreen() {
  const { state, act, toast } = useGame();
  const now = useNow();
  const [data, setData] = useState<YardData | null>(null);
  const [flying, setFlying] = useState<number | null>(null);
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
    const r = await act<{ name: string; yard: YardData }>("yard_pick", { itemId: id });
    setTimeout(() => setFlying(null), 450);
    if (r) {
      toast(`${r.name} — в инвентарь`, "ok");
      setData(r.yard);
    }
  };

  return (
    <div>
      <div className="title">
        <div className="title-row">
          <h1 className="display">Двор</h1>
          <Help topic="yard" title="Как устроен двор">
            <p>Каждые 5 минут во дворе появляется случайная находка, максимум 5 сразу. Время идёт, даже когда игра закрыта — заходи и собирай.</p>
            <p>Изредка попадаются Красная свеча и Клавиатура. Всё найденное можно продать в инвентаре.</p>
            <p>Слева — Магазин, Обменник и Локации. Справа стоит игровой автомат 777.</p>
          </Help>
        </div>
        <span className="chip">{data?.items.length ?? state?.yard.count ?? 0}/{data?.max ?? 5}</span>
      </div>
      <div className="yard">
        <YardScene />
        <nav className="yard-side" aria-label="Места во дворе">
          {LINKS.map((b) => (
            <Link key={b.href} href={b.href} className="side-btn" style={{ ["--c" as string]: b.c }}>
              <Icon name={b.icon} size={32} />
              <span>{b.label}</span>
            </Link>
          ))}
        </nav>
        <button className={`yard-slots ${state && state.slots.left > 0 ? "ready" : ""}`} onClick={() => setSlots(true)} aria-label="Игровой автомат 777">
          <SlotCabinet />
          {state && <span className="yard-slots-left num">{state.slots.left}/{state.slots.max}</span>}
        </button>
        <div className="yard-timer">
          {!data ? "…" : data.nextAt ? <>Следующая находка через <b className="num">{clock(data.nextAt - now)}</b></> : <>Двор полон — собери, чтобы появилось новое</>}
        </div>
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
