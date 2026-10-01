"use client";
import { useGame, type Tab } from "./store.tsx";
import { AnimatedNumber, Avatar, fmtNum } from "./ui.tsx";
import { UIcon, type UiIcon } from "./art/icons.tsx";
import { CellArt, NavArt, PanelArt } from "./art/hudart.tsx";

export function TopHud() {
  const { game, energyNow, openSheet, nextEnergyIn } = useGame();
  if (!game) return null;
  const p = game.player;
  const b = game.balances;
  return (
    <header className="hud">
      <button className="hud-panel hud-profile" onClick={() => openSheet("profile")} aria-label="Профиль">
        <PanelArt variant="profile" />
        <Avatar url={p.photoUrl} name={p.name} size={44} />
        <div className="minw0 grow">
          <div className="hud-name ellipsis">{p.name}</div>
          <div className="hud-lvl"><span>Lv. {p.level}</span></div>
          <span className="xpbar"><span style={{ width: `${Math.min(100, (p.xp / p.xpNext) * 100)}%` }} /></span>
        </div>
      </button>
      <div className="hud-panel hud-power">
        <PanelArt variant="power" />
        <div className="row-c">
          <UIcon name="swords" size={26} />
          <div>
            <small>POWER</small>
            <b className="comic"><AnimatedNumber value={p.power} format={fmtNum} /></b>
          </div>
        </div>
        <button className="energy-mini" onClick={() => openSheet("shop")} aria-label="Энергия" title={nextEnergyIn > 0 ? `+1 через ${Math.ceil(nextEnergyIn / 1000)} с` : "Энергия полная"}>
          <span className="energy-fill" style={{ width: `${Math.min(100, (energyNow / p.maxEnergy) * 100)}%` }} />
          <span className="energy-txt">⚡{Math.floor(energyNow)}/{p.maxEnergy}</span>
        </button>
      </div>
      <div className="hud-panel hud-money">
        <PanelArt variant="money" />
        {(["RUB", "USD", "SOL", "BTC"] as const).map((c) => (
          <button key={c} className="money" onClick={() => openSheet("exchange")} aria-label={`${c} — обменник`}>
            <CellArt cur={c} />
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
  const { tab, setTab, game, energyNow, fight, yard } = useGame();
  const active: Tab = fight !== null ? "boss" : yard ? "home" : tab;
  const dots: Partial<Record<Tab, boolean>> = {
    boss: !!game && (!!game.fight?.won || !!game.fight?.lost || game.bosses.some((b) => b.canUnlock) || (!game.fight && game.bosses.some((b) => b.unlocked && b.attemptsLeft > 0))),
    market: energyNow >= 5,
    social: !game?.clan,
  };
  return (
    <nav className="nav">
      {NAV.map((n) => (
        <button key={n.id} className={`nav-btn ${active === n.id ? "on" : ""} ${n.id === "home" ? "home" : ""}`} onClick={() => setTab(n.id)} aria-label={n.label}>
          <NavArt id={n.id} />
          {dots[n.id] && active !== n.id && <i className="dot" />}
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
