"use client";
import { useGame } from "../store.tsx";
import { Hero } from "../art/hero.tsx";
import { Scene } from "../art/scene.tsx";
import { UIcon } from "../art/icons.tsx";
import { countdown, fmtNum } from "../ui.tsx";
import { BOSSES, bossImage } from "../../shared/content.ts";

export function HomeScreen() {
  const { game, openSheet, setTab, setYard, now } = useGame();
  if (!game) return null;
  const p = game.player;
  const missionsReady = game.missions.filter((m) => m.done && !m.claimed).length;

  return (
    <div className="screen home">
      <section className="stage">
        <Scene theme={p.theme} tier={p.workplaceTier} />
        <div className="stage-hero">
          <Hero loadout={p.loadout} size={250} />
        </div>

        <div className="side left">
          <SideBtn icon="yard" label="Двор" onClick={() => setYard(true)} />
          <SideBtn icon="scroll" label="Задания" dot={missionsReady > 0} onClick={() => openSheet("missions")} />
          <SideBtn icon="trophy" label="Ивенты" dot={game.weekend} onClick={() => openSheet("events")} />
          <SideBtn icon="shop" label="Магазин" onClick={() => openSheet("shop")} />
        </div>
        <div className="side right">
          <button className="poster" onClick={() => openSheet("rooms")}>
            <span className="poster-title comic">TO THE<br />MOON</span>
            <span className="poster-sub">Сменить комнату</span>
          </button>
          <button className="side-card" onClick={() => openSheet("daily")}>
            <span className="comic">DAILY<br />REWARDS</span>
            <UIcon name="chest" size={46} />
            <small>{game.daily.canClaim ? "Забрать!" : countdown(game.daily.availableAt - now)}</small>
            {game.daily.canClaim && <i className="dot" />}
          </button>
        </div>

        {game.fight && <BossBanner />}
      </section>

      <section className="home-cards">
        <button className="hcard" onClick={() => openSheet("upgrade")}>
          <div className="hcard-title comic">UPGRADE</div>
          <div className="row-c gap"><UIcon name="muscle" size={44} /><small className="muted">Улучши рабочее место — больше силы и энергии</small></div>
          <span className="chev">›</span>
        </button>
        <button className="hcard" onClick={() => setTab("inventory")}>
          <div className="hcard-title comic">INVENTORY</div>
          <div className="row-c gap"><UIcon name="cards" size={44} /><small className="muted">Оружие, шмот и сундуки</small></div>
          <span className="chev">›</span>
        </button>
      </section>
    </div>
  );
}

function SideBtn({ icon, label, dot, onClick }: { icon: Parameters<typeof UIcon>[0]["name"]; label: string; dot?: boolean; onClick: () => void }) {
  return (
    <button className="side-btn" onClick={onClick}>
      <UIcon name={icon} size={34} />
      <span>{label}</span>
      {dot && <i className="dot" />}
    </button>
  );
}

const leftLabel = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}Ч ${m % 60}М` : `${m}М ${Math.max(0, Math.floor(ms / 1000) % 60)}С`;
};

/** Active boss fight banner (replaces FIGHT NOW): boss art, name, HP left and time to the end of the 8-hour fight. */
function BossBanner() {
  const { game, setFight, setTab, now } = useGame();
  const f = game?.fight;
  if (!f) return null;
  const def = BOSSES.find((b) => b.index === f.bossIndex)!;
  const pct = Math.round((f.hp / f.hpMax) * 100);
  const over = f.won || f.lost;
  return (
    <button className={`boss-banner ${f.won ? "won" : f.lost ? "lost" : ""}`} onClick={() => (over ? setTab("boss") : setFight(f.bossIndex))}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bb-art" src={bossImage(def)} alt="" draggable={false} />
      <span className="bb-shade" />
      <span className="bb-left">
        <span className="bb-tag comic">BOSS FIGHT</span>
        <span className="bb-name comic">{def.name}</span>
        <span className="bb-time">⏱ {f.won ? "ПОБЕДА!" : f.lost ? "ВРЕМЯ ВЫШЛО" : `${leftLabel(f.endsAt - now)} LEFT`}</span>
      </span>
      <span className="bb-right">
        <span className="bb-lv comic">#{def.index}</span>
        <span className="bb-sub">YOUR BOSS</span>
        <span className="bb-hp"><span style={{ width: `${pct}%` }} /><b>{fmtNum(f.hp)} HP · {pct}%</b></span>
        <span className="bb-btn comic">{over ? "ИТОГ" : "VIEW BOSS"} ›</span>
      </span>
    </button>
  );
}
