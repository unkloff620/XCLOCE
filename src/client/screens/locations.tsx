"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { liveEnergy, useGame, useNow } from "../store.tsx";
import { api, type Granted } from "../api.ts";
import { LOCATIONS, locationById, taskOpen } from "../../content/locations.ts";
import type { Reward } from "../../content/rewards.ts";
import { LOCATION_ART, LocationScene } from "../art/scenes.tsx";
import { Icon } from "../art/icons.tsx";
import { Bar, Empty, Modal, RewardChips } from "../ui.tsx";
import { haptic } from "../telegram.ts";
import { Help } from "../help.tsx";
import { sfx } from "../sound.ts";
import { itemById } from "../../content/items.ts";
import { STASH_PITY, STASH_SETS, stashChance, stashSetOf, stashSetsByLocation } from "../../content/stashes.ts";

/** A stash found during a task: the picture, its set and how many of the set are found. */
function StashFound({ id, onClose }: { id: string; onClose: () => void }) {
  const { state } = useGame();
  const d = itemById(id);
  const set = stashSetOf(id);
  const have = set ? set.items.filter((i) => (state?.inventory ?? []).some((x) => x.id === i.id && x.qty > 0)).length : 0;
  return (
    <Modal title="Нычка!" onClose={onClose}>
      <div className="col" style={{ gap: 8, alignItems: "center", textAlign: "center" }}>
        <span className="stash-cell big stash-pop">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/assets/items/${id}.webp`} alt="" /></span>
        <b className="display" style={{ fontSize: 20 }}>{d?.name}</b>
        <span className="small">{d?.description}</span>
        {set && <span className="chip gold">{set.name}: {have}/4{have >= 4 ? " — собери набор в достижениях «Нычки»" : ""}</span>}
        <button className="btn gold block" onClick={onClose}>Забрать</button>
      </div>
    </Modal>
  );
}

interface LocRow { id: string; unlocked: boolean; done: number; total: number; clears: number; tasks: { id: string; steps: number; need: number }[]; nextReward: Reward }

interface StashMeter { energy: number; pity: number }

function useLocations() {
  const [rows, setRows] = useState<LocRow[] | null>(null);
  const [meter, setMeter] = useState<StashMeter | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await api.get<{ locations: LocRow[]; stash?: StashMeter }>("/api/locations");
      setRows(r.locations);
      setMeter(r.stash ?? null);
    } catch {
      /* keep */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { rows, meter, load };
}

function Blocks({ done, total }: { done: number; total: number }) {
  return (
    <span className="blocks" aria-label={`${done}/${total}`}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < done ? "on" : ""} />)}
      <b className="num">{done}/{total}</b>
    </span>
  );
}

type ClaimResult = { reward: Granted; first: boolean; opened: string | null; stash?: string | null };

function ClaimedModal({ got, onClose }: { got: ClaimResult; onClose: () => void }) {
  return (
    <Modal title="Локация пройдена!" onClose={onClose}>
      <div className="col" style={{ alignItems: "center", textAlign: "center" }}>
        <RewardChips r={got.reward} />
        {got.stash && (
          <div className="col" style={{ alignItems: "center", gap: 4 }}>
            <span className="stash-cell big stash-pop" style={{ width: 120 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/assets/items/${got.stash}.webp`} alt="" /></span>
            <b>Нычка: {itemById(got.stash)?.name}</b>
          </div>
        )}
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
              <p>Задания идут по очереди, как по карте: следующее открывается, когда выполнено предыдущее. Закрой все 5 заданий — на карточке появится кнопка «Забрать награду» (доллары и вещи), откроется следующая локация.</p>
              <p>Пройденную локацию можно повторить: награда за повтор — половина валюты и авторитета.</p>
              <p><b>Нычки</b> находятся за потраченную энергию: каждый шаг задания — шанс 1% за каждую ⚡ (шаг за 3 ⚡ — 3%, за 20 ⚡ — 20%). Не везёт — энергия копится в «нычкомере», и после {STASH_PITY} ⚡ без находки нычка выпадает наверняка. Чаще выпадают те, которых у тебя ещё нет. У каждой локации свои наборы по 4 нычки. Собери набор целиком и забери награду в достижениях «Нычки». Найденные лежат в инвентаре во вкладке «Нычки».</p>
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

/** where the five task stops stand on the path (percent of the map), the first one at the bottom */
const STOPS = [
  { x: 28, y: 90 },
  { x: 74, y: 67 },
  { x: 24, y: 46 },
  { x: 66, y: 26 },
  { x: 38, y: 8 },
];
const MAP_W = 360;
const MAP_H = 440;

