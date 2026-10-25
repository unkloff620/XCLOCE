"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./art/icons.tsx";
import { ItemArt } from "./art/items.tsx";
import { itemById } from "../content/items.ts";
import { CURRENCY_DEFS, type Currency } from "../content/currencies.ts";
import type { Reward } from "../content/rewards.ts";
import type { Granted } from "./api.ts";
import { money, pct } from "./format.ts";

export function Bar({ value, max, tone = "green", label, height }: { value: number; max: number; tone?: "green" | "red" | "gold" | "violet"; label?: ReactNode; height?: number }) {
  return (
    <div className={`bar ${tone}`} style={height ? { height } : undefined}>
      <i style={{ width: `${pct(value, max)}%` }} />
      {label !== undefined && <span style={height ? { lineHeight: `${height - 5}px` } : undefined}>{label}</span>}
    </div>
  );
}

/** `full` — the whole screen (mini games): content keeps `maxWidth` (if given) in the middle */
/** how many full-screen windows are open (the main menu is raised over the window's bottom while any is) */
let fullOpen = 0;

/** `page`: a whole page between the HUD and the main menu (both stay visible; a tap on the menu closes it) */
export function Modal({ title, onClose, children, wide, maxWidth, full, page }: { title?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; maxWidth?: number; full?: boolean; page?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  // a full-screen mini game keeps the main menu under it: a tap on a menu button closes the game and goes there
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!page) return;
    const nav = (e: MouseEvent) => { if ((e.target as Element | null)?.closest?.(".nav a")) closeRef.current(); };
    document.addEventListener("click", nav, true);
    return () => document.removeEventListener("click", nav, true);
  }, [page]);
  useEffect(() => {
    if (!full) return;
    fullOpen++;
    document.body.classList.add("has-full");
    const nav = (e: MouseEvent) => { if ((e.target as Element | null)?.closest?.(".nav a")) closeRef.current(); };
    document.addEventListener("click", nav, true);
    return () => {
      document.removeEventListener("click", nav, true);
      // another full window may still be open (a game opened from a game)
      if (--fullOpen <= 0) { fullOpen = 0; document.body.classList.remove("has-full"); }
    };
  }, [full]);
  // rendered into <body> so it covers the HUD even when opened from a fixed full-screen scene
  const box = (
    <div className={`modal-back ${full ? "full" : ""} ${page ? "page" : ""}`} onClick={full || page ? undefined : onClose} role="dialog" aria-modal="true">
      <div className={`modal ${full ? "full" : ""} ${page ? "page" : ""}`} style={full ? ({ ["--mw" as string]: maxWidth ? `${maxWidth}px` : "100%" }) : page ? undefined : maxWidth ? { maxWidth } : wide ? { maxWidth: 460 } : undefined} onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Закрыть">×</button>
        {title && <h3 className="display">{title}</h3>}
        {children}
      </div>
    </div>
  );
  return typeof document === "undefined" ? box : createPortal(box, document.body);
}

/** Player picture; `frame` — last week's place in the damage rating (gold/silver/bronze/top-10). */
export function Avatar({ name, photo, size = 36, frame }: { name: string; photo?: string | null; size?: number; frame?: string | null }) {
  const letters = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={`avatar ${frame ? `frame-${frame}` : ""}`} style={{ width: size, height: size, fontSize: size * 0.4, borderRadius: size * 0.32 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" /> : letters || "?"}
    </span>
  );
}

export function Coin({ c, v, size = 18, bold = true }: { c: Currency; v: number; size?: number; bold?: boolean }) {
  return (
    <span className="row" style={{ gap: 3, display: "inline-flex" }} title={CURRENCY_DEFS[c]?.name}>
      <Icon name={c} size={size} />
      {bold ? <b className="num">{money(c, v)}</b> : <span className="num">{money(c, v)}</span>}
    </span>
  );
}

/** Reward preview (from the catalog) or what was actually granted. */
export function RewardChips({ r, size = 18 }: { r: Reward | Granted | null | undefined; size?: number }) {
  if (!r) return null;
  const items = r.items ?? [];
  return (
    <span className="row rchips" style={{ flexWrap: "wrap", gap: "4px 10px" }}>
      {Object.entries(r.currencies ?? {}).map(([c, v]) => (v ? <span key={c} className="chip"><Coin c={c as Currency} v={v} size={size} /></span> : null))}
      {!!r.xp && <span className="chip violet" title="Авторитет"><Icon name="xp" size={size} />+{r.xp}</span>}
      {!!r.energy && <span className="chip gold" title="Энергия"><Icon name="energy" size={size} />+{r.energy}</span>}
      {!!r.achPoints && <span className="chip ach-pts" title="Очки достижений"><Icon name="sun" size={size} />+{r.achPoints}</span>}
      {items.map((it) => (
        // a picture and how many — no name (it is in the tooltip)
        <span key={it.id} className="chip rc-item" title={itemById(it.id)?.name ?? it.id} aria-label={`${itemById(it.id)?.name ?? it.id} ×${it.qty}`}>
          <ItemArt id={it.id} size={size + 2} />
          <span className="num">+{it.qty}</span>
        </span>
      ))}
    </span>
  );
}

/** What was just gained, pictures only: [picture]+N … (toasts for pickups). */
/** Boss drops are a secret: a «?» says something may fall; `count` = things of this boss already opened, e.g. "0/3". */
export function MysteryDrop({ size = 18, count }: { size?: number; count?: string }) {
  return (
    <span className="gain mystery" title={count ? `Вещи с этого босса: открыто ${count}. Какие — секрет` : "Шанс выбить что-то ещё — что именно, секрет"}>
      <span className="mystery-box" style={{ width: size, height: size, fontSize: size * 0.72 }}>?</span>
      {count && <span className="mystery-count">{count}</span>}
    </span>
  );
}

/** "x/N": how many of a boss's things the player has opened (or owns); null when the boss has none */
export function bossItemsCount(boss: { wear?: { items: string[] } }, state: { unlocks?: string[]; inventory: { id: string; qty: number }[] } | null): string | null {
  if (!boss.wear?.items.length) return null;
  const have = boss.wear.items.filter((id) => state?.unlocks?.includes(id) || (state?.inventory.find((i) => i.id === id)?.qty ?? 0) > 0).length;
  return `${have}/${boss.wear.items.length}`;
}

export function GainLine({ r, size = 26 }: { r: Reward | Granted | null | undefined; size?: number }) {
  if (!r) return null;
  return (
    <span className="gain-line">
      {(r.items ?? []).map((it) => (
        <span key={it.id} className="gain" title={itemById(it.id)?.name}><ItemArt id={it.id} size={size} />+{it.qty}</span>
      ))}
      {Object.entries(r.currencies ?? {}).map(([c, v]) => (v ? (
        <span key={c} className="gain" title={CURRENCY_DEFS[c as Currency]?.name ?? c}><Icon name={c} size={size} />+{money(c as Currency, v)}</span>
      ) : null))}
      {!!r.energy && <span className="gain" title="Энергия"><Icon name="energy" size={size} />+{r.energy}</span>}
      {!!r.xp && <span className="gain" title="Авторитет"><Icon name="xp" size={size} />+{r.xp}</span>}
      {!!r.achPoints && <span className="gain" title="Очки достижений"><Icon name="sun" size={size} />+{r.achPoints}</span>}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="panel center muted" style={{ padding: 22 }}>{children}</div>;
}
