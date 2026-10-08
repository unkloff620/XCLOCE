"use client";
import { useGame } from "../store.tsx";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { HomeScene } from "../art/home-scene.tsx";
import { money } from "../format.ts";
import { ROOM_DEFS, type Bonus } from "../../content/home.ts";

/* «Обстановка» moved into the room editor (decorator.tsx). */
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

export function BonusLine({ b }: { b: Bonus }) {
  const parts: string[] = [];
  if (b.critChance) parts.push(`шанс крита +${pct(b.critChance)}`);
  if (b.critDamage) parts.push(`сила крита +${pct(b.critDamage)}`);
  if (b.damage) parts.push(`урон +${pct(b.damage)}`);
  if (b.energyMax) parts.push(`лимит энергии +${b.energyMax}`);
  if (b.fistDamage) parts.push(`урон кулака +${b.fistDamage}`);
  return <span>{parts.length ? parts.join(" · ") : "без бонуса"}</span>;
}

export function RoomsWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  if (!state) return null;
  return (
    <Modal title="Комнаты" onClose={onClose} wide>
      <div className="rooms-grid">
        {ROOM_DEFS.map((r) => {
          const owned = state.home.rooms.includes(r.id);
          const here = state.look.room === r.id;
          const can = r.price ? (state.wallet[r.price.currency] ?? 0) >= r.price.amount : true;
          return (
            <div key={r.id} className={`room-card ${here ? "here" : ""}`}>
              <div className="room-thumb"><HomeScene room={r.id} still pieces={state.home.pieces} decor={state.home.decor} trophies={state.home.trophies} /></div>
              <b className="display">{r.name}</b>
              <div className="tiny muted">{r.description}</div>
              <div className="tiny" style={{ color: "var(--gold)" }}><BonusLine b={r.bonus} /></div>
              {here ? (
                <span className="chip green">Ты здесь</span>
              ) : owned ? (
                <button className="btn sm violet block" disabled={!!busy} onClick={() => act("room_set", { id: r.id }, `Переезд: ${r.name}`)}>Перейти</button>
              ) : (
                <button className="btn sm gold block" disabled={!can || busy === "room_buy"} onClick={() => act("room_buy", { id: r.id }, `Куплено: ${r.name}`)}>
                  <Icon name={r.price!.currency} size={15} /> {money(r.price!.currency, r.price!.amount)}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="tiny muted center" style={{ margin: "10px 0 0" }}>Бонус купленной комнаты действует всегда, даже если ты сейчас в другой.</p>
    </Modal>
  );
}
