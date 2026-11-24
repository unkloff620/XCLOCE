"use client";
import Link from "next/link";
import { usePageReady } from "../route-loader.tsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { liveEnergy, useGame, useNow } from "../store.tsx";
import { api, type Granted } from "../api.ts";
import { LOCATIONS, locationById, taskOpen, tasksOf, type LocMode } from "../../content/locations.ts";
import type { Reward } from "../../content/rewards.ts";
import { LOCATION_ART } from "../art/scenes.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { Avatar, Empty, Modal, RewardChips } from "../ui.tsx";
import { clock, full } from "../format.ts";
import { haptic } from "../telegram.ts";
import { Help } from "../help.tsx";
import { LocTabs } from "./masters.tsx";
import { sfx } from "../sound.ts";
import { itemById } from "../../content/items.ts";
import { STASH_CHANCE, STASH_PITY, STASH_SETS, stashSetOf, stashSetsByLocation } from "../../content/stashes.ts";

/**
 * A stash found during a task: it flies out of the tapped stop, glows and fades (like an achievement, but right at the
 * task) — no window, the road stays playable. Its set and how many of the set are found under the picture.
 */
function StashPop({ id }: { id: string }) {
  const { state } = useGame();
  const d = itemById(id);
  const set = stashSetOf(id);
  const have = set ? set.items.filter((i) => (state?.inventory ?? []).some((x) => x.id === i.id && x.qty > 0)).length : 0;
  return (
    <span className="lp-stash" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/assets/items/${id}.webp`} alt="" draggable={false} />
      <b>Нычка!</b>
      <small>{d?.name}{set ? ` · ${have}/4` : ""}</small>
    </span>
  );
}

interface LocLeader { id: number; name: string; photo: string | null; rep: number; clan?: string | null }
interface LocRow {
  id: string; unlocked: boolean; done: number; total: number; clears: number; tasks: { id: string; steps: number; need: number }[]; nextReward: Reward;
  /** my authority in this location, and who has the most here */
  rep: number; leader: LocLeader | null;
  /** the night road: its own tasks, clears and ночной авторитет */
  night: { done: number; total: number; clears: number; tasks: { id: string; steps: number; need: number }[]; nextReward: Reward; rep: number; leader: LocLeader | null };
  business: LocBiz;
}
type BizKind = "xp" | "loc" | "pap";
interface LocBizLine { id: string; name: string; kind: BizKind; cells: number; perHour: number; nextPerHour: number | null; cost: number | null; max: number }
interface LocBiz {
  /** cells of a business */
  cells: number;
  lines: LocBizLine[];
  hours: number; hour: Record<BizKind, number>; pending: Record<BizKind, number>; full: boolean; nextAt: number | null;
  /** business opens once the day and the night roads are both cleared */
  open: boolean; dayDone: boolean; nightDone: boolean;
}
/** the profit's icon: авторитет игроку — the horns, авторитет локации — the crown, папиросы */
const BIZ_ICON: Record<BizKind, string> = { xp: "xp", loc: "rep", pap: "PAP" };
type LocTab = "day" | "night" | "biz";


/** «Бизнес» of one location: its businesses as cards on squared paper (the user's sample) — the picture, the profit an
 *  hour, the cells, the cells bought in a pencil circle, the button with the next cell's price; opens after the day and night roads */
function BizPanel({ b, onDone }: { b: LocBiz; onDone: () => void }) {
  const { act, busy, state } = useGame();
  const pap = state?.wallet?.PAP ?? 0;
  const up = async (x: LocBizLine) => {
    haptic.tap();
    const res = await act("business_up", { bizId: x.id }, () => `«${x.name}»: ${x.cells + 1}/${b.cells}`);
    if (res) { (x.cells + 1 >= b.cells ? haptic.big : haptic.ok)(); onDone(); }
  };
  if (!b.open) {
    return (
      <div className="biz">
        <div className="biz-line biz-shut">
          <span className="biz-h"><Icon name="lock" size={16} />Бизнес закрыт</span>
          <span className="small">Чтобы открыть бизнес в этой локации, пройди её <b>дневные</b> и <b>ночные</b> задания (каждые хотя бы раз).</span>
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className={`chip ${b.dayDone ? "green" : ""}`}>{b.dayDone ? "✓" : "✗"} Дневные</span>
            <span className={`chip ${b.nightDone ? "green" : ""}`}>{b.nightDone ? "✓" : "✗"} Ночные</span>
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="bzc-grid">
      {b.lines.map((x) => {
        const max = x.cost === null;
        const filled = x.cells;
        return (
          <div className={`bzc ${max ? "max" : ""}`} key={x.id}>
            <b className="bzc-name">{x.name}</b>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bzc-pic" src={`/assets/biz/${x.id}.webp`} alt="" draggable={false} />
            <span className="bzc-profit">Прибыль: +{full(x.perHour)} <Icon name={BIZ_ICON[x.kind]} size={18} /></span>
            <span className="bzc-cells" aria-label={`${filled}/${b.cells}`}>{Array.from({ length: b.cells }, (_, i) => <i key={i} className={i < filled ? "on" : ""} />)}</span>
            <span className="bzc-step">{max ? "Макс." : `${x.cells}/${b.cells}`}</span>
            {max ? <span className="btn gold sm bzc-go" aria-disabled="true">Макс. уровень</span> : (
              <button type="button" className="btn gold sm bzc-go" disabled={busy === "business_up" || pap < (x.cost ?? 0)} onClick={() => up(x)}>
                <span className="num">{full(x.cost ?? 0)}</span><Icon name="PAP" size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}


/** a leader on the list's plank: the avatar, the nickname, the zone's (day) or the night authority */
function LcLeader({ l, mode, me }: { l: LocLeader | null; mode: LocMode; me?: number }) {
  return (
    <span className={`lc-lead ${mode} ${l ? "" : "none"}`}>
      <span className="lc-box">
        <span className="lc-ava">{l ? <Avatar name={l.name} photo={l.photo} size={64} /> : <i className="lc-first">Стань<br />первым</i>}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lc-frame" src="/assets/ui/leader-frame.webp" alt="" draggable={false} />
      </span>
      <b className="lc-nick ellipsis">{l ? (l.id === me ? "Ты" : l.name) : null}</b>
      <span className="lc-rep num">{l ? <><Icon name="rep" size={14} />{full(l.rep)}</> : null}</span>
      {l?.clan ? <span className="lc-clan ellipsis">{l.clan}</span> : null}
    </span>
  );
}

/** «Бизнес» of all locations together: the artist's plank in a drawer at the screen's right edge — its tab «Бизнес» sticks
 *  out, a tap pulls it out: the profit piled up everywhere (папиросы, авторитет) and «Собрать» / «Нечего» with the time
 *  to the next part of it on the button */
function BizDrawer({ rows, onDone }: { rows: LocRow[]; onDone: () => void }) {
  const { act, busy } = useGame();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // a tap anywhere else slides it back
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);
  const live = rows.filter((x) => x.business.lines.some((l) => l.cells > 0));
  const sum = (k: BizKind) => live.reduce((a, x) => a + x.business.pending[k], 0);
  const pap = sum("pap"), xp = sum("xp"), loc = sum("loc");
  const next = live.map((x) => x.business.nextAt).filter((t): t is number => t !== null);
  const nextAt = next.length ? Math.min(...next) : null;
  const ready = pap + xp + loc > 0;
  const take = async () => {
    const res = await act<{ pap: number; xp: number; loc: number }>("business_claim", {}, (y) => `Прибыль: +${full(y.pap)} папирос · +${full(y.xp)} авторитета · +${full(y.loc)} авторитета локаций`);
    if (res) { haptic.big(); sfx("win"); onDone(); }
  };
  return (
    <div ref={box} className={`bz ${open ? "open" : ""}`}>
      <button type="button" className="bz-tab" onClick={() => { haptic.tap(); setOpen((o) => !o); }} aria-expanded={open}>Бизнес</button>
      <b className="bz-title display">Награды:</b>
      <span className="bz-rews">
        <span className="bz-rew num"><Icon name="PAP" size={28} />+{full(pap)}</span>
        <span className="bz-rew num"><Icon name="xp" size={24} />+{full(xp)}</span>
        <span className="bz-rew num"><Icon name="rep" size={24} />+{full(loc)}</span>
      </span>
      <button type="button" className="btn gold bz-go" disabled={!ready || busy === "business_claim"} onClick={take}>
        {ready ? "Собрать" : <>Нечего{nextAt ? <small className="num">{clock(Math.max(0, nextAt - now))}</small> : null}</>}
      </button>
    </div>
  );
}

interface StashMeter { energy: number; pity: number }

function useLocations() {
  const [rows, setRows] = useState<LocRow[] | null>(null);
  usePageReady(!!rows);
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

/** a location left finished (e.g. by an older version): taken as soon as its page opens (once per finish) */
function AutoClaim({ when, busy, onClaim }: { when: boolean; busy: boolean; onClaim: () => void }) {
  const done = useRef(false);
  useEffect(() => {
    if (!when) { done.current = false; return; }
    if (!done.current && !busy) { done.current = true; onClaim(); }
  }, [when, busy, onClaim]);
  return null;
}

function ClaimedModal({ got, onClose }: { got: ClaimResult; onClose: () => void }) {
  return (
    <Modal title="Локация пройдена!" onClose={onClose}>
      <div className="lc-done">
        <span className="lc-done-h display">Награда</span>
        <div className="lc-done-box">
          <RewardChips r={got.reward} size={30} />
          {got.stash && (
            <span className="stash-cell big stash-pop" style={{ width: 72 }} title={itemById(got.stash)?.name}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/assets/items/${got.stash}.webp`} alt="" /></span>
          )}
        </div>
        <button className="btn gold lc-done-ok" onClick={onClose}>Ок</button>
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
    <div className="loc-page paper locs-list">
      <div className="title">
        <Link href="/yard" className="back">← Двор</Link>
            <Help topic="locations" title="Локации">
              <p>Энергия тратится только здесь: каждый шаг задания стоит энергии и даёт папиросы и авторитет.</p>
              <p>Задания идут по очереди, как по карте: следующее открывается, когда выполнено предыдущее. Закрой все 5 заданий — на карточке появится кнопка «Забрать награду» (доллары и вещи), откроется следующая локация.</p>
              <p>Пройденную локацию можно проходить снова: награда каждый раз та же. Ночью — та же, только зубами вместо папирос.</p>
              <p><b>Авторитет локации</b>: каждый шаг задания даёт ещё и авторитет этой локации — треть от авторитета шага (50 → 17). Он копится только в своей локации и ни на что не тратится. У кого его больше всех, тот красуется на картинке локации с короной.</p>
              <p><b>Нычки</b> находятся за потраченную энергию: каждый шаг задания — шанс {Math.round(STASH_CHANCE * 100)}%. Не везёт — энергия копится в «нычкомере», и после {STASH_PITY} ⚡ без находки нычка выпадает наверняка. Чаще выпадают те, которых у тебя ещё нет. У каждой локации свои наборы по 4 нычки. Собери набор целиком и забери награду в достижениях «Нычки». Найденные лежат в инвентаре во вкладке «Нычки».</p>
              <p><b>Ночные</b> задания — своя дорожка с ночным авторитетом. <b>Бизнес</b> качается за папиросы в каждой локации и приносит папиросы и авторитет локации: каждый час капает 1/24 суточной прибыли. Прибыль со всех локаций забирается здесь, вверху списка, в любой момент; копится до 7 дней.</p>
              <p>Энергия: +1 каждые 5 минут до 50. Купить больше — нажми на энергию вверху.</p>
            </Help>
      </div>
      {/* the user's tabs: «Локации», «Мастера» and one more later */}
      <LocTabs on="l" />
      {rows && <BizDrawer rows={rows} onDone={() => void load()} />}
      <div className="lp-sheet">
        {/* the list scrolls in its own box: it disappears a bit under the sheet's top edge, not up at the tabs */}
        <div className="lp-list col" style={{ gap: 12 }}>
        {LOCATIONS.map((l) => {
          const r = rows?.find((x) => x.id === l.id);
          // the one to play now: the first open location not cleared yet
          const current = !!rows && rows.find((x) => x.unlocked && !x.clears)?.id === l.id;
          const cleared = !!r?.clears;
          const locked = r ? !r.unlocked : l.order > 1;
          const ready = !locked && !!r && r.done === r.total;
          // the artist's plank: the name on its tab, the picture on the left, the day and the night leader
          const plank = (
            <span className={`lc-plank ${locked ? "locked" : ""}`}>
              <b className="lc-name display">{locked ? "???" : l.short}</b>
              <span className="lc-pic">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/assets/locations/${LOCATION_ART.has(l.scene) ? l.scene : "openspace"}-card.webp`} alt="" draggable={false} />
                {locked && <Icon name="lock" size={34} />}
              </span>
              <LcLeader l={locked ? null : r?.leader ?? null} mode="day" me={state?.player.id} />
              <LcLeader l={locked ? null : r?.night.leader ?? null} mode="night" me={state?.player.id} />
            </span>
          );
          if (locked) return <div key={l.id} className="lc locked">{plank}</div>;
          if (ready) {
            return (
              <div key={l.id} className="lc ready">
                <Link href={`/locations/${l.id}`}>{plank}</Link>
                <div className="loc-claim">
                  <RewardChips r={r!.nextReward} size={14} />
                  <button className="btn gold" disabled={busy === "location_claim"} onClick={() => claim(l.id)}>
                    <Icon name="chest" size={20} /> Забрать награду
                  </button>
                </div>
              </div>
            );
          }
          return <Link key={l.id} href={`/locations/${l.id}`} className={`lc ${cleared ? "cleared" : ""} ${current ? "current" : ""}`}>{plank}</Link>;
        })}
        </div>
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
/** the drawn task maps (public/assets/locations/map/<id>.webp, 2:3, tools/locations/build-maps.py): where the stops stand on each */
const zig = (l: number, r: number, top = 42): { x: number; y: number }[] => [{ x: l, y: 88 }, { x: r, y: 70 }, { x: l - 2, y: 52 }, { x: r, y: 33 }, { x: top, y: 13 }];
const LOC_MAPS: Record<string, { stops: { x: number; y: number }[] }> = {
  openspace: { stops: zig(40, 57) }, market: { stops: zig(42, 54) }, serverroom: { stops: zig(40, 57) }, basement: { stops: zig(40, 57) },
  board: { stops: zig(48, 63, 50) }, accounting: { stops: zig(42, 56) }, hr: { stops: zig(40, 57) }, party: { stops: zig(40, 56) },
  offshore: { stops: zig(32, 46, 36) }, yacht: { stops: zig(40, 57) }, moonbase: { stops: zig(40, 57) }, mars: { stops: zig(40, 57) },
  orbit: { stops: zig(38, 50, 44) }, sunfarm: { stops: zig(42, 56) }, genesis: { stops: zig(40, 57, 47) },
};
const mapOf = (id: string) => {
  const m = LOC_MAPS[id];
  return m ? { w: 360, h: 540, stops: m.stops, img: `/assets/locations/map/${id}.webp` } : { w: MAP_W, h: MAP_H, stops: STOPS, img: null };
};

/** a stash picture for every task: the location's own stashes (locations without sets borrow from the whole pool);
 *  the night road takes other stashes, never the ones of the day road */
function stopIcons(locationId: string, order: number, n: number, mode: LocMode = "day"): string[] {
  const own = stashSetsByLocation(locationId).flatMap((s) => s.items.map((i) => i.id));
  const all = STASH_SETS.flatMap((s) => s.items.map((i) => i.id));
  const pool = own.length ? own : all;
  const offset = own.length ? 0 : order * 7;
  const stride = own.length ? 1 : 6;
  const day = Array.from({ length: n }, (_, i) => pool[(offset + i * stride) % pool.length]);
  if (mode === "day") return day;
  const rest = all.filter((id) => !day.includes(id));
  return Array.from({ length: n }, (_, i) => rest[(order * 11 + i * 5) % rest.length]);
}

/** the path between two stops: across, then up (like the drawn map) */
function legPath(a: { x: number; y: number }, b: { x: number; y: number }, W = MAP_W, H = MAP_H) {
  const ax = (a.x / 100) * W, ay = (a.y / 100) * H, bx = (b.x / 100) * W, by = (b.y / 100) * H;
  return `M${ax} ${ay} H${bx} V${by}`;
}

export function LocationScreen({ id }: { id: string }) {
  const loc = locationById(id);
  const { state, act, busy, toast } = useGame();
  const now = useNow();
  const { rows, load } = useLocations();
  const [got, setGot] = useState<ClaimResult | null>(null);
  // stashes found: they fly out of their stop for a moment
  const [stashes, setStashes] = useState<{ key: number; i: number; id: string }[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [tab, setTab] = useState<LocTab>("day");
  // "+36" (папиросы) flying up from the tapped stop
  const [pops, setPops] = useState<{ key: number; i: number; drops: { icon: string; n: number; dx: number; dy: number }[] }[]>([]);
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
  const icons = stopIcons(loc.id, loc.order, list.length, mode);
  const map = mapOf(loc.id);
  const stops = map.stops.slice(0, list.length);

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
    // the step's rewards: each flies up from the stop and falls somewhere near it, then fades (nothing to pick up)
    const got: { icon: string; n: number }[] = [
      ...Object.entries(res.step.currencies ?? {}).filter(([, v]) => (v ?? 0) > 0).map(([c, v]) => ({ icon: c, n: v as number })),
      ...(res.step.xp ? [{ icon: "xp", n: res.step.xp }] : []),
      ...(res.locRep ? [{ icon: "rep", n: res.locRep }] : []),
    ];
    const items = (res.step.items ?? []).filter((it) => it.qty > 0).map((it) => ({ icon: `item:${it.id}`, n: it.qty }));
    // they land around the stop, clear of its disc: on a ring 60…95 px out, spread evenly from a random start
    const all = [...got, ...items];
    const a0 = Math.random() * Math.PI * 2;
    const drops = all.map((g, k) => {
      const a = a0 + (k / all.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.6, r = 60 + Math.random() * 35;
      return { ...g, dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r * 0.8) };
    });
    setPops((p) => [...p.slice(-5), { key, i: x.i, drops }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.key !== key)), 2600);
    if (res.stash) {
      // a stash found: a moment of its own
      haptic.big();
      sfx("nychka");
      const k = key + 1, found = res.stash;
      setStashes((p) => [...p.slice(-2), { key: k, i: x.i, id: found }]);
      setTimeout(() => setStashes((p) => p.filter((q) => q.key !== k)), 2600);
    }
    if (res.done) {
      // the next stop lights up: follow it
      sfx("win");
      setPick(null);
    }
    // the last task done: once the list reloads, AutoClaim takes the location at once — «Локация пройдена!»
    void load();
  };
  async function claim() {
    const res = await act<{ reward: Granted; first: boolean; opened: string | null }>("location_claim", night ? { locationId: id, mode: "night" } : { locationId: id });
    if (res) {
      haptic.ok();
      setGot(res);
      setPick(null);
      void load();
    }
  }
  const tapStop = (x: (typeof tasks)[number]) => {
    setPick(x.t.id);
    if (x.open && !x.done) return void step(x);
    haptic.tap();
    if (!x.open) toast(`Сначала выполни «${tasks[x.i - 1]?.t.title}»`, "err");
  };

  return (
    <div className={`loc-page paper ${night ? "night" : ""} ${tab === "biz" ? "biz-mode" : ""}`}>
      <div className="title">
        <Link href="/locations" className="back">← Локации</Link>
        <span className="chip gold"><Icon name="energy" size={16} />{energy}</span>
      </div>
      {/* the user's tabs on the sheet's top edge: the chosen one in front of the sheet, the others grey behind it */}
      <div className="lp-tabs2" role="tablist">
        {([["day", "Дневные", "l"], ["night", "Ночные", "m"], ["biz", "Бизнес", "r"]] as const).map(([k, t, at]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`lp-tab2 at-${at} ${tab === k ? "on" : ""}`} onClick={() => { haptic.tap(); setTab(k); setPick(null); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/assets/locations/page/tab-${at}.webp`} alt="" draggable={false} />
            <b className="display">{t}</b>
          </button>
        ))}
      </div>
      <div className="lp-sheet">
      <div className="lp-head">
        <b className="display">{loc.name}</b>
        {tab !== "biz" && <Blocks done={r?.done ?? 0} total={list.length} />}
        <span className="lp-rep">
          <span title={night ? "Твой ночной авторитет в этой локации" : "Твой авторитет в этой локации"}><Icon name="rep" size={14} />{night ? "ночной авторитет" : "твой авторитет"} <b className="num">{full(r?.rep ?? 0)}</b></span>
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
        row ? <BizPanel b={row.business} onDone={() => void load()} /> : null
      ) : (
        <>
          <div className={`lp-map ${map.img ? "drawn" : ""}`} style={{ aspectRatio: `${map.w} / ${map.h}`, ...(map.img ? { backgroundImage: `url(${map.img})` } : {}) }}>
            <svg className="lp-path" viewBox={`0 0 ${map.w} ${map.h}`} aria-hidden="true">
              {stops.slice(1).map((b, k) => {
                const a = stops[k];
                const from = tasks[k];
                // the leg after a stop fills with that stop's steps; legs after done stops are full
                const fill = from.done ? 1 : from.open ? from.steps / from.t.steps : 0;
                const d = legPath(a, b, map.w, map.h);
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
                  <i className={`lp-name ${x.i === tasks.length - 1 ? "side" : "up"}`}>{x.t.title}</i>
                  <span className="lp-disc">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/assets/items/${icons[x.i]}.webp`} alt="" draggable={false} />
                  </span>
                  {x.done ? <i className="lp-tag ok">✓</i>
                    : x.open ? <i className="lp-tag num">{x.steps}/{x.t.steps}<em><Icon name="energy" size={11} />{x.t.energy}</em></i>
                    : <i className="lp-tag lock"><Icon name="lock" size={14} /></i>}
                  {pops.filter((q) => q.i === x.i).flatMap((q) => q.drops.map((d, k) => (
                    <b key={`${q.key}-${k}`} className="lp-drop num" style={{ ["--dx" as string]: `${d.dx}px`, ["--dy" as string]: `${d.dy}px`, animationDelay: `${k * 70}ms` }}>
                      {d.icon.startsWith("item:") ? <ItemArt id={d.icon.slice(5)} size={20} /> : <Icon name={d.icon} size={20} />}+{full(d.n)}
                    </b>
                  )))}
                  {stashes.filter((q) => q.i === x.i).map((q) => <StashPop key={q.key} id={q.id} />)}
                </button>
              );
            })}
          </div>

          {energy < Math.min(...list.map((t) => t.energy)) && (
            <p className="small muted center">Энергия кончилась: +1 каждые 5 минут, или <Link href="/shop?tab=energy" style={{ color: "var(--gold)", textShadow: "1px 0 0 #2e1c00, -1px 0 0 #2e1c00, 0 1px 0 #2e1c00, 0 -1px 0 #2e1c00" }}>купи энергию</Link>.</p>
          )}
        </>
      )}
      </div>
      {row?.unlocked && tab !== "biz" && <AutoClaim key={tab} when={allDone} busy={busy === "location_claim" || busy === "task"} onClaim={() => void claim()} />}
      {row?.unlocked && tab !== "biz" && <AutoClaim key={tab} when={allDone} busy={busy === "location_claim" || busy === "task"} onClaim={() => void claim()} />}
      {got && <ClaimedModal got={got} onClose={() => setGot(null)} />}
    </div>
  );
}
