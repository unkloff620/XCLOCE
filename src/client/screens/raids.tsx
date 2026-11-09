"use client";
/*
 * «Ходки» (content/raids.ts): the clan takes the district's yards one after another.
 *  - RaidsScreen: the yards as case-file cards (‹ › or a swipe): the yard's photo on a paper clip, the wins to take it,
 *    what taking it gives; «Захватить» leads into the yard (only the first one is open until it is taken);
 *  - RaidYardScreen: the yard from above — its six buildings in rows and the main one (twice as big) at the top.
 * Step 1: the look. The fights for the buildings and the rewards come next.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { usePageReady } from "../route-loader.tsx";
import { useGame } from "../store.tsx";
import { Icon } from "../art/icons.tsx";
import { haptic } from "../telegram.ts";
import { BUILDING_NAMES, RAID_YARDS, raidYardById, type RaidBuilding } from "../../content/raids.ts";

const A = "/assets/raids";

export function RaidsScreen() {
  usePageReady(true);
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  const y = RAID_YARDS[i];
  const go = (d: number) => { setI((v) => (v + d + RAID_YARDS.length) % RAID_YARDS.length); haptic.tap(); };
  // step 1: only the first yard is open (the next opens when the one before is taken)
  const open = i === 0;
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
            <span className="rd-wins num">Побед 0/{y.wins}</span>
            {!open && <span className="rd-lock"><Icon name="lock" size={34} /></span>}
          </div>
          <div className="rd-body">
            <span className="rd-kicker">двор №{y.n}</span>
            <b className="rd-name">{y.name}</b>
            <span className="rd-sub">{y.subtitle}</span>
            {open
              ? <Link href={`/clans/raids/${y.id}`} className="btn gold rd-go">Захватить</Link>
              : <span className="rd-closed">Сначала захвати двор «{RAID_YARDS[i - 1].name}»</span>}
            <span className="rd-h">Награды за захват двора</span>
            <div className="rd-rewards">
              <span><Icon name="ach-clan" size={26} />опыт клана</span>
              <span><Icon name="xp" size={26} />авторитет</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <span><img src={`${A}/flag.webp`} alt="" width={26} height={26} />флаг {y.n} ур.</span>
            </div>
          </div>
        </div>
        <button type="button" className="rd-arrow" onClick={() => go(1)} aria-label="Следующий двор">›</button>
      </div>
    </div>
  );
}

/**
 * A building on the yard: it is painted into the picture, so here it is only the place to tap; the one to attack now
 * is drawn over its painted self (the same sprite at the same spot) and glows.
 */
function Building({ b, target }: { b: RaidBuilding; target: boolean }) {
  return (
    <button type="button" className={`rd-bld k-${b.kind} ${target ? "target" : ""}`} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%` }}
      onClick={() => haptic.tap()} aria-label={BUILDING_NAMES[b.kind]}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${A}/b-${b.kind}.webp`} alt="" draggable={false} />
    </button>
  );
}

export function RaidYardScreen({ id }: { id: string }) {
  usePageReady(true);
  const { state } = useGame();
  const y = raidYardById(id);
  if (!y || !state) return null;
  return (
    <div className="fit-page rd-page rd-yard">
      <div className="rd-scene">
        {/* the painted yard (only «Гаражи» is painted so far; the other yards are closed until it is taken) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rd-map-bg" src={`${A}/yard-garages.webp`} alt="" draggable={false} />
        {/* the main one first in the markup: it stands behind (higher on the picture) */}
        {[...y.buildings].reverse().map((b) => <Building key={b.id} b={b} target={b.id === y.buildings[0].id} />)}
      </div>
      <div className="title-row rd-title">
        <Link href="/clans/raids" className="back-btn" aria-label="К дворам">‹</Link>
        <b>Двор №{y.n} · {y.name}</b>
        <span className="rd-progress num">0/{y.buildings.length}</span>
      </div>
    </div>
  );
}
