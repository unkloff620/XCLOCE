"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { UIcon, CUR_ICON } from "./art/icons.tsx";
import type { Currency, Price } from "../shared/economy.ts";
import type { Rarity } from "../shared/items.ts";

export function fmtNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e4) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  if (a >= 100) return Math.round(v).toLocaleString("en-US");
  if (a >= 1) return (Math.round(v * 100) / 100).toString();
  if (a === 0) return "0";
  return v.toPrecision(2);
}
export function fmtCur(v: number, c: Currency | string): string {
  if (c === "RUB") return `${fmtNum(v)} ₽`;
  if (c === "USD") return `$${fmtNum(v)}`;
  return `${fmtNum(v)} ${c}`;
}

export function PriceTag({ price, size = 18 }: { price: Price | { currency: string; amount: number }; size?: number }) {
  return (
    <span className="price-tag">
      <UIcon name={CUR_ICON[price.currency as Currency]} size={size} />
      <b>{fmtNum(price.amount)}</b>
    </span>
  );
}

export function AnimatedNumber({ value, format = fmtNum, duration = 500 }: { value: number; format?: (v: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    const b = value;
    if (a === b) return;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const v = a + (b - a) * (1 - Math.pow(1 - k, 3));
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

export function Bar({ value, max, tone = "green", label }: { value: number; max: number; tone?: "green" | "red" | "violet" | "gold" | "blue"; label?: ReactNode }) {
  const k = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={`bar bar-${tone}`}>
      <div className="bar-fill" style={{ width: `${k * 100}%` }} />
      {label !== undefined && <span className="bar-label">{label}</span>}
    </div>
  );
}

export function Avatar({ url, name, size = 52 }: { url?: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" onError={() => setBroken(true)} />
      ) : (
        <span className="avatar-letter" style={{ fontSize: size * 0.42 }}>{(name.replace("@", "")[0] || "D").toUpperCase()}</span>
      )}
    </span>
  );
}

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h3 className="comic">{title}</h3>
          <button className="x-btn" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export const RARITY_LABEL: Record<Rarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic" };

export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 24) return `${Math.floor(h / 24)}д ${h % 24}ч`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Two-tap confirmation button (window.confirm is unreliable inside Telegram webviews). */
export function ConfirmButton({ className, disabled, onConfirm, children, confirmText = "Точно?" }: { className?: string; disabled?: boolean; onConfirm: () => void; children: ReactNode; confirmText?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={`${className ?? ""} ${armed ? "armed" : ""}`} disabled={disabled} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmText : children}
    </button>
  );
}
