"use client";
import { useEffect, type ReactNode } from "react";
import { Icon } from "./art/icons.tsx";
import { ItemArt } from "./art/items.tsx";
import { itemById } from "../content/items.ts";
import type { Currency } from "../content/currencies.ts";
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

export function Modal({ title, onClose, children, wide }: { title?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" style={wide ? { maxWidth: 460 } : undefined} onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Закрыть">×</button>
        {title && <h3 className="display">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Avatar({ name, photo, size = 36 }: { name: string; photo?: string | null; size?: number }) {
  const letters = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, borderRadius: size * 0.32 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : letters || "?"}
    </span>
  );
}

export function Coin({ c, v, size = 18, bold = true }: { c: Currency; v: number; size?: number; bold?: boolean }) {
  return (
    <span className="row" style={{ gap: 3, display: "inline-flex" }}>
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
    <span className="row" style={{ flexWrap: "wrap", gap: 6 }}>
      {Object.entries(r.currencies ?? {}).map(([c, v]) => (v ? <span key={c} className="chip"><Coin c={c as Currency} v={v} size={size} /></span> : null))}
      {!!r.xp && <span className="chip violet"><Icon name="xp" size={size} />+{r.xp} XP</span>}
      {!!r.energy && <span className="chip gold"><Icon name="energy" size={size} />+{r.energy}</span>}
      {items.map((it) => (
        <span key={it.id} className="chip" title={itemById(it.id)?.name}>
          <ItemArt id={it.id} size={size + 2} />
          {itemById(it.id)?.name ?? it.id}
          {it.qty > 1 ? ` ×${it.qty}` : ""}
        </span>
      ))}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="panel center muted" style={{ padding: 22 }}>{children}</div>;
}