/** a stash picture for every task: the location's own stashes (locations without sets borrow from the whole pool) */
function stopIcons(locationId: string, order: number, n: number): string[] {
  const own = stashSetsByLocation(locationId).flatMap((s) => s.items.map((i) => i.id));
  const pool = own.length ? own : STASH_SETS.flatMap((s) => s.items.map((i) => i.id));
  const offset = own.length ? 0 : order * 7;
  const stride = own.length ? 1 : 6;
  return Array.from({ length: n }, (_, i) => pool[(offset + i * stride) % pool.length]);
}

/** the path between two stops: across, then up (like the drawn map) */
function legPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const ax = (a.x / 100) * MAP_W, ay = (a.y / 100) * MAP_H, bx = (b.x / 100) * MAP_W, by = (b.y / 100) * MAP_H;
  return `M${ax} ${ay} H${bx} V${by}`;
}

export function LocationScreen({ id }: { id: string }) {
  const loc = locationById(id);
  const { state, act, busy, toast } = useGame();
  const now = useNow();
  const { rows, meter, load } = useLocations();
  const [got, setGot] = useState<ClaimResult | null>(null);
  const [stash, setStash] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  // "+36 ₽" flying up from the tapped stop
  const [pops, setPops] = useState<{ key: number; i: number; text: string }[]>([]);
  if (!loc) return <Empty>Такой локации нет</Empty>;
  const r = rows?.find((x) => x.id === id);
  const energy = state ? liveEnergy(state, now).energy : 0;
  const allDone = !!r && r.done === r.total;
  const stepsOf = (taskId: string) => r?.tasks.find((x) => x.id === taskId)?.steps ?? 0;
  const tasks = loc.tasks.map((t, i) => {
    const steps = stepsOf(t.id);
    return { t, i, steps, done: steps >= t.steps, open: taskOpen(loc, i, stepsOf) };
  });
  const current = tasks.find((x) => x.open && !x.done) ?? null;
  const sel = tasks.find((x) => x.t.id === pick) ?? current ?? tasks[tasks.length - 1];
  const icons = stopIcons(loc.id, loc.order, loc.tasks.length);
  const stops = STOPS.slice(0, loc.tasks.length);

  const step = async (x: (typeof tasks)[number]) => {
    if (busy === "task") return;
    if (energy < x.t.energy) {
      haptic.err();
      toast(`Не хватает энергии: нужно ${x.t.energy} ⚡`, "err");
      return;
    }
    haptic.tap();
    const res = await act<{ steps: number; need: number; step: Granted; done: Granted | null; locationComplete: boolean; stash: string | null }>("task", { taskId: x.t.id }, (y) =>
      y.stash ? null : y.done ? "Задание выполнено!" : null,
    );
    if (!res) return;
    const key = Date.now();
    setPops((p) => [...p.slice(-4), { key, i: x.i, text: `+${res.step.currencies.RUB ?? 0} ₽` }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.key !== key)), 1100);
    if (res.stash) {
      // a stash found: a moment of its own
      haptic.big();
      sfx("levelup");
      setStash(res.stash);
    }
    if (res.done) {
      // the next stop lights up: follow it
      sfx("win");
      setPick(null);
    }
    void load();
  };
  const claim = async () => {
    const res = await act<{ reward: Granted; first: boolean; opened: string | null }>("location_claim", { locationId: id });
    if (res) {
      haptic.ok();
      setGot(res);
      setPick(null);
      void load();
    }
  };
  const tapStop = (x: (typeof tasks)[number]) => {
    setPick(x.t.id);
    if (x.open && !x.done) return void step(x);
    haptic.tap();
    if (!x.open) toast(`Сначала выполни «${tasks[x.i - 1]?.t.title}»`, "err");
  };
  const chance = Math.round(stashChance(sel.t.energy) * 100);
  const left = meter ? Math.max(0, meter.pity - meter.energy) : null;

  return (
    <div className={LOCATION_ART.has(loc.scene) ? "loc-page has-bg" : "loc-page"}>
      {LOCATION_ART.has(loc.scene) && <div className="loc-page-bg" style={{ backgroundImage: `url(/assets/locations/${loc.scene}.webp)` }} aria-hidden="true" />}
      <div className="title">
        <Link href="/locations" className="back">← Локации</Link>
        <span className="chip gold"><Icon name="energy" size={16} />{energy}</span>
      </div>
      <div className="lp-head">
        <span className="tiny display">ЛОКАЦИЯ {loc.order}</span>
        <b className="display">{loc.name}</b>
        <Blocks done={r?.done ?? 0} total={loc.tasks.length} />
      </div>
      {r && !r.unlocked ? (
        <Empty>Локация закрыта. Сначала пройди предыдущую.</Empty>
      ) : (
        <>
          {/* what closing the location gives — on top */}
          <div className={`lp-prize ${allDone ? "ready" : ""}`}>
            <span className="lp-prize-h"><Icon name="chest" size={22} />{r?.clears ? "За повтор" : "За локацию"}</span>
            <RewardChips r={r?.nextReward ?? loc.reward} size={13} />
            {allDone && <button className="btn gold block lp-prize-go" disabled={busy === "location_claim"} onClick={claim}>Забрать награду</button>}
          </div>
          {meter && (
            <div className="lp-meter" title="Энергия, потраченная без находки">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/assets/items/${icons[0]}.webp`} alt="" draggable={false} />
              <span className="lp-meter-main">
                <span>Нычка: <b>{chance}%</b> за шаг · наверняка через <b className="num">{left}</b> ⚡</span>
                <i className="lp-meter-bar"><em style={{ width: `${(meter.energy / Math.max(1, meter.pity)) * 100}%` }} /></i>
              </span>
            </div>
          )}

          <div className="lp-map" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
            <svg className="lp-path" viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true">
              {stops.slice(1).map((b, k) => {
                const a = stops[k];
                const from = tasks[k];
                // the leg after a stop fills with that stop's steps; legs after done stops are full
                const fill = from.done ? 1 : from.open ? from.steps / from.t.steps : 0;
                const d = legPath(a, b);
                return (
                  <g key={k}>
                    <path d={d} className="lp-edge" />
                    <path d={d} className="lp-grey" />
                    <path d={d} className="lp-gold" pathLength={1} strokeDasharray={`${fill} 1`} />
                  </g>
                );
              })}
            </svg>
            {tasks.map((x) => {
              const p = stops[x.i];
              const cls = x.done ? "done" : x.open ? "open" : "shut";
              const now_ = current?.t.id === x.t.id;
              return (
                <button
                  key={x.t.id}
                  type="button"
                  className={`lp-stop ${cls} ${now_ ? "now" : ""} ${sel.t.id === x.t.id ? "sel" : ""} ${now_ && energy < x.t.energy ? "tired" : ""}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  onClick={() => tapStop(x)}
                  aria-label={x.t.title}
                >
                  <span className="lp-disc">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/assets/items/${icons[x.i]}.webp`} alt="" draggable={false} />
                  </span>
                  {x.done ? <i className="lp-tag ok">✓</i>
                    : x.open ? <i className="lp-tag num">{x.steps}/{x.t.steps}<em><Icon name="energy" size={11} />{x.t.energy}</em></i>
                    : <i className="lp-tag lock"><Icon name="lock" size={14} /></i>}
                  {pops.filter((q) => q.i === x.i).map((q) => <b key={q.key} className="lp-pop num">{q.text}</b>)}
                </button>
              );
            })}
          </div>

          <div className={`lp-card ${sel.done ? "done" : sel.open ? "" : "shut"}`} key={sel.t.id}>
            <span className="lp-card-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/assets/items/${icons[sel.i]}.webp`} alt="" draggable={false} />
            </span>
            <div className="grow col" style={{ gap: 4, minWidth: 0 }}>
              <span className="tiny muted display">ЗАДАНИЕ {sel.i + 1}/{loc.tasks.length}{sel.open && !sel.done ? <> · шаг <Icon name="energy" size={11} />{sel.t.energy}</> : null}</span>
              <b>{sel.t.title}</b>
              <span className="tiny muted">
                {sel.done ? "Выполнено" : !sel.open ? `Откроется после «${tasks[sel.i - 1]?.t.title}»` : current?.t.id === sel.t.id ? "Жми на светящийся кружок — каждый шаг тратит энергию" : sel.t.flavor}
              </span>
              <Bar value={sel.steps} max={sel.t.steps} tone={sel.done ? "green" : "gold"} label={`${sel.steps}/${sel.t.steps}`} />
              <span className="row" style={{ gap: 6, flexWrap: "wrap" }}><small className="tiny muted">за шаг</small><RewardChips r={sel.t.stepReward} size={13} /></span>
            </div>
          </div>
          {energy < Math.min(...loc.tasks.map((t) => t.energy)) && (
            <p className="small muted center">Энергия кончилась: +1 каждые 5 минут, или <Link href="/shop?tab=energy" style={{ color: "var(--gold)" }}>купи энергию</Link>.</p>
          )}
        </>
      )}
      {got && <ClaimedModal got={got} onClose={() => setGot(null)} />}
      {stash && <StashFound id={stash} onClose={() => setStash(null)} />}
    </div>
  );
}
