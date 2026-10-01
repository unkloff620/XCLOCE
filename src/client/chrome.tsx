"use client";
import { useGame, type Tab } from "./store.tsx";
import { Icon, AnimatedNumber } from "./ui.tsx";
import { money } from "./format.ts";
import { CURRENCY_UNLOCK_LEVEL } from "../shared/economy.ts";

function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e4) return (v / 1e3).toFixed(1) + "K";
  return Math.floor(v).toLocaleString("en-US");
}
function fmtBal(v: number, c: string): string {
  if (c === "RUB") return compact(v);
  if (c === "USD") return v >= 1000 ? compact(v) : v.toFixed(2);
  if (c === "SOL") return v >= 1000 ? compact(v) : v >= 10 ? v.toFixed(1) : v.toFixed(3);
  return v.toFixed(4);
}

export function TopBar() {
  const { game, openSheet } = useGame();
  if (!game) return null;
  const b = game.balances;
  const r = game.rates;
  const lvl = game.player.level;
  const cards = [
    { c: "RUB", icon: "rub" as const, sub: `+${compact(game.player.passiveRubPerHour)}/ч`, up: true },
    { c: "USD", icon: "usd" as const, sub: `${(1 / r.RUB).toFixed(0)}₽`, up: false },
    { c: "SOL", icon: "sol" as const, sub: money(r.SOL), up: false },
    { c: "BTC", icon: "btc" as const, sub: lvl >= CURRENCY_UNLOCK_LEVEL.BTC ? money(r.BTC, { compact: true }) : `🔒 Lv${CURRENCY_UNLOCK_LEVEL.BTC}`, up: false },
  ];
  return (
    <header className="topbar">
      <div className="cur-cards">
        {cards.map((k) => (
          <button key={k.c} className="cur-card" onClick={() => openSheet("exchange")} aria-label={`${k.c}: открыть обменник`}>
            <Icon name={k.icon} size={22} />
            <span className="cur-text">
              <b><AnimatedNumber value={b[k.c as keyof typeof b]} format={(v) => fmtBal(v, k.c)} /></b>
              <small className={k.up ? "up" : "muted"}>{k.sub}</small>
            </span>
          </button>
        ))}
      </div>
    </header>
  );
}

const NAV_ICONS: Record<Tab, string> = {
  home: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z",
  market: "M5 20v-6M10 20V10M15 20v-9M20 20V5",
  boss: "M5 9l3 2 4-5 4 5 3-2-1 9H6zM9 14h.01M15 14h.01M10 17h4",
  quests: "M8 4h8l1 2h2v15H5V6h2zM9 11l2 2 4-4M9 17h6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};
function NavIcon({ id }: { id: Tab }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={id === "more" ? 3.2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d={NAV_ICONS[id]} />
    </svg>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "market", label: "Market" },
  { id: "boss", label: "Boss" },
  { id: "quests", label: "Quests" },
  { id: "more", label: "More" },
];

export function BottomNav() {
  const { tab, setTab, game, predictedBoss } = useGame();
  const step = game?.player.tutorialStep ?? 6;
  const questReady = (game?.quests.some((q) => q.done && !q.claimed) ?? false) || (game?.daily.canClaim ?? false);
  return (
    <nav className="bottomnav">
      {TABS.map((t) => {
        const pulse = (t.id === "market" && (step === 3 || step === 4)) || (t.id === "boss" && step === 5);
        return (
          <button key={t.id} className={`navbtn ${tab === t.id ? "on" : ""} ${pulse ? "pulse" : ""}`} onClick={() => setTab(t.id)}>
            <span className="navicon"><NavIcon id={t.id} /></span>
            <span className="navlabel">{t.label}</span>
            {t.id === "boss" && predictedBoss && <span className="navbadge">#{predictedBoss.index}</span>}
            {t.id === "quests" && questReady && <span className="navdot" />}
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
