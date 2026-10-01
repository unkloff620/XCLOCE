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

const CUR_KEY = "xcloce_hud_currencies";
const fmtBal = (c: Currency, v: number) => (c === "BTC" ? v.toFixed(5) : c === "SOL" ? v.toFixed(2) : fmtNum(v));

/** HUD money: two currencies (RUB + USD by default); tap one to pick any currency for that line. */
function MoneyPanel() {
  const { game } = useGame();
  const [pair, setPair] = useState<[Currency, Currency]>(["RUB", "USD"]);
  const [open, setOpen] = useState<0 | 1 | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CUR_KEY) ?? "null") as unknown;
      if (Array.isArray(saved) && saved.length === 2 && saved.every((c) => CURRENCIES.includes(c)) && saved[0] !== saved[1]) setPair(saved as [Currency, Currency]);
    } catch {
      /* storage unavailable — keep RUB + USD */
    }
  }, []);
  useEffect(() => {
    if (open === null) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  if (!game) return null;
  const b = game.balances;
  const pick = (slot: 0 | 1, c: Currency) => {
    const next: [Currency, Currency] = [...pair];
    const other = slot === 0 ? 1 : 0;
    if (next[other] === c) next[other] = next[slot]; // picking the other line's currency swaps them
    next[slot] = c;
    setPair(next);
    setOpen(null);
    try { localStorage.setItem(CUR_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return (
    <div className="hud-panel hud-money" ref={ref}>
      <PanelArt variant="money" />
      {pair.map((cur, i) => (
        <button key={i} className={`money money-main ${open === i ? "open" : ""}`} onClick={() => setOpen((o) => (o === i ? null : (i as 0 | 1)))} aria-haspopup="listbox" aria-expanded={open === i} aria-label={`Баланс ${cur}, выбрать валюту`}>
          <CellArt cur={cur} />
          <UIcon name={CUR_ICON[cur]} size={16} />
          <b><AnimatedNumber key={cur} value={b[cur]} format={(v) => fmtBal(cur, v)} /></b>
          <span className={`caret ${open === i ? "up" : ""}`}>▾</span>
        </button>
      ))}
      {open !== null && (
        <div className="money-list" role="listbox" aria-label="Валюты">
          {CURRENCIES.map((c) => (
            <button key={c} role="option" aria-selected={c === pair[open]} className={`money money-row ${c === pair[open] ? "on" : ""} ${c === pair[open === 0 ? 1 : 0] ? "other" : ""}`} onClick={() => pick(open, c)}>
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
