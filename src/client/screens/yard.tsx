"use client";
import { useCallback, useEffect, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { api } from "../api.ts";
import { YardScene, YARD_SPOTS } from "../art/scenes.tsx";
import { ItemArt } from "../art/items.tsx";
import { YARD_DROPS } from "../../content/yard.ts";
import { clock } from "../format.ts";
import { haptic } from "../telegram.ts";

interface YardData { items: { id: number; slot: number; drop: string; at: number }[]; max: number; nextAt: number | null; periodMs: number }

export function YardScreen() {
  const { state, act, toast } = useGame();
  const now = useNow();
  const [data, setData] = useState<YardData | null>(null);
  const [flying, setFlying] = useState<number | null>(null);
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
        <h1 className="display">Двор</h1>
        <span className="chip">{data?.items.length ?? state?.yard.count ?? 0}/{data?.max ?? 5}</span>
      </div>
      <div className="yard">
        <YardScene />
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
      <p className="small muted" style={{ margin: "10px 2px" }}>
        Каждые 5 минут во дворе появляется случайная находка, максимум 5 сразу. Время идёт, даже когда игра закрыта. Изредка попадаются Красная свеча и Клавиатура.
      </p>
    </div>
  );
}
