"use client";
/*
 * «Захват» (бывшие «Ходки») (content/raids.ts): the clan takes the district's yards one after another.
 *  - RaidsScreen: the yards as case-file cards (‹ › or a swipe): the yard's photo on a paper clip, the wins to take it,
 *    what taking it gives; «Захватить» leads into the yard (only the first one is open until it is taken);
 *  - RaidYardScreen: the yard from above — its six buildings in rows and the main one (twice as big) at the top.
 *  - RaidAttackScreen: the fight for a building — the wall with its window, the board (the clan's wins, a win's reward),
 *    the HP and the weapons like in a boss fight.
 * The progress is the clan's (GET /api/raids); the fights are each player's own.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Tray } from "../api.ts";
import { Bar } from "../ui.tsx";
import { ItemArt } from "../art/items.tsx";
import { BossRig } from "../art/boss-rig.tsx";
import { Emblem } from "../art/emblems.tsx";
import { useFx } from "../fx/attack.tsx";
import { setMusicTrack, sfx, weaponSfx } from "../sound.ts";
import { MultPicker, TalentProgress, WeaponTray, type Mult } from "./boss.tsx";
import { WeaponShopWindow } from "./shop.tsx";
import { TalentWindow } from "./talents.tsx";
import { CritBurn, preloadCritBanner } from "../art/crit-burn.tsx";
import { GainLine, Modal } from "../ui.tsx";
import { BossPhoto } from "./boss-parts.tsx";
import { FIGHT_HOURS, type BossDef } from "../../content/bosses.ts";
import { RUSH_PRICE } from "../../content/items.ts";
import { clock } from "../format.ts";
import { usePageReady } from "../route-loader.tsx";
import { useGame, useNow } from "../store.tsx";
import { ART_VER } from "../preload.ts";
import { Icon } from "../art/icons.tsx";
import { haptic } from "../telegram.ts";
import { useRouter } from "next/navigation";
import { BUILDING_NAMES, RAID_YARDS, YARD_TREES, YARD_WALKERS, buildingReward, buildingTake, flagId, raidYardById, yardTotal, type BuildingKind, type RaidBuilding } from "../../content/raids.ts";
import { itemById } from "../../content/items.ts";

const A = "/assets/raids";

interface RaidsView {
  clanId: number | null;
  clan: { emblem: string; color: string } | null;
  yards: { id: string; open: boolean; taken: boolean; rest: number; times: number; target: string | null; buildings: { id: string; wins: number; need: number; taken: boolean }[];
    /** my clan's influence here; the clan with the most of it */
    influence: number; leader: { id: number; name: string; emblem: string; color: string; influence: number } | null }[];
  fight: { id: number; building: string; hp: number; hpMax: number; hits: number; endsAt: number | null } | null;
  /** my flags of the yards 1…5 */
  flags?: number[];
  weapons: Tray[];
}
/** the clan's progress (refreshed while the screen is open) */
function useRaids() {
  const [v, setV] = useState<RaidsView | null>(null);
  const load = useCallback(() => api.get<RaidsView>("/api/raids").then(setV).catch(() => {}), []);
  useEffect(() => { void load(); const t = window.setInterval(() => document.visibilityState === "visible" && load(), 15_000); return () => clearInterval(t); }, [load]);
  return { v, setV, load };
}

