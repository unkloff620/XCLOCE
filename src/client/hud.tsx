"use client";
import { useGame, type Tab } from "./store.tsx";
import { AnimatedNumber, Avatar, fmtNum } from "./ui.tsx";
import { useEffect, useRef, useState } from "react";
import { CUR_ICON, UIcon, type UiIcon } from "./art/icons.tsx";
import { CURRENCIES, type Currency } from "../shared/economy.ts";
import { CellArt, NavArt, PanelArt } from "./art/hudart.tsx";

export function TopHud() {
  const { game, energyNow, openSheet, nextEnergyIn } = useGame();
  if (!game) return null;
  const p = game.player;
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
      <MoneyPanel />
    </header>
  );
}

const CUR_KEY = "xcloce_hud_currency";
const fmtBal = (c: Currency, v: number) => (c === "BTC" ? v.toFixed(5) : c === "SOL" ? v.toFixed(2) : fmtNum(v));

/** HUD money: shows one chosen currency (RUB by default); tap opens the list of all balances to pick another. */
function MoneyPanel() {
  const { game } = useGame();
  const [cur, setCur] = useState<Currency>("RUB");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CUR_KEY) as Currency | null;
      if (saved && CURRENCIES.includes(saved)) setCur(saved);
    } catch {
      /* storage unavailable — keep RUB */
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  if (!game) return null;
  const b = game.balances;
  const pick = (c: Currency) => {
    setCur(c);
    setOpen(false);
    try { localStorage.setItem(CUR_KEY, c); } catch { /* ignore */ }
  };
  return (
    <div className="hud-panel hud-money" ref={ref}>
      <PanelArt variant="money" />
      <button className="money money-main" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Баланс ${cur}, выбрать валюту`}>
        <CellArt cur={cur} />
        <UIcon name={CUR_ICON[cur]} size={20} />
        <b><AnimatedNumber key={cur} value={b[cur]} format={(v) => fmtBal(cur, v)} /></b>
        <span className={`caret ${open ? "up" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="money-list" role="listbox" aria-label="Валюты">
          {CURRENCIES.map((c) => (
            <button key={c} role="option" aria-selected={c === cur} className={`money money-row ${c === cur ? "on" : ""}`} onClick={() => pick(c)}>
              <CellArt cur={c} />
              <UIcon name={CUR_ICON[c]} size={18} />
              <span className="money-code">{c}</span>
              <b>{fmtBal(c, b[c])}</b>
            </button>
          ))}
        </div>
      )}
    </div>
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
          <NavArt id={n.id} on={active === n.id} />
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
