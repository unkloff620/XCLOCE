"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { liveEnergy, useGame, useNow } from "../store.tsx";
import { api, type Granted } from "../api.ts";
import { BUSINESS_MAX_DAYS, LOCATIONS, locRep, locationById, taskOpen, tasksOf, type LocMode } from "../../content/locations.ts";
import type { Reward } from "../../content/rewards.ts";
import { LOCATION_ART, LocationScene } from "../art/scenes.tsx";
import { Icon } from "../art/icons.tsx";
import { Avatar, Bar, Empty, Modal, RewardChips } from "../ui.tsx";
import { clock, full } from "../format.ts";
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

interface LocLeader { id: number; name: string; photo: string | null; rep: number }
interface LocRow {
  id: string; unlocked: boolean; done: number; total: number; clears: number; tasks: { id: string; steps: number; need: number }[]; nextReward: Reward;
  /** my authority in this location, and who has the most here */
  rep: number; leader: LocLeader | null;
  /** the night road: its own tasks, clears and ночной авторитет */
  night: { done: number; total: number; clears: number; tasks: { id: string; steps: number; need: number }[]; nextReward: Reward; rep: number; leader: LocLeader | null };
  business: LocBiz;
}
interface LocBiz {
  cells: number; lvRep: number; lvRub: number; costRep: number | null; costRub: number | null;
  stepRep: number; stepRub: number; perRep: number; perRub: number;
  days: number; pendingRep: number; pendingRub: number; full: boolean; nextAt: number | null;
}
type LocTab = "day" | "night" | "biz";

/** night: lights blinking over the darkened picture (fixed spots, so nothing jumps between renders) */
const NIGHT_LIGHTS = Array.from({ length: 18 }, (_, i) => ({ x: (i * 37 + 11) % 97, y: (i * 53 + 7) % 88, d: 1.6 + ((i * 7) % 10) / 4, w: ((i * 13) % 20) / 10, s: 3 + (i % 4) * 2, c: i % 3 }));

