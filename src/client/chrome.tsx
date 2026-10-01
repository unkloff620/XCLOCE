"use client";
import { useGame } from "./store.tsx";
import { Icon, AnimatedNumber } from "./ui.tsx";
import { cur, money } from "./format.ts";
import { CURRENCY_UNLOCK_LEVEL } from "../shared/economy.ts";

export function TopBar() {
  const { game, energyNow, openSheet } = useGame();
  if (!game) return null;
  const b = game.balances;
  const lvl = game.player.level;
  return (
    <header className="topbar">
      <button className="balances" onClick={() => openSheet("exchange")} aria-label="Открыть обменник">
        <span className="bal"><Icon name="rub" size={16} /><AnimatedNumber value={b.RUB} format={(v) => cur(v, "RUB")} /></span>
        <span className="bal"><Icon name="usd" size={16} /><AnimatedNumber value={b.USD} format={(v) => money(v)} /></span>
        <span className="bal"><Icon name="sol" size={16} /><AnimatedNumber value={b.SOL} format={(v) => v.toFixed(v >= 100 ? 1 : 3)} /></span>
        {lvl >= CURRENCY_UNLOCK_LEVEL.BTC && (
          <span className="bal"><Icon name="btc" size={16} />{b.BTC.toFixed(5)}</span>
        )}
      </button>
      <div className="energy" title="Энергия">
        <Icon name="energy" size={16} />
        <span>{Math.floor(energyNow)}<small>/{game.player.maxEnergy}</small></span>
      </div>
    </header>
  );
}

const NAV_ICONS: Record<string, string> = {
  home: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z",
  market: "M3 20h18M5 16l4-5 4 3 6-8M15 6h4v4",
  boss: "M6 10a6 6 0 1 1 12 0v4l2 4H4l2-4zM9 11h.01M15 11h.01M4 4l3 3M20 4l-3 3",
  bag: "M4 8h16l-1 12H5zM9 8V6a3 3 0 0 1 6 0v2M10 13h4",
  top: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3",
};
function NavIcon({ id }: { id: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={NAV_ICONS[id]} />
    </svg>
  );
}

const TABS = [
  { id: "home", label: "База" },
  { id: "market", label: "Рынок" },
  { id: "boss", label: "Босс" },
  { id: "bag", label: "Арсенал" },
  { id: "top", label: "Топ" },
] as const;

export function BottomNav() {
  const { tab, setTab, game, predictedBoss } = useGame();
  const step = game?.player.tutorialStep ?? 6;
  return (
    <nav className="bottomnav">
      {TABS.map((t) => {
        const pulse = (t.id === "market" && (step === 3 || step === 4)) || (t.id === "boss" && step === 5);
        return (
          <button key={t.id} className={`navbtn ${tab === t.id ? "on" : ""} ${pulse ? "pulse" : ""}`} onClick={() => setTab(t.id)}>
            <span className="navicon"><NavIcon id={t.id} /></span>
            <span className="navlabel">{t.label}</span>
            {t.id === "boss" && predictedBoss && <span className="navbadge">#{predictedBoss.index}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export function Toasts() {
  const { toasts } = useGame();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}
