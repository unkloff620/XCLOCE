"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { liveEnergy, useGame, useNow } from "../store.tsx";
import { api, type Granted } from "../api.ts";
import { LOCATIONS, locationById } from "../../content/locations.ts";
import type { Reward } from "../../content/rewards.ts";
import { LOCATION_ART, LocationScene } from "../art/scenes.tsx";
import { Icon } from "../art/icons.tsx";
import { Bar, Empty, Modal, RewardChips } from "../ui.tsx";
import { haptic } from "../telegram.ts";
import { Help } from "../help.tsx";

interface LocRow { id: string; unlocked: boolean; done: number; total: number; clears: number; tasks: { id: string; steps: number; need: number }[]; nextReward: Reward }

function useLocations() {
  const [rows, setRows] = useState<LocRow[] | null>(null);
  const load = useCallback(async () => {
    try {
      setRows((await api.get<{ locations: LocRow[] }>("/api/locations")).locations);
    } catch {
      /* keep */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { rows, load };
}

function Blocks({ done, total }: { done: number; total: number }) {
  return (
    <span className="blocks" aria-label={`${done}/${total}`}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < done ? "on" : ""} />)}
      <b className="num">{done}/{total}</b>
    </span>
  );
}

type ClaimResult = { reward: Granted; first: boolean; opened: string | null };

function ClaimedModal({ got, onClose }: { got: ClaimResult; onClose: () => void }) {
  return (
    <Modal title="Локация пройдена!" onClose={onClose}>
      <div className="col" style={{ alignItems: "center", textAlign: "center" }}>
        <RewardChips r={got.reward} />
        {got.opened && <div className="chip green">Открыта локация «{locationById(got.opened)?.name}»</div>}
        {got.reward.levelUp && <div className="chip violet">Новый уровень: {got.reward.levelUp.to}!</div>}
        <div className="small muted">Задания этой локации можно пройти заново.</div>
        <div className="row" style={{ width: "100%" }}>
          {got.opened && <Link className="btn green grow" href={`/locations/${got.opened}`} onClick={onClose}>Дальше</Link>}
          <button className="btn dark grow" onClick={onClose}>Ок</button>
        </div>
      </div>
    </Modal>
  );
}

export function LocationsScreen() {
  const { rows, load } = useLocations();
  const { act, busy } = useGame();
  const [got, setGot] = useState<ClaimResult | null>(null);
  const claim = async (locationId: string) => {
    const res = await act<ClaimResult>("location_claim", { locationId });
    if (res) {
      haptic.ok();
      setGot(res);
      void load();
    }
  };
  return (
    <div>
      <div className="title">
        <div>
          <Link href="/yard" className="back">← Двор</Link>
          <div className="title-row">
            <h1 className="display">Локации</h1>
            <Help topic="locations" title="Локации">
              <p>Энергия тратится только здесь: каждый шаг задания стоит энергии и даёт рубли и авторитет.</p>
              <p>Закрой все 5 заданий — на карточке появится кнопка «Забрать награду» (доллары и вещи), откроется следующая локация.</p>
              <p>Пройденную локацию можно повторить: награда за повтор — половина валюты и авторитета.</p>
              <p>Энергия: +1 каждые 5 минут до 50. Купить больше — нажми на энергию вверху.</p>
            </Help>
          </div>
        </div>
      </div>
      <div className="col" style={{ gap: 12 }}>
        {LOCATIONS.map((l) => {
          const r = rows?.find((x) => x.id === l.id);
          // the one to play now: the first open location not cleared yet
          const current = !!rows && rows.find((x) => x.unlocked && !x.clears)?.id === l.id;
          const cleared = !!r?.clears;
          const locked = r ? !r.unlocked : l.order > 1;
          const inner = (
            <>
              <LocationScene scene={l.scene} />
              <div className="loc-body">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="tiny muted display">ЛОКАЦИЯ {l.order}</span>
                  {cleared && <span className="chip green">✓ пройдена{r!.clears > 1 ? ` ×${r!.clears}` : ""}</span>}
                  {current && <span className="chip gold loc-now">сейчас здесь</span>}
                </div>
                <b className="display" style={{ fontSize: 18 }}>{locked ? "???" : l.name}</b>
                <div className="small muted">{locked ? `Закрой «${LOCATIONS[l.order - 2]?.name}»` : l.subtitle}</div>
                {!locked && <Blocks done={r?.done ?? 0} total={l.tasks.length} />}
              </div>
              {locked && <div className="loc-lock"><Icon name="lock" size={44} /></div>}
            </>
          );
          const ready = !locked && !!r && r.done === r.total;
          if (locked) return <div key={l.id} className="loc-card locked">{inner}</div>;
          if (ready) {
            return (
              <div key={l.id} className={`loc-card ready ${cleared ? "cleared" : ""}`}>
                {inner}
                <div className="loc-claim">
                  <RewardChips r={r!.nextReward} size={14} />
                  <div className="row">
                    <button className="btn gold grow" disabled={busy === "location_claim"} onClick={() => claim(l.id)}>
                      <Icon name="chest" size={20} /> Забрать награду
                    </button>
                    <Link href={`/locations/${l.id}`} className="btn dark sm">Открыть</Link>
                  </div>
                </div>
              </div>
            );
          }
          return <Link key={l.id} href={`/locations/${l.id}`} className={`loc-card ${cleared ? "cleared" : ""} ${current ? "current" : ""}`}>{inner}</Link>;
        })}
      </div>
      {got && <ClaimedModal got={got} onClose={() => setGot(null)} />}
    </div>
  );
}

