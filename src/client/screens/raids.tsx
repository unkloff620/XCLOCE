"use client";
/*
 * «Ходки» (content/raids.ts): the clan takes the district's yards one after another.
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
import { MultPicker, WeaponTray, type Mult } from "./boss.tsx";
import { usePageReady } from "../route-loader.tsx";
import { useGame } from "../store.tsx";
import { Icon } from "../art/icons.tsx";
import { haptic } from "../telegram.ts";
import { useRouter } from "next/navigation";
import { BUILDING_NAMES, RAID_YARDS, YARD_TREES, YARD_WALKERS, buildingReward, flagId, raidYardById, type RaidBuilding } from "../../content/raids.ts";
import { itemById } from "../../content/items.ts";

const A = "/assets/raids";

interface RaidsView {
  clanId: number | null;
  yards: { id: string; open: boolean; taken: boolean; target: string | null; buildings: { id: string; wins: number; need: number; taken: boolean }[] }[];
  fight: { id: number; building: string; hp: number; hpMax: number; hits: number } | null;
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
  const go = (d: number) => { setI((v) => (v + d + RAID_YARDS.length) % RAID_YARDS.length); haptic.tap(); };
  const yv = v?.yards.find((x) => x.id === y.id);
  const open = !!yv?.open;
  const taken = yv?.buildings.filter((b) => b.taken).length ?? 0;
  return (
    <div className="fit-page rd-page"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const x0 = touch.current; touch.current = null; if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rd-bg" src={`${A}/yard-bg.webp`} alt="" draggable={false} />
      <div className="title-row rd-title">
        <Link href="/clans" className="back-btn" aria-label="К кланам">‹</Link>
        <b>Ходки</b>
        <span className="rd-dots">{RAID_YARDS.map((x, k) => <i key={x.id} className={k === i ? "on" : ""} />)}</span>
      </div>
      <div className="rd-cardrow">
        <button type="button" className="rd-arrow" onClick={() => go(-1)} aria-label="Предыдущий двор">‹</button>
        <div className="rd-card" key={y.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rd-card-paper" src={`${A}/card.webp`} alt="" draggable={false} />
          <div className="rd-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${A}/yard-bg.webp`} alt="" draggable={false} />
            <span className="rd-wins num">{yv?.taken ? "Двор наш" : `Захвачено ${taken}/${y.buildings.length}`}</span>
            {!open && <span className="rd-lock"><Icon name="lock" size={34} /></span>}
          </div>
          <div className="rd-body">
            <span className="rd-kicker">двор №{y.n}</span>
            <b className="rd-name">{y.name}</b>
            <span className="rd-sub">{y.subtitle}</span>
            {v && !v.clanId ? <span className="rd-closed">Ходки — для клана. Вступи в клан или создай свой</span>
              : open ? <Link href={`/clans/raids/${y.id}`} className="btn gold rd-go">{yv?.taken ? "Во двор" : "Захватить"}</Link>
              : <span className="rd-closed">Сначала захвати двор «{RAID_YARDS[i - 1]?.name}»</span>}
            <span className="rd-h">Награды за захват двора</span>
            <div className="rd-rewards">
              <span><Icon name="ach-clan" size={26} />опыт клана</span>
              <span><Icon name="xp" size={26} />авторитет</span>
              <span><ItemArt id={flagId(y.n)} size={26} />флаг {"★".repeat(y.n)}</span>
            </div>
          </div>
        </div>
        <button type="button" className="rd-arrow" onClick={() => go(1)} aria-label="Следующий двор">›</button>
      </div>
    </div>
  );
}

/** a building on the yard's ground; the one to attack now glows, a taken one carries the clan's flag */
function Building({ b, target, taken, yard }: { b: RaidBuilding; target: boolean; taken: boolean; yard: string }) {
  const router = useRouter();
  return (
    <button type="button" className={`rd-bld k-${b.kind} ${target ? "target" : ""} ${taken ? "taken" : ""}`} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, zIndex: Math.round(b.y * 10) }}
      onClick={() => { haptic.tap(); if (target) router.push(`/clans/raids/${yard}/${b.id}`); }} aria-label={BUILDING_NAMES[b.kind]}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${A}/b-${b.kind}.webp`} alt="" draggable={false} />
      {taken && <span className="rd-bld-flag"><ItemArt id={flagId(1)} size={24} /></span>}
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
        {[...y.buildings].reverse().map((b) => <Building key={b.id} b={b} yard={y.id} target={!!yv?.open && yv.target === b.id} taken={!!yv?.buildings.find((x) => x.id === b.id)?.taken} />)}
      </div>
      <div className="title-row rd-title">
        <Link href="/clans/raids" className="back-btn" aria-label="К дворам">‹</Link>
        <b>Двор №{y.n} · {y.name}</b>
        <span className="rd-progress num">{yv?.buildings.filter((b) => b.taken).length ?? 0}/{y.buildings.length}</span>
      </div>
    </div>
  );
}

interface RaidHit { weapon: string; damage: number; crit: boolean; count: number; left: number | null; readyAt: number | null; status: "active" | "won"; hp: number; hpMax: number;
  reward?: { xp?: number; currencies?: Record<string, number> }; buildingTaken?: boolean; yardTaken?: boolean }

/**
 * The attack on a building: a brick wall over the whole screen, the room behind its window (the defenders will stand
 * there, animated like the bosses, behind the bars), the board under the window — the clan's wins and what a win gives;
 * «Атаковать» starts my fight, then the HP and the weapons (like a boss fight).
 */
export function RaidAttackScreen({ yard, building }: { yard: string; building: string }) {
  const { v, setV, load } = useRaids();
  usePageReady(!!v);
  const { act, busy, toast } = useGame();
  const router = useRouter();
  const [mult, setMult] = useState<Mult>(1);
  const [pops, setPops] = useState<{ id: number; text: string; crit: boolean }[]>([]);
  const [shake, setShake] = useState(0);
  const y = raidYardById(yard);
  const b = y?.buildings.find((x) => x.id === building);
  if (!y || !b) return null;
  const main = b.kind === "main";
  const r = buildingReward(y.n, main);
  const prog = v?.yards.find((x) => x.id === y.id)?.buildings.find((x) => x.id === b.id);
  const fight = v?.fight && v.fight.building === b.id ? v.fight : null;
  const elsewhere = v?.fight && v.fight.building !== b.id ? v.fight : null;

  const start = async () => {
    haptic.tap();
    if (await act("raid_start", { building: b.id })) await load();
  };
  const hit = async (weapon: string) => {
    if (!v || !fight) return;
    const w = itemById(weapon);
    const r2 = await act<RaidHit>("raid_attack", { weapon, count: w?.weapon?.kind === "consumable" ? mult : 1 });
    if (!r2) return;
    haptic.tap();
    setShake((x) => x + 1);
    const id = Date.now() + Math.random();
    setPops((p) => [...p.slice(-4), { id, text: `−${r2.damage.toLocaleString("ru-RU")}`, crit: r2.crit }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1100);
    setV({ ...v, fight: r2.status === "won" ? null : { ...fight, hp: r2.hp }, weapons: v.weapons.map((x) => (x.id === weapon ? { ...x, qty: r2.left ?? x.qty, readyAt: r2.readyAt ?? x.readyAt } : x)) });
    if (r2.status === "won") {
      haptic.big();
      toast(r2.yardTaken ? "Двор захвачен! Флаг — в инвентаре" : r2.buildingTaken ? `${BUILDING_NAMES[b.kind]} захвачен кланом!` : `Победа! +${(r2.reward?.xp ?? 0).toLocaleString("ru-RU")} авторитета, +${(r2.reward?.currencies?.RUB ?? 0).toLocaleString("ru-RU")} ₽`);
      await load();
      if (r2.buildingTaken) router.push(`/clans/raids/${y.id}`);
    }
  };
  const flee = async () => { if (await act("raid_flee", {})) await load(); };

  // the fight takes the whole screen like a boss fight: the building's room, the HP on top, the weapons at the bottom
  if (fight && v) {
    return (
      <div className="fit-page fight-page rd-fight">
        <div className="fight-bg" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={shake} className={shake ? "rd-hitbg" : ""} src={`${A}/arena-garage.webp`} alt="" draggable={false} />
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
            <Bar value={fight.hp} max={fight.hpMax} tone="red" height={24} label={`${fight.hp.toLocaleString("ru-RU")} / ${fight.hpMax.toLocaleString("ru-RU")}`} />
          </div>
          <div className="rd-pops">{pops.map((p) => <b key={p.id} className={`rd-pop ${p.crit ? "crit" : ""}`}>{p.text}{p.crit ? " КРИТ" : ""}</b>)}</div>
        </div>
        <div className="fight-bottom">
          <MultPicker mult={mult} setMult={setMult} />
          <div className="row fight-bar">
            <span className="small rd-fight-r"><Icon name="xp" size={16} />+{r.xp.toLocaleString("ru-RU")} <Icon name="RUB" size={16} />+{r.rub.toLocaleString("ru-RU")} за победу</span>
            <span className="grow" />
            <button className="btn sm dark" onClick={flee} disabled={busy === "raid_flee"}>Уйти</button>
          </div>
          <WeaponTray tray={v.weapons} mult={mult} disabled={busy === "raid_attack"} onHit={hit}
            onCooldown={(name, left) => toast(`${name} перезаряжается: ещё ${Math.ceil(left / 60_000)} мин`)}
            onBuy={() => toast("Оружие — в магазине")} />
        </div>
      </div>
    );
  }

  return (
    <div className="fit-page rd-page rd-attack">
      <div className="rd-scene">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={shake} className={`rd-room ${shake ? "hit" : ""}`} src={`${A}/attack-room.webp`} alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rd-map-bg rd-wall" src={`${A}/attack-wall.webp`} alt="" draggable={false} />
        <div className="rd-board">
          <b className="rd-board-t">{BUILDING_NAMES[b.kind]}</b>
          <span className="rd-board-w">Побед клана: <b className="num">{prog?.wins ?? 0}/{prog?.need ?? y.wins * (main ? 2 : 1)}</b>{prog?.taken ? " — захвачено" : ""}</span>
          <span className="rd-board-h">За каждую победу</span>
          <span className="rd-board-r">
            <span><Icon name="xp" size={22} /><b className="num">+{r.xp.toLocaleString("ru-RU")}</b></span>
            <span><Icon name="RUB" size={22} /><b className="num">+{r.rub.toLocaleString("ru-RU")}</b></span>
          </span>
        </div>
      </div>
      <div className="title-row rd-title">
        <Link href={`/clans/raids/${y.id}`} className="back-btn" aria-label="Во двор">‹</Link>
        <b>Двор №{y.n} · {BUILDING_NAMES[b.kind]}</b>
      </div>
      <div className="rd-attack-foot">
        {!v ? null : !v.clanId ? <span className="rd-attack-note">Ходки — только для клана</span>
          : elsewhere ? <span className="rd-attack-note">Ты уже в бою за другое здание</span>
          : prog?.taken ? <span className="rd-attack-note">Здание уже захвачено кланом</span>
          : <button type="button" className="btn gold block rd-attack-go" disabled={busy === "raid_start"} onClick={start}>Атаковать</button>}
      </div>
    </div>
  );
}
