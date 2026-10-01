"use client";
import { useGame, type Tab } from "./store.tsx";
import { AnimatedNumber, Avatar, fmtNum } from "./ui.tsx";
import { UIcon, type UiIcon } from "./art/icons.tsx";

export function TopHud() {
  const { game, energyNow, openSheet, nextEnergyIn } = useGame();
  if (!game) return null;
  const p = game.player;
  const b = game.balances;
  return (
    <header className="hud">
      <div className="hud-panel hud-profile">
        <Avatar url={p.photoUrl} name={p.name} size={44} />
        <div className="minw0 grow">
          <div className="hud-name ellipsis">{p.name}</div>
          <div className="hud-lvl"><span>Lv. {p.level}</span></div>
          <span className="xpbar"><span style={{ width: `${Math.min(100, (p.xp / p.xpNext) * 100)}%` }} /></span>
        </div>
      </div>
      <div className="hud-panel hud-power">
        <div className="row-c">
          <UIcon name="swords" size={26} />
          <div>
            <small>POWER</small>
            <b className="comic"><AnimatedNumber value={p.power} format={fmtNum} /></b>
          </div>
        </div>
        <button className="energy-line" onClick={() => openSheet("shop")} aria-label="Энергия">
          <UIcon name="energy" size={14} />
          <b>{Math.floor(energyNow)}/{p.maxEnergy}</b>
          {nextEnergyIn > 0 && <small>{Math.ceil(nextEnergyIn / 1000)}s</small>}
        </button>
      </div>
      <div className="hud-panel hud-money">
        {(["RUB", "USD", "SOL", "BTC"] as const).map((c) => (
          <button key={c} className="money" onClick={() => openSheet("exchange")} aria-label={`${c} — обменник`}>
            <UIcon name={c.toLowerCase() as UiIcon} size={16} />
            <b><AnimatedNumber value={b[c]} format={(v) => (c === "BTC" ? v.toFixed(4) : c === "SOL" && v < 100 ? v.toFixed(2) : fmtNum(v))} /></b>
          </button>
        ))}
      </div>
    </header>
  );
}

const NAV: { id: Tab; label: string; icon: UiIcon }[] = [
  { id: "boss", label: "Boss", icon: "boss" },
  { id: "market", label: "Market", icon: "market" },
  { id: "home", label: "Home", icon: "home" },
  { id: "inventory", label: "Inventory", icon: "bag" },
  { id: "social", label: "Social", icon: "people" },
];

export function BottomNav() {
  const { tab, setTab, game, energyNow } = useGame();
  const dots: Partial<Record<Tab, boolean>> = {
    boss: !!game?.bosses.some((b) => (b.unlocked && b.attemptsLeft > 0) || b.canUnlock),
    market: energyNow >= 5,
    social: !game?.clan,
  };
  return (
    <nav className="nav">
      {NAV.map((n) => (
        <button key={n.id} className={`nav-btn ${tab === n.id ? "on" : ""} ${n.id === "home" ? "home" : ""}`} onClick={() => setTab(n.id)}>
          <UIcon name={n.icon} size={n.id === "home" ? 34 : 30} />
          <span className="comic">{n.label}</span>
          {dots[n.id] && tab !== n.id && <i className="dot" />}
        </button>
      ))}
    </nav>
  );
}

export function Toasts() {
  const { toasts } = useGame();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}
    </div>
  );
}