export function LocationScreen({ id }: { id: string }) {
  const loc = locationById(id);
  const { state, act, busy } = useGame();
  const now = useNow();
  const { rows, load } = useLocations();
  const [got, setGot] = useState<ClaimResult | null>(null);
  if (!loc) return <Empty>Такой локации нет</Empty>;
  const r = rows?.find((x) => x.id === id);
  const energy = state ? liveEnergy(state, now).energy : 0;
  const allDone = !!r && r.done === r.total;

  const step = async (taskId: string) => {
    haptic.tap();
    const res = await act<{ steps: number; need: number; step: Granted; done: Granted | null; locationComplete: boolean }>("task", { taskId }, (x) =>
      x.done ? "Задание выполнено!" : `+${x.step.currencies.RUB ?? 0} ₽ · +${x.step.xp} авторитета`,
    );
    if (res) void load();
  };
  const claim = async () => {
    const res = await act<{ reward: Granted; first: boolean; opened: string | null }>("location_claim", { locationId: id });
    if (res) {
      haptic.ok();
      setGot(res);
      void load();
    }
  };

  return (
    <div className={LOCATION_ART.has(loc.scene) ? "loc-page has-bg" : "loc-page"}>
      {LOCATION_ART.has(loc.scene) && <div className="loc-page-bg" style={{ backgroundImage: `url(/assets/locations/${loc.scene}.webp)` }} aria-hidden="true" />}
      <div className="title">
        <Link href="/locations" className="back">← Локации</Link>
        <span className="chip gold"><Icon name="energy" size={16} />{energy}</span>
      </div>
      <div className="loc-card head">
        <LocationScene scene={loc.scene} />
        <div className="loc-body">
          <span className="tiny muted display">ЛОКАЦИЯ {loc.order}</span>
          <b className="display" style={{ fontSize: 20 }}>{loc.name}</b>
          <div className="small muted">{loc.subtitle}</div>
          <Blocks done={r?.done ?? 0} total={loc.tasks.length} />
        </div>
      </div>
      {r && !r.unlocked ? (
        <Empty>Локация закрыта. Сначала пройди предыдущую.</Empty>
      ) : (
        <>
          <div className="col" style={{ gap: 10, marginTop: 12 }}>
            {loc.tasks.map((t) => {
              const p = r?.tasks.find((x) => x.id === t.id);
              const steps = p?.steps ?? 0;
              const done = steps >= t.steps;
              return (
                <div key={t.id} className={`task ${done ? "done" : ""}`}>
                  <div className="grow col" style={{ gap: 5 }}>
                    <b>{t.title}</b>
                    <span className="tiny muted">{t.flavor}</span>
                    <Bar value={steps} max={t.steps} tone={done ? "green" : "violet"} label={`${steps}/${t.steps}`} />
                    <RewardChips r={t.stepReward} size={14} />
                  </div>
                  {done ? (
                    <span className="task-ok display">✓</span>
                  ) : (
                    <button className="btn green task-go" disabled={busy === "task" || energy < t.energy} onClick={() => step(t.id)}>
                      <span>GO</span>
                      <small className="row" style={{ gap: 2 }}><Icon name="energy" size={14} />{t.energy}</small>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className={`panel loc-reward ${allDone ? "ready" : ""}`} style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b className="display">Награда за локацию</b>
              {!!r?.clears && <span className="tiny muted">повтор: половина валюты и авторитета</span>}
            </div>
            <div style={{ margin: "8px 0" }}><RewardChips r={r?.nextReward ?? loc.reward} /></div>
            <button className="btn gold block" disabled={!allDone || busy === "location_claim"} onClick={claim}>
              {allDone ? "Забрать награду" : `Выполни все задания (${r?.done ?? 0}/${loc.tasks.length})`}
            </button>
          </div>
          {energy < Math.min(...loc.tasks.map((t) => t.energy)) && (
            <p className="small muted center">Энергия кончилась: +1 каждые 5 минут, или <Link href="/shop?tab=energy" style={{ color: "var(--gold)" }}>купи энергию</Link>.</p>
          )}
        </>
      )}
      {got && <ClaimedModal got={got} onClose={() => setGot(null)} />}
    </div>
  );
}