export function RaidsScreen() {
  const { v } = useRaids();
  usePageReady(!!v);
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  const y = RAID_YARDS[i];
  // the yards' cards turn like the pages of «Личное дело»: forward — the card flies off to the left and the next one
  // was lying under it; back — the card sinks and the previous one comes back from the left. A finger drags the card.
  const [anim, setAnim] = useState<"" | "out-l" | "out-r" | "in-l" | "in-r">("");
  const [drag, setDrag] = useState(0);
  const busy = useRef(false);
  const go = (d: number) => {
    if (busy.current) return;
    busy.current = true;
    haptic.tap(); sfx("page");
    setAnim(d > 0 ? "out-l" : "out-r");
    window.setTimeout(() => {
      setI((v) => (v + d + RAID_YARDS.length) % RAID_YARDS.length);
      setDrag(0);
      setAnim(d > 0 ? "in-r" : "in-l");
      window.setTimeout(() => { setAnim(""); busy.current = false; }, 280);
    }, 220);
  };
  const moving = drag ? { transform: `translateX(${drag}px) rotate(${drag * 0.015}deg)`, transition: "none" } : undefined;
  const yv = v?.yards.find((x) => x.id === y.id);
  const open = !!yv?.open;
  const taken = yv?.buildings.filter((b) => b.taken).length ?? 0;
  return (
    <div className="fit-page rd-page"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchMove={(e) => { const x0 = touch.current; if (x0 == null || busy.current) return; setDrag(e.touches[0].clientX - x0); }}
      onTouchEnd={(e) => { const x0 = touch.current; touch.current = null; if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); else setDrag(0); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rd-bg" src={`${A}/yard-bg.webp`} alt="" draggable={false} />
      {/* the bag of the yards: the bags of tattoo sets, opened for the flags (a page of its own) */}
      <Link href="/clans/raids/bags" className="rd-bagbtn" aria-label="Сумки за флаги" onClick={() => haptic.tap()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${A}/bag-all.webp`} alt="" draggable={false} />
        {(v?.flags ?? []).some((n) => n > 0) && <i className="rd-bagbtn-n">{(v?.flags ?? []).reduce((a, n) => a + n, 0)}</i>}
      </Link>
      <div className="title-row rd-title">
        <Link href={v?.clanId ? `/clans/${v.clanId}` : "/clans"} className="back-btn" aria-label="В клан">‹</Link>
        <b>Захват</b>
        <span className="rd-dots">{RAID_YARDS.map((x, k) => <i key={x.id} className={k === i ? "on" : ""} />)}</span>
      </div>
      <div className="rd-cardrow">
        <button type="button" className="rd-arrow" data-nosfx onClick={() => go(-1)} aria-label="Предыдущий двор">‹</button>
        <div className="rd-cardstack">
        {/* the next yards' cards lie under the open one */}
        {[2, 1].map((k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={k} className={`rd-under u${k}`} src={`${A}/card.webp`} alt="" draggable={false} aria-hidden="true" />
        ))}
        <div className={`rd-card ${anim}`} key={y.id} style={moving}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rd-card-paper" src={`${A}/card.webp`} alt="" draggable={false} />
          <div className="rd-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${A}/yard-bg.webp`} alt="" draggable={false} />
            <span className="rd-wins num">{yv?.taken ? "Двор наш" : `Захвачено ${taken}/${y.buildings.length}`}</span>
            {!!yv?.times && <span className="rd-times num">захвачен ×{yv.times}</span>}
            {!open && <span className="rd-lock"><Icon name="lock" size={34} /></span>}
          </div>
          {/* the coffee stain in the corner: the clan with the most influence in this yard */}
          {yv?.leader && (
            <span className="rd-leader" title={`Самые влиятельные: ${yv.leader.name} — ${yv.leader.influence.toLocaleString("ru-RU")}`}>
              <Emblem emblem={yv.leader.emblem} color={yv.leader.color} size={44} />
              <span className="rd-leader-n"><Icon name="influence" size={13} />{yv.leader.influence.toLocaleString("ru-RU")}</span>
            </span>
          )}
          <div className="rd-body">
            <span className="rd-kicker">двор №{y.n}</span>
            <b className="rd-name">{y.name}</b>
            <span className="rd-sub">{y.subtitle}</span>
            {v && !v.clanId ? <span className="rd-closed">Захват — для клана. Вступи в клан или создай свой</span>
              : open && yv?.rest ? <span className="rd-closed">Двор ваш. Снова захватить — через <RestLeft until={yv.rest} /></span>
              : open ? <Link href={`/clans/raids/${y.id}`} className="btn gold rd-go">Захватить</Link>
              : <span className="rd-closed">Сначала захвати двор «{RAID_YARDS[i - 1]?.name}»</span>}
            <span className="rd-h">Награды за захват двора</span>
            <YardRewards y={y} />
          </div>
        </div>
        </div>
        <button type="button" className="rd-arrow" data-nosfx onClick={() => go(1)} aria-label="Следующий двор">›</button>
      </div>
    </div>
  );
}

/** the rewards of a full capture of the yard (each building and the yard's bonus together): the yard's influence, the
 *  clan's experience, the flags — the icons and the numbers only */
function YardRewards({ y }: { y: (typeof RAID_YARDS)[number] }) {
  const t = yardTotal(y);
  const fmt = (n: number) => n.toLocaleString("ru-RU");
  return (
    <div className="rd-rewards">
      <span title="Влияние двора"><Icon name="influence" size={30} /><b className="num">+{fmt(t.influence)}</b></span>
      <span title="Опыт клана"><Icon name="clan-xp" size={30} /><b className="num">+{fmt(t.clanXp)}</b></span>
      <span title={`Флаги ${"★".repeat(y.n)}`}><ItemArt id={flagId(y.n)} size={30} /><b className="num">+{fmt(t.flags)}</b></span>
    </div>
  );
}

/** «1:24» to a time (ms), ticking */
/**
 * «Сумки за флаги» — a page of its own (the back alley behind the block): on the left, top down, how many flags of
 * each yard I have; in the middle, on the ground, the bag of one yard (its fabric and stars — the yard's flag's),
 * turned left and right with the arrows or a swipe; under it only the yard's name. Each bag holds a set of tattoos
 * and opens for its yard's flags (the sets are being drawn: no button yet).
 */
export function RaidBagsScreen() {
  const [v, setV] = useState<RaidsView | null>(null);
  useEffect(() => { api.get<RaidsView>("/api/raids").then(setV).catch(() => {}); }, []);
  usePageReady(!!v);
  const flags = v?.flags ?? [0, 0, 0, 0, 0];
  const [n, setN] = useState(0);
  const [anim, setAnim] = useState("");
  const touch = useRef<number | null>(null);
  const go = (d: number) => {
    haptic.tap(); sfx("page");
    setAnim(d > 0 ? "from-r" : "from-l");
    setN((x) => (x + d + 5) % 5);
  };
  return (
    <div className="fit-page rb-page"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const x0 = touch.current; touch.current = null; if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rb-bg" src={`${A}/bags-bg.webp`} alt="" draggable={false} />
      <div className="title-row rd-title">
        <Link href="/clans/raids" className="back-btn" aria-label="К дворам">‹</Link>
        <b>Сумки за флаги</b>
      </div>
      {/* my flags, top down: ★ … ★★★★★ */}
      <ul className="rb-flags">
        {flags.map((q, k) => (
          <li key={k} className={k === n ? "on" : ""}>
            <ItemArt id={flagId(k + 1)} size={34} />
            <b className="num">{q.toLocaleString("ru-RU")}</b>
          </li>
        ))}
      </ul>
      <div className="rb-shelf">
        <button type="button" className="rb-arrow" data-nosfx onClick={() => go(-1)} aria-label="Предыдущая сумка">◀</button>
        <div className="rb-bag">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={n} className={anim} src={`/assets/items/raid-bag-${n + 1}.webp?v=${ART_VER.items}`} alt="" draggable={false} />
          <b className="rb-name display">{RAID_YARDS[n].name}</b>
        </div>
        <button type="button" className="rb-arrow" data-nosfx onClick={() => go(1)} aria-label="Следующая сумка">▶</button>
      </div>
    </div>
  );
}

function FightTime({ endsAt }: { endsAt: number }) {
  const now = useNow();
  const left = Math.max(0, endsAt - now);
  return (
    <div className="arena-time">
      <Bar value={left} max={FIGHT_HOURS * 3600_000} tone="health" height={18} label={<><Icon name="clock" size={12} /> {clock(left)}</>} />
    </div>
  );
}

function RestLeft({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.ceil((until - now) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return <b className="num">{h ? `${h}:${String(m).padStart(2, "0")}` : m}:{String(sec).padStart(2, "0")}</b>;
}

/** a building on the yard's ground; the one to attack now glows, a taken one carries the clan's flag */
function Building({ b, target, taken, yard, clan, prog }: { b: RaidBuilding; target: boolean; taken: boolean; yard: string; clan: RaidsView["clan"]; prog?: { wins: number; need: number } }) {
  const router = useRouter();
  return (
    <button type="button" className={`rd-bld k-${b.kind} ${target ? "target" : ""} ${taken ? "taken" : ""}`} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, zIndex: Math.round(b.y * 10), ["--pic" as string]: `url(${A}/b-${b.kind}.webp)` }}
      onClick={() => { haptic.tap(); if (target) router.push(`/clans/raids/${yard}/${b.id}`); }} aria-label={BUILDING_NAMES[b.kind]}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${A}/b-${b.kind}.webp`} alt="" draggable={false} />
      {/* the one being taken: the clan's wins over it so far, small on its left */}
      {target && prog && <span className="rd-bld-count">{prog.wins}/{prog.need}</span>}
      {/* taken: the clan's logo over its top-left corner */}
      {taken && <span className="rd-bld-logo">{clan ? <Emblem emblem={clan.emblem} color={clan.color} size={34} /> : <ItemArt id={flagId(1)} size={24} />}</span>}
    </button>
  );
}

/** the yard's life: trees swaying (each at its own pace) and little people walking slowly back and forth */
function YardLife() {
  return (
    <>
      {YARD_TREES.map((t, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`t${i}`} className="rd-tree" src={`${A}/tree${t.n}.webp`} alt="" draggable={false}
          style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, zIndex: Math.round(t.y * 10), animationDuration: `${3.6 + i * 0.7}s`, animationDelay: `${-i * 1.3}s` }} />
      ))}
      {YARD_WALKERS.map((w, i) => (
        <span key={`w${i}`} className="rd-walker" aria-hidden="true"
          style={{ ["--x1" as string]: `${w.from[0]}%`, ["--y1" as string]: `${w.from[1]}%`, ["--x2" as string]: `${w.to[0]}%`, ["--y2" as string]: `${w.to[1]}%`,
            zIndex: Math.round(Math.max(w.from[1], w.to[1]) * 10), animationDuration: `${w.s * 2}s`, animationDelay: `${-i * 7}s` }}>
          <i style={{ animationDuration: `${w.s * 2}s`, animationDelay: `${-i * 7}s` }}>
            {/* the same picture three times: the body (above the hips), and each leg (its half below the hips) swinging
                the opposite way — steps without separate frames */}
            <b className="rd-w-body" style={{ backgroundImage: `url(${A}/man${w.n}.webp)` }} />
            <b className="rd-w-leg l" style={{ backgroundImage: `url(${A}/man${w.n}.webp)` }} />
            <b className="rd-w-leg r" style={{ backgroundImage: `url(${A}/man${w.n}.webp)` }} />
          </i>
        </span>
      ))}
    </>
  );
}

export function RaidYardScreen({ id }: { id: string }) {
  const { v } = useRaids();
  usePageReady(!!v);
  const { state } = useGame();
  const y = raidYardById(id);
  if (!y || !state) return null;
  const yv = v?.yards.find((x) => x.id === y.id);
  return (
    <div className="fit-page rd-page rd-yard">
      <div className="rd-scene">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rd-map-bg" src={`${A}/yard-ground2.webp`} alt="" draggable={false} />
        {/* the main one first in the markup: it stands behind (higher on the picture) */}
        <YardLife />
        {[...y.buildings].reverse().map((b) => <Building key={b.id} b={b} yard={y.id} clan={v?.clan ?? null} target={!!yv?.open && yv.target === b.id} taken={!!yv?.buildings.find((x) => x.id === b.id)?.taken} prog={yv?.buildings.find((x) => x.id === b.id)} />)}
      </div>
      <div className="title-row rd-title">
        <Link href="/clans/raids" className="back-btn" aria-label="К дворам">‹</Link>
        <b>Двор №{y.n} · {y.name}</b>
        <span className="rd-progress num">{yv?.buildings.filter((b) => b.taken).length ?? 0}/{y.buildings.length}</span>
      </div>
    </div>
  );
}

/** the defenders of the raid buildings (boss rigs of their own, src/client/art/boss-rig-data.ts): Гопник in the garages
 *  and the houses, Ларёчник in the kiosks and the boiler houses (the garage with the chimney); in the main building both
 *  of them together */
const GOPNIK = { id: "gopnik", name: "Гопник" }, LAREK = { id: "larek", name: "Ларёчник" };
const RAID_DEFENDERS: Record<BuildingKind, { id: string; name: string }[]> = {
  garage: [GOPNIK], barrack: [GOPNIK], khrush: [GOPNIK], shop: [GOPNIK], kiosk: [LAREK], boiler: [LAREK], main: [GOPNIK, LAREK],
};
const defendersOf = (kind: BuildingKind) => RAID_DEFENDERS[kind] ?? [GOPNIK];
/** the fight's room: Ларёчник fights inside his kiosk, the main building is the gang's hall, Гопник — in the basement */
const arenaOf = (kind: BuildingKind) => (kind === "main" ? "arena-main" : kind === "kiosk" || kind === "boiler" ? "arena-kiosk" : "arena-garage2");
/** the defenders' rigs: one in the middle, or two side by side (the main building) */
function Defenders({ kind, hpShare }: { kind: BuildingKind; hpShare?: number }) {
  const ds = defendersOf(kind);
  if (ds.length === 1) return <BossRig id={ds[0].id} hpShare={hpShare} />;
  return (
    <div className="rd-duo">
      {ds.map((d, i) => <div key={d.id} className={`rd-duo-${i}`}><BossRig id={d.id} hpShare={hpShare} /></div>)}
    </div>
  );
}
/** the defender as a boss for the win card (BossPhoto: his live rig knocked out, stars over the head) */
const defenderDef = (kind: BuildingKind) => {
  const d = defendersOf(kind)[0];
  return { id: d.id, name: d.name, photo: {}, theme: { accent: "#e6b65a", a: "#3a2614" } } as unknown as BossDef;
};

interface RaidHit { weapon: string; damage: number; crit: boolean; count: number; left: number | null; readyAt: number | null; status: "active" | "won"; hp: number; hpMax: number;
  talentDamage: number; talentsGained: number;
  reward?: Granted; buildingTaken?: boolean; yardTaken?: boolean; takeGot?: Granted | null; yardGot?: Granted | null; clanXp?: number; influence?: number }
type Granted = Parameters<typeof GainLine>[0]["r"];

/**
 * The attack on a building: a brick wall over the whole screen, the room behind its window (the defenders will stand
 * there, animated like the bosses, behind the bars), the board under the window — the clan's wins and what a win gives;
 * «Атаковать» starts my fight, then the HP and the weapons (like a boss fight).
 */
export function RaidAttackScreen({ yard, building }: { yard: string; building: string }) {
  const { v, setV, load } = useRaids();
  usePageReady(!!v);
  const { state, act, busy, toast } = useGame();
  const router = useRouter();
  const [mult, setMult] = useState<Mult>(1);
  // everything of a boss fight: the talents' counter, the crit banner, the weapons shelf, «ударить сейчас» for dollars
  const [talentDmg, setTalentDmg] = useState<number | null>(null);
  const [talentPop, setTalentPop] = useState(0);
  const [talentsOpen, setTalentsOpen] = useState(false);
  const [critPop, setCritPop] = useState(0);
  useEffect(() => preloadCritBanner(), []);
  const [shopOpen, setShopOpen] = useState(false);
  const [rushAsk, setRushAsk] = useState<{ id: string; name: string; left: number } | null>(null);
  const [fleeAsk, setFleeAsk] = useState(false);
  // the win: shown first, then «Во двор»
  const [won, setWon] = useState<RaidHit | null>(null);
  const [pops, setPops] = useState<{ id: number; text: string; crit: boolean }[]>([]);
  const [shake, setShake] = useState(0);
  // the defender flinches for a moment after each hit (the arena's "hit" / "ouch", like a boss)
  const [hitFx, setHitFx] = useState(false);
  // the weapon flies at him like at a boss; he flinches when it lands
  const { play, layer } = useFx(useCallback(() => {
    setHitFx(true);
    window.setTimeout(() => setHitFx(false), 420);
  }, []));
  // battle music while my fight for this building is on
  const fighting = !!(v?.fight && v.fight.building === building);
  useEffect(() => {
    if (!fighting) return;
    setMusicTrack("battle");
    return () => setMusicTrack("calm");
  }, [fighting]);
  // the fight's time is over: the server counts it lost — the screen goes back to the building
  const endsAt = v?.fight?.endsAt ?? null;
  useEffect(() => {
    if (!endsAt) return;
    const t = window.setTimeout(() => { void load(); }, Math.max(0, endsAt - Date.now()) + 1500);
    return () => window.clearTimeout(t);
  }, [endsAt, load]);
  const y = raidYardById(yard);
  const b = y?.buildings.find((x) => x.id === building);
  if (!y || !b) return null;
  const main = b.kind === "main";
  const r = buildingReward(y.n, b);
  const take = buildingTake(y.n, b);
  const prog = v?.yards.find((x) => x.id === y.id)?.buildings.find((x) => x.id === b.id);
  const fight = v?.fight && v.fight.building === b.id ? v.fight : null;
  const elsewhere = v?.fight && v.fight.building !== b.id ? v.fight : null;

  const start = async () => {
    haptic.tap();
    if (await act("raid_start", { building: b.id })) await load();
  };
  const hit = async (weapon: string, rush = false) => {
    if (!v || !fight) return;
    const w = itemById(weapon);
    // the sound and the flying weapon on the tap, like in a boss fight: heavier weapons sound heavier (10 dmg → 0, 500+ → 1)
    if (w?.weapon) {
      haptic.hit();
      weaponSfx(w.id, Math.min(1, Math.log10(Math.max(10, w.weapon.damage) / 10) / Math.log10(50)));
      play(weapon, w.weapon.damage, w.weapon.action, true);
    }
    const r2 = await act<RaidHit>("raid_attack", { weapon, count: w?.weapon?.kind === "consumable" ? mult : 1, ...(rush ? { rush: true } : {}) });
    if (!r2) { haptic.err(); sfx("error"); return; }
    if (r2.crit) { setCritPop(Date.now()); haptic.heavy(); sfx("crit"); }
    setShake((x) => x + 1);
    const id = Date.now() + Math.random();
    // the flying weapon shows the damage; a crit also flashes its real number
    if (r2.crit) {
      setPops((p) => [...p.slice(-4), { id, text: `−${r2.damage.toLocaleString("ru-RU")}`, crit: true }]);
      window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1100);
    }
    setTalentDmg(r2.talentDamage);
    if (r2.talentsGained > 0) {
      haptic.ok();
      sfx("coin");
      toast(<span className="gain-line"><span className="gain"><Icon name="talent" size={26} />+{r2.talentsGained}</span></span>, "ok");
      setTalentPop(Date.now());
    }
    if (r2.status === "won") {
      haptic.big();
      sfx("victory");
      // the fight stays on the screen under the win window; the yard is loaded when the window is closed
      setV({ ...v, fight: { ...fight, hp: 0 }, weapons: v.weapons.map((x) => (x.id === weapon ? { ...x, qty: r2.left ?? x.qty, readyAt: r2.readyAt ?? x.readyAt } : x)) });
      setWon(r2);
      return;
    }
    setV({ ...v, fight: { ...fight, hp: r2.hp }, weapons: v.weapons.map((x) => (x.id === weapon ? { ...x, qty: r2.left ?? x.qty, readyAt: r2.readyAt ?? x.readyAt } : x)) });
  };
  const flee = async () => {
    if (!fleeAsk) {
      setFleeAsk(true);
      window.setTimeout(() => setFleeAsk(false), 3000);
      return;
    }
    setFleeAsk(false);
    if (await act("raid_flee", {})) await load();
  };
  const closeShop = () => {
    setShopOpen(false);
    void load();
  };
  const toYard = async () => {
    setWon(null);
    await load();
    router.push(`/clans/raids/${y.id}`);
  };

  // the fight takes the whole screen like a boss fight: the building's room, the HP on top, the weapons at the bottom
  if (fight && v) {
    return (
      <div className="fit-page fight-page rd-fight">
        <div className="fight-bg" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={shake} className={shake ? "rd-hitbg" : ""} src={`${A}/${arenaOf(b.kind)}.webp`} alt="" draggable={false} />
        </div>
        <div className="fight-head">
          <Link href={`/clans/raids/${y.id}`} className="back-btn" aria-label="Во двор">‹</Link>
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="display boss-name ellipsis">{BUILDING_NAMES[b.kind]}</b>
          </div>
          <span className="chip red">побед клана: {prog?.wins ?? 0}/{prog?.need ?? "?"}</span>
        </div>
        <div className="arena full">
          <div className="arena-top">
            <Bar value={fight.hp} max={fight.hpMax} tone="health" height={24} label={`${fight.hp.toLocaleString("ru-RU")} / ${fight.hpMax.toLocaleString("ru-RU")}`} />
            {/* the fight's time, like a boss fight: the bar shortens as the 8 hours pass; over — the fight is lost */}
            {fight.endsAt && <FightTime endsAt={fight.endsAt} />}
          </div>
          {/* the building's defenders (RAID_DEFENDERS, tools/boss/assemble-*.py), down to the hips, boxing */}
          <div className={`arena-photo rd-defender-fight ${hitFx ? "hit ouch" : ""}`}>
            <Defenders kind={b.kind} hpShare={fight.hp / Math.max(1, fight.hpMax)} />
          </div>
          {layer}
          <div className="rd-pops">{pops.map((p) => <b key={p.id} className={`rd-pop ${p.crit ? "crit" : ""}`}>{p.text}{p.crit ? " КРИТ" : ""}</b>)}</div>
        </div>
        <div className="fight-bottom">
          {critPop > 0 && <CritBurn key={critPop} className="crit-burn" onDone={() => setCritPop(0)} />}
          <MultPicker mult={mult} setMult={setMult} />
          <div className="row fight-bar">
            <TalentProgress dmg={talentDmg ?? state?.player.talentDamage ?? 0} pop={talentPop} share={(1 - fight.hp / Math.max(1, fight.hpMax)) * 100} onOpen={() => setTalentsOpen(true)} />
            <span className="small rd-fight-r"><Icon name="xp" size={16} />+{r.xp.toLocaleString("ru-RU")} <Icon name="RUB" size={16} />+{r.rub.toLocaleString("ru-RU")}</span>
            <span className="grow" />
            <button className={`btn sm ${fleeAsk ? "red" : "dark"}`} onClick={flee} disabled={busy === "raid_flee" || !!won}>{fleeAsk ? "Точно?" : "Уйти"}</button>
          </div>
          <WeaponTray tray={v.weapons} mult={mult} disabled={busy === "raid_attack" || !!won} onHit={(id) => void hit(id)}
            onCooldown={(name, left, id) => { haptic.tap(); setRushAsk({ id, name, left }); }}
            onBuy={() => setShopOpen(true)} />
        </div>
        {shopOpen && <WeaponShopWindow onClose={closeShop} />}
        {rushAsk && (
          <Modal title={`${rushAsk.name} перезаряжается`} onClose={() => setRushAsk(null)}>
            <div className="col center" style={{ gap: 12 }}>
              <ItemArt id={rushAsk.id} size={72} />
              <span className="small center">Ещё {clock(rushAsk.left)}. Ударить сейчас за <b>{RUSH_PRICE.amount} $</b>? После удара — снова перезарядка.</span>
              <div className="row" style={{ gap: 8, width: "100%" }}>
                <button className="btn dark grow" onClick={() => setRushAsk(null)}>Отмена</button>
                <button className="btn gold grow" disabled={(state?.wallet.USD ?? 0) < RUSH_PRICE.amount}
                  onClick={() => { const id = rushAsk.id; setRushAsk(null); void hit(id, true); }}>
                  Ударить за {RUSH_PRICE.amount} $
                </button>
              </div>
              {(state?.wallet.USD ?? 0) < RUSH_PRICE.amount && <span className="tiny" style={{ color: "#ff8a9e" }}>Не хватает долларов</span>}
            </div>
          </Modal>
        )}
        {talentsOpen && <TalentWindow onClose={() => setTalentsOpen(false)} />}
        {/* the win: the same card as after a boss — the beaten defender with the stamp, the rewards, «Забрать» → the yard */}
        {won && (
          <Modal onClose={() => void toYard()}>
            <div className="result-win">
              <div className="result-photo">
                <BossPhoto boss={defenderDef(b.kind)} round defeated />
              </div>
              <div className="display result-name">{won.yardTaken ? "Двор захвачен!" : won.buildingTaken ? `${BUILDING_NAMES[b.kind]} ${["boiler", "khrush"].includes(b.kind) ? "захвачена" : "захвачен"}!` : defendersOf(b.kind).map((d) => d.name).join(" и ")}</div>
              <div className="muted small">
                {won.yardTaken ? `Клан взял весь двор «${y.name}»` : won.buildingTaken ? "Здание теперь ваше" : <>Побед клана: <b style={{ color: "var(--ink)" }}>{(prog?.wins ?? 0) + 1}/{prog?.need ?? "?"}</b></>}
              </div>
              <div className="result-gains">
                <GainLine r={won.reward} size={30} />
                {won.takeGot && <GainLine r={won.takeGot} size={30} />}
                {won.yardGot && <GainLine r={won.yardGot} size={30} />}
              </div>
              {!!won.clanXp && <div className="rd-clan-xp"><Icon name="clan-xp" size={22} />Опыт клана <b className="num">+{won.clanXp.toLocaleString("ru-RU")}</b></div>}
              {!!won.influence && <div className="rd-clan-xp"><Icon name="influence" size={22} />Влияние <b className="num">+{won.influence.toLocaleString("ru-RU")}</b></div>}
              <button className="btn gold big result-take" onClick={() => void toYard()}>Забрать</button>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="fit-page rd-page rd-attack">
      <div className="rd-scene">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={shake} className={`rd-room ${shake ? "hit" : ""}`} src={`${A}/attack-room.webp`} alt="" draggable={false} />
        {/* he waits behind the window */}
        <div className="rd-defender"><div className="rd-defender-in"><Defenders kind={b.kind} /></div></div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rd-map-bg rd-wall" src={`${A}/attack-wall.webp`} alt="" draggable={false} />
        <div className="rd-board">
          <b className="rd-board-t">{BUILDING_NAMES[b.kind]}</b>
          <span className="rd-board-w">Побед клана: <b className="num">{prog?.wins ?? 0}/{prog?.need ?? y.wins}</b>{prog?.taken ? " — захвачено" : ""}</span>
          <span className="rd-board-h">За каждую победу</span>
          <span className="rd-board-r">
            <span><Icon name="xp" size={26} /><b className="num">+{r.xp.toLocaleString("ru-RU")}</b></span>
            <span><Icon name="RUB" size={26} /><b className="num">+{r.rub.toLocaleString("ru-RU")}</b></span>
          </span>
        </div>
        {/* under the board: what a capture of the building gives */}
        <div className="rd-board-clan">За захват: <Icon name="clan-xp" size={20} /><b className="num">+{take.clanXp.toLocaleString("ru-RU")}</b> клану ·
          <Icon name="influence" size={20} /><b className="num">+{take.influence.toLocaleString("ru-RU")}</b> · <ItemArt id={flagId(y.n)} size={20} /><b className="num">×{take.flags}</b></div>
      </div>
      <div className="title-row rd-title">
        <Link href={`/clans/raids/${y.id}`} className="back-btn" aria-label="Во двор">‹</Link>
        <b>Двор №{y.n} · {BUILDING_NAMES[b.kind]}</b>
      </div>
      <div className="rd-attack-foot">
        {!v ? null : !v.clanId ? <span className="rd-attack-note">Захват — только для клана</span>
          : elsewhere ? <span className="rd-attack-note">Ты уже в бою за другое здание</span>
          : prog?.taken ? <span className="rd-attack-note">{v.yards.find((x) => x.id === y.id)?.rest ? "Двор ваш — снова захватить можно позже" : "Здание уже захвачено кланом"}</span>
          : <button type="button" className="btn gold block rd-attack-go" disabled={busy === "raid_start"} onClick={start}>Атаковать</button>}
      </div>
    </div>
  );
}
