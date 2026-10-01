"use client";
import { useGame } from "../store.tsx";
import { Hero } from "../art/hero.tsx";
import { Scene } from "../art/scene.tsx";
import { UIcon } from "../art/icons.tsx";
import { countdown, fmtCur } from "../ui.tsx";

export function HomeScreen() {
  const { game, openSheet, setTab, act, busy, setFight, now } = useGame();
  if (!game) return null;
  const p = game.player;
  const target = [...game.bosses].reverse().find((b) => b.unlocked && b.attemptsLeft > 0);
  const missionsReady = game.missions.filter((m) => m.done && !m.claimed).length;
  const idleFullIn = Math.max(0, game.idle.capMs - game.idle.ms);

  const fight = async () => {
    if (game.fight) return setFight(game.fight.bossIndex);
    if (!target) return setTab("boss");
    const r = await act<{ bossIndex: number }>("fight_start", { boss: target.index });
    if (r) setFight(r.bossIndex);
  };

  return (
    <div className="screen home">
      <section className="stage">
        <Scene theme={p.theme} tier={p.workplaceTier} />
        <div className="stage-hero">
          <Hero loadout={p.loadout} size={250} />
        </div>

        <div className="side left">
          <SideBtn icon="gift" label="Награда" dot={game.daily.canClaim} onClick={() => openSheet("daily")} />
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

        <button className="fight-btn" onClick={fight}>
          <span className="fight-burst" />
          <span className="fight-text comic">FIGHT<br />NOW</span>
          <span className="fight-sub">{game.fight ? (game.fight.won ? "Победа! Забери награду" : `В бою: #${game.fight.bossIndex}`) : target ? `⚔ ${target.name} · ${target.attemptsLeft}/7` : "Выбрать босса"}</span>
        </button>
      </section>

      <section className="home-cards">
        <div className="hcard idle">
          <div className="hcard-title comic"><UIcon name="coin" size={18} /> IDLE REWARDS</div>
          <div className="row-c gap">
            <UIcon name="chest" size={44} />
            <div className="grow">
              <div className="mono small">{game.idle.full ? "Склад полон" : countdown(idleFullIn)}</div>
              <b className="idle-amount">{fmtCur(game.idle.amount, game.idle.currency)}</b>
            </div>
          </div>
          <button className="btn-yellow comic" disabled={game.idle.amount < 1 || busy === "idle"} onClick={() => act("idle", {}, (r: { amount: number; currency: string }) => `+${fmtCur(r.amount, r.currency)}`)}>CLAIM</button>
        </div>
        <button className="hcard" onClick={() => openSheet("upgrade")}>
          <div className="hcard-title comic">UPGRADE</div>
          <div className="row-c gap"><UIcon name="muscle" size={44} /><small className="muted">Улучши рабочее место — больше дохода и силы</small></div>
          <span className="chev">›</span>
        </button>
        <button className="hcard" onClick={() => setTab("inventory")}>
          <div className="hcard-title comic">EQUIP</div>
          <div className="row-c gap"><UIcon name="cards" size={44} /><small className="muted">Оружие и шмот для боёв с боссами</small></div>
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
