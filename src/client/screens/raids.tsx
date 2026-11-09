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
import { useRouter } from "next/navigation";
import { BUILDING_NAMES, RAID_YARDS, YARD_TREES, YARD_WALKERS, buildingReward, buildingWins, raidYardById, type RaidBuilding } from "../../content/raids.ts";

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

/** a building on the yard's ground; the one to attack now glows */
function Building({ b, target, yard }: { b: RaidBuilding; target: boolean; yard: string }) {
  const router = useRouter();
  return (
    <button type="button" className={`rd-bld k-${b.kind} ${target ? "target" : ""}`} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, zIndex: Math.round(b.y * 10) }}
      onClick={() => { haptic.tap(); if (target) router.push(`/clans/raids/${yard}/${b.id}`); }} aria-label={BUILDING_NAMES[b.kind]}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${A}/b-${b.kind}.webp`} alt="" draggable={false} />
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
  usePageReady(true);
  const { state } = useGame();
  const y = raidYardById(id);
  if (!y || !state) return null;
  return (
    <div className="fit-page rd-page rd-yard">
      <div className="rd-scene">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rd-map-bg" src={`${A}/yard-ground2.webp`} alt="" draggable={false} />
        {/* the main one first in the markup: it stands behind (higher on the picture) */}
        <YardLife />
        {[...y.buildings].reverse().map((b) => <Building key={b.id} b={b} yard={y.id} target={b.id === y.buildings[0].id} />)}
      </div>
      <div className="title-row rd-title">
        <Link href="/clans/raids" className="back-btn" aria-label="К дворам">‹</Link>
        <b>Двор №{y.n} · {y.name}</b>
        <span className="rd-progress num">0/{y.buildings.length}</span>
      </div>
    </div>
  );
}

/**
 * The attack on a building: a brick wall over the whole screen, the room behind its window (the defenders will stand
 * there, animated like the bosses, behind the bars), the board under the window — the wins left and what a win gives,
 * the attack below it.
 */
export function RaidAttackScreen({ yard, building }: { yard: string; building: string }) {
  usePageReady(true);
  const y = raidYardById(yard);
  const b = y?.buildings.find((x) => x.id === building);
  if (!y || !b) return null;
  const main = b.kind === "main";
  const r = buildingReward(y.n, main);
  const wins = buildingWins(y, main);
  return (
    <div className="fit-page rd-page rd-attack">
      <div className="rd-scene">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rd-room" src={`${A}/attack-room.webp`} alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rd-map-bg rd-wall" src={`${A}/attack-wall.webp`} alt="" draggable={false} />
        <div className="rd-board">
          <b className="rd-board-t">{BUILDING_NAMES[b.kind]}</b>
          <span className="rd-board-w">Осталось побед до захвата: <b className="num">{wins}</b></span>
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
        <button type="button" className="btn gold block rd-attack-go" disabled>Атаковать</button>
        <span className="rd-attack-note">Бой за здание — следующий шаг</span>
      </div>
    </div>
  );
}
