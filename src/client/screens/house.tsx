"use client";
import { useGame } from "../store.tsx";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { HomeScene } from "../art/home-scene.tsx";
import { money } from "../format.ts";
import { haptic } from "../telegram.ts";
import { EQUIPMENT, ROOM_DEFS, stageOf, type Bonus } from "../../content/home.ts";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

export function BonusLine({ b }: { b: Bonus }) {
  const parts: string[] = [];
  if (b.critChance) parts.push(`шанс крита +${pct(b.critChance)}`);
  if (b.critDamage) parts.push(`сила крита +${pct(b.critDamage)}`);
  if (b.damage) parts.push(`урон +${pct(b.damage)}`);
  return <span>{parts.length ? parts.join(" · ") : "без бонуса"}</span>;
}

/** «Обстановка»: upgrades of the things in the room (desk, monitors, chair, light). `focus` puts one piece first. */
export function EquipmentWindow({ focus, onClose }: { focus?: string | null; onClose: () => void }) {
  const { state, act, busy } = useGame();
  if (!state) return null;
  const list = focus ? [...EQUIPMENT.filter((e) => e.id === focus), ...EQUIPMENT.filter((e) => e.id !== focus)] : EQUIPMENT;
  const b = state.home.bonus;
  const up = async (id: string, name: string) => {
    const r = await act<{ level: number }>("equipment_upgrade", { id }, (x) => `${name}: уровень ${x.level}`);
    if (r) haptic.ok();
  };
  return (
    <Modal title="Обстановка" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        <div className="bonus-sum small">
          <span className="muted">Сейчас:</span>
          <span className="chip gold">крит {pct(b.critChance)}</span>
          <span className="chip red">сила ×{(1.5 + b.critDamage).toFixed(2)}</span>
          <span className="chip green">урон +{pct(b.damage)}</span>
        </div>
        {list.map((e) => {
          const lv = state.home.levels[e.id] ?? 0;
          const next = e.levels[lv];
          const can = next ? (state.wallet[next.price.currency] ?? 0) >= next.price.amount : false;
          return (
            <div key={e.id} className={`equip-row ${focus === e.id ? "focus" : ""}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>{e.name}</b>
                <span className="equip-lv">{Array.from({ length: e.levels.length }, (_, i) => <i key={i} className={i < lv ? "on" : ""} />)}</span>
              </div>
              {e.stages && (() => {
                const shown = stageOf(e.id, state.home.levels, state.home.decor).level;
                return (
                  <>
                    <div className="equip-stage">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/assets/home/${e.stages[shown].art}.webp`} alt="" />
                      <div className="col" style={{ gap: 2, minWidth: 0 }}>
                        <b className="small">{e.stages[shown].name}</b>
                        {next && <span className="tiny muted">дальше: {e.stages[lv + 1]?.name}</span>}
                      </div>
                    </div>
                    {lv > 0 && (
                      // any owned stage can stand in the room; the bonus stays the bought level's
                      <div className="stage-pick" role="radiogroup" aria-label={`${e.name}: что поставить в комнату`}>
                        {e.stages.slice(0, lv + 1).map((st, i) => (
                          <button key={i} role="radio" aria-checked={i === shown} className={`stage-opt ${i === shown ? "on" : ""}`} title={st.name}
                            disabled={busy === "decor_set"} onClick={() => i !== shown && act("decor_set", { id: e.id, stage: i }, `В комнате: ${st.name}`)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/assets/home/${st.art}.webp`} alt="" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="tiny muted">{e.description}</div>
              <div className="tiny">
                {lv > 0 && <>Сейчас: <BonusLine b={e.levels[lv - 1].bonus} /><br /></>}
                {next && <>Уровень {lv + 1}: <b><BonusLine b={next.bonus} /></b></>}
              </div>
              {next ? (
                <button className="btn sm gold block" disabled={!can || busy === "equipment_upgrade"} onClick={() => up(e.id, e.name)}>
                  {lv === 0 && !e.stages ? "Купить" : "Улучшить"} · <Icon name={next.price.currency} size={15} /> {money(next.price.currency, next.price.amount)}
                </button>
              ) : (
                <div className="chip green" style={{ alignSelf: "flex-start" }}>Максимальный уровень</div>
              )}
            </div>
          );
        })}
        <div className="tiny muted">Бонусы работают в бою с любым боссом: крит наносит ×1.5 урона и больше. Бонусы обстановки и всех купленных комнат складываются. Улучшенный стол и новые мониторы сразу появляются в комнате.</div>
      </div>
    </Modal>
  );
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
              <div className="room-thumb"><HomeScene room={r.id} still levels={state.home.levels} decor={state.home.decor} /></div>
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