/** «Бизнес»: two profit lines (authority, rubles), levels bought with rubles, profit taken once a day (piles up for a week) */
function BizPanel({ b, locId, onDone }: { b: LocBiz; locId: string; onDone: () => void }) {
  const { act, busy, state } = useGame();
  const now = useNow();
  const rub = state?.wallet?.RUB ?? 0;
  const up = async (line: "rep" | "rub") => {
    haptic.tap();
    const res = await act("business_up", { locationId: locId, line }, () => "Бизнес прокачан!");
    if (res) {
      haptic.ok();
      onDone();
    }
  };
  const take = async () => {
    const res = await act<{ days: number; rub: number; rep: number }>("business_claim", { locationId: locId });
    if (res) {
      haptic.big();
      sfx("win");
      onDone();
    }
  };
  const lines = [
    { line: "rep" as const, name: "авторитет", icon: <Icon name="map" size={16} />, lv: b.lvRep, cost: b.costRep, per: b.perRep, step: b.stepRep },
    { line: "rub" as const, name: "рубли", icon: <b className="biz-rub">₽</b>, lv: b.lvRub, cost: b.costRub, per: b.perRub, step: b.stepRub },
  ];
  const started = b.lvRep + b.lvRub > 0;
  const ready = b.days > 0 && (b.pendingRep > 0 || b.pendingRub > 0);
  return (
    <div className="biz">
      {lines.map((x) => (
        <div className="biz-line" key={x.line}>
          <span className="biz-h">Прибыль: {x.icon}{x.name}<small className="num">{x.per > 0 ? `+${full(x.per)} в сутки` : "нет"}</small></span>
          <span className="biz-cells" aria-label={`${x.lv}/${b.cells}`}>
            {Array.from({ length: b.cells }, (_, i) => <i key={i} className={i < x.lv ? "on" : ""} />)}
          </span>
          {x.cost !== null ? (
            <button className="btn gold biz-up" disabled={busy === "business_up" || rub < x.cost} onClick={() => up(x.line)}>
              Прокачать <span className="num">{full(x.cost)} ₽</span><small>+{full(x.step)} в сутки</small>
            </button>
          ) : (
            <span className="biz-max display">МАКСИМУМ</span>
          )}
        </div>
      ))}
      <div className={`biz-take ${ready ? "ready" : ""}`}>
        {!started ? (
          <span className="small">Прокачай бизнес — прибыль пойдёт каждые сутки, даже когда ты не в игре.</span>
        ) : (
          <>
            <span className="biz-take-h">Накопилось за <b className="num">{b.days}/{BUSINESS_MAX_DAYS}</b> дн.</span>
            <span className="biz-take-sum num">
              {b.pendingRep > 0 && <span><Icon name="map" size={15} />+{full(b.pendingRep)}</span>}
              {b.pendingRub > 0 && <span>+{full(b.pendingRub)} ₽</span>}
              {!ready && <span className="muted">пока пусто</span>}
            </span>
            <button className="btn gold block" disabled={!ready || busy === "business_claim"} onClick={take}>Забрать прибыль</button>
            <span className="tiny biz-note">
              {b.full ? "Копилка полна: больше 7 дней не копится — забери!" : b.nextAt ? `Следующие сутки через ${clock(Math.max(0, b.nextAt - now))}` : ""}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** авторитет локации: a chip of its own (it piles up in the location only) */
function LocRepChip({ v, size = 14 }: { v: number; size?: number }) {
  return <span className="chip loc-rep" title="Авторитет локации"><Icon name="map" size={size} />+{full(v)}</span>;
}

/** the leader of a location over its picture: avatar with a crown, name and authority there */
function LocLeaderBadge({ l, me }: { l: LocLeader; me: boolean }) {
  return (
    <span className={`loc-lead ${me ? "me" : ""}`} title={`Больше всех авторитета в локации: ${l.name}`}>
      <span className="loc-lead-ava">
        <Avatar name={l.name} photo={l.photo} size={44} />
        <i className="loc-lead-crown" aria-hidden="true">👑</i>
      </span>
      <span className="loc-lead-txt">
        <b className="ellipsis">{me ? "Ты" : l.name}</b>
        <small className="num"><Icon name="map" size={11} />{full(l.rep)}</small>
      </span>
    </span>
  );
}

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
  const { state, act, busy } = useGame();
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
              <p><b>Авторитет локации</b>: каждый шаг задания даёт ещё и авторитет этой локации — треть от авторитета шага (50 → 17). Он копится только в своей локации и ни на что не тратится. У кого его больше всех, тот красуется на картинке локации с короной.</p>
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
              {!locked && r?.leader && <LocLeaderBadge l={r.leader} me={r.leader.id === state?.player.id} />}
              <div className="loc-body">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="tiny muted display">ЛОКАЦИЯ {l.order}</span>
                  {cleared && <span className="chip green">✓ пройдена{r!.clears > 1 ? ` ×${r!.clears}` : ""}</span>}
                  {current && <span className="chip gold loc-now">сейчас здесь</span>}
                </div>
                <b className="display" style={{ fontSize: 18 }}>{locked ? "???" : l.name}</b>
                <div className="small muted">{locked ? `Закрой «${LOCATIONS[l.order - 2]?.name}»` : l.subtitle}</div>
                {!locked && (
                  <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                    <Blocks done={r?.done ?? 0} total={l.tasks.length} />
                    <span className="loc-myrep" title="Твой авторитет в этой локации"><Icon name="map" size={14} /><b className="num">{full(r?.rep ?? 0)}</b></span>
                  </div>
                )}
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
  const [tab, setTab] = useState<LocTab>("day");
  // "+36 ₽" flying up from the tapped stop
  const [pops, setPops] = useState<{ key: number; i: number; text: string; rep: number }[]>([]);
  if (!loc) return <Empty>Такой локации нет</Empty>;
  const row = rows?.find((x) => x.id === id);
  const mode: LocMode = tab === "night" ? "night" : "day";
  const night = mode === "night";
  // the road shown: the day one (the row itself) or the night one
  const r = row && (night ? row.night : row);
  const list = tasksOf(loc, mode);
  const energy = state ? liveEnergy(state, now).energy : 0;
  const allDone = !!r && r.done === r.total;
  const stepsOf = (taskId: string) => r?.tasks.find((x) => x.id === taskId)?.steps ?? 0;
  const tasks = list.map((t, i) => {
    const steps = stepsOf(t.id);
    return { t, i, steps, done: steps >= t.steps, open: taskOpen(loc, i, stepsOf, mode) };
  });
  const current = tasks.find((x) => x.open && !x.done) ?? null;
  const sel = tasks.find((x) => x.t.id === pick) ?? current ?? tasks[tasks.length - 1];
  const icons = stopIcons(loc.id, loc.order, list.length);
  const stops = STOPS.slice(0, list.length);

  const step = async (x: (typeof tasks)[number]) => {
    if (busy === "task") return;
    if (energy < x.t.energy) {
      haptic.err();
      toast(`Не хватает энергии: нужно ${x.t.energy} ⚡`, "err");
      return;
    }
    haptic.tap();
    const res = await act<{ steps: number; need: number; step: Granted; done: Granted | null; locationComplete: boolean; stash: string | null; locRep?: number }>("task", { taskId: x.t.id }, (y) =>
      y.stash ? null : y.done ? "Задание выполнено!" : null,
    );
    if (!res) return;
    const key = Date.now();
    setPops((p) => [...p.slice(-4), { key, i: x.i, text: `+${res.step.currencies.RUB ?? 0} ₽`, rep: res.locRep ?? 0 }]);
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
    const res = await act<{ reward: Granted; first: boolean; opened: string | null }>("location_claim", night ? { locationId: id, mode: "night" } : { locationId: id });
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
    <div className={`loc-page ${LOCATION_ART.has(loc.scene) ? "has-bg" : ""} ${night ? "night" : ""} ${tab === "biz" ? "biz-mode" : ""}`}>
      {LOCATION_ART.has(loc.scene) && <div className="loc-page-bg" style={{ backgroundImage: `url(/assets/locations/${loc.scene}.webp)` }} aria-hidden="true" />}
      {night && (
        <div className="loc-night-sky" aria-hidden="true">
          {NIGHT_LIGHTS.map((l, i) => <i key={i} className={`c${l.c}`} style={{ left: `${l.x}%`, top: `${l.y}%`, width: l.s, height: l.s, animationDuration: `${l.d}s`, animationDelay: `${l.w}s` }} />)}
        </div>
      )}
      <div className="title">
        <Link href="/locations" className="back">← Локации</Link>
        <span className="chip gold"><Icon name="energy" size={16} />{energy}</span>
      </div>
      <div className="lp-tabs" role="tablist">
        {([["day", "☀️ Дневные"], ["night", "🌙 Ночные"], ["biz", "💼 Бизнес"]] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`lp-tab ${k} ${tab === k ? "on" : ""}`} onClick={() => { haptic.tap(); setTab(k); setPick(null); }}>{t}</button>
        ))}
      </div>
      <div className="lp-head">
        <span className="tiny display">ЛОКАЦИЯ {loc.order}</span>
        <b className="display">{loc.name}</b>
        {tab !== "biz" && <Blocks done={r?.done ?? 0} total={list.length} />}
        <span className="lp-rep">
          <span title={night ? "Твой ночной авторитет в этой локации" : "Твой авторитет в этой локации"}><Icon name="map" size={14} />{night ? "ночной авторитет" : "твой авторитет"} <b className="num">{full(r?.rep ?? 0)}</b></span>
          {r?.leader && (
            <span className="lp-rep-lead" title="Больше всех авторитета здесь">
              👑 <Avatar name={r.leader.name} photo={r.leader.photo} size={18} /><i className="ellipsis">{r.leader.id === state?.player.id ? "ты" : r.leader.name}</i> <b className="num">{full(r.leader.rep)}</b>
            </span>
          )}
        </span>
      </div>
      {row && !row.unlocked ? (
        <Empty>Локация закрыта. Сначала пройди предыдущую.</Empty>
      ) : tab === "biz" ? (
        row ? <BizPanel b={row.business} locId={loc.id} onDone={() => void load()} /> : null
      ) : (
        <>
          {/* what closing the location gives — on top */}
          <div className={`lp-prize ${allDone ? "ready" : ""}`}>
            <span className="lp-prize-h"><Icon name="chest" size={22} />{night ? "За ночь" : r?.clears ? "За повтор" : "За локацию"}</span>
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
                  {pops.filter((q) => q.i === x.i).map((q) => <b key={q.key} className="lp-pop num">{q.text}{q.rep > 0 && <em><Icon name="map" size={14} />+{q.rep}</em>}</b>)}
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
              <span className="tiny muted display lp-card-k">{night ? "НОЧНОЕ " : ""}ЗАДАНИЕ {sel.i + 1}/{list.length}{sel.open && !sel.done ? <> · шаг <Icon name="energy" size={12} />{sel.t.energy}</> : null}</span>
              <b>{sel.t.title}</b>
              <span className="tiny muted">
                {sel.done ? "Выполнено" : !sel.open ? `Откроется после «${tasks[sel.i - 1]?.t.title}»` : current?.t.id === sel.t.id ? "Жми на светящийся кружок — каждый шаг тратит энергию" : sel.t.flavor}
              </span>
              <Bar value={sel.steps} max={sel.t.steps} tone={sel.done ? "green" : night ? "violet" : "gold"} label={`${sel.steps}/${sel.t.steps}`} />
              <span className="row" style={{ gap: 6, flexWrap: "wrap" }}><small className="tiny muted">за шаг</small><RewardChips r={sel.t.stepReward} size={13} /><LocRepChip v={locRep(sel.t.stepReward.xp ?? 0)} size={13} /></span>
            </div>
          </div>
          {energy < Math.min(...list.map((t) => t.energy)) && (
            <p className="small muted center">Энергия кончилась: +1 каждые 5 минут, или <Link href="/shop?tab=energy" style={{ color: "var(--gold)" }}>купи энергию</Link>.</p>
          )}
        </>
      )}
      {got && <ClaimedModal got={got} onClose={() => setGot(null)} />}
      {stash && <StashFound id={stash} onClose={() => setStash(null)} />}
    </div>
  );
}
