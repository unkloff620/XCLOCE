"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { svgDataUri, tokenLogoSvg, type TokenArt } from "../shared/art.ts";
import type { Rarity } from "../shared/economy.ts";

export function TokenLogo({ art, size = 40 }: { art: TokenArt; size?: number }) {
  const src = useMemo(() => svgDataUri(tokenLogoSvg(art)), [art]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="token-logo" src={src} width={size} height={size} alt="" draggable={false} />;
}

export function Icon({ name, size = 18 }: { name: "rub" | "usd" | "sol" | "btc" | "energy" | "xp" | "damage"; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="icon" src={`/assets/icons/${name}.svg`} width={size} height={size} alt="" draggable={false} />;
}

export function Sparkline({ data, width = 72, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || max || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`);
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="spark">
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Area chart with last-price marker and hover/touch readout. */
export function PriceChart({ data, height = 200, format }: { data: number[]; height?: number; format: (v: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 340));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (data.length < 2) return <div className="chart-empty">График появится через несколько секунд</div>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || max || 1;
  const pad = 8;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const line = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const up = data[data.length - 1] >= data[0];
  const color = up ? "var(--up)" : "var(--down)";
  const hi = hover ?? data.length - 1;
  const onMove = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const i = Math.round(((clientX - rect.left) / rect.width) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };
  return (
    <div
      className="chart"
      ref={ref}
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerLeave={() => setHover(null)}
      onTouchEnd={() => setHover(null)}
    >
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={up ? "#22e58b" : "#ff3b5c"} stopOpacity=".35" />
            <stop offset="1" stopColor={up ? "#22e58b" : "#ff3b5c"} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={w} y1={height * g} y2={height * g} stroke="var(--grid)" strokeDasharray="3 5" />
        ))}
        <path d={`${line}L${w} ${height}L0 ${height}Z`} fill="url(#chartFill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <line x1={x(hi)} x2={x(hi)} y1="0" y2={height} stroke="var(--muted)" strokeOpacity={hover !== null ? 0.6 : 0} />
        <circle cx={x(hi)} cy={y(data[hi])} r="4.5" fill={color} stroke="var(--bg)" strokeWidth="2" />
      </svg>
      <div className="chart-readout" style={{ color }}>{format(data[hi])}</div>
      <div className="chart-range">
        <span>max {format(max)}</span>
        <span>min {format(min)}</span>
      </div>
    </div>
  );
}

/** Smoothly animates numeric changes. */
export function AnimatedNumber({ value, format, duration = 600 }: { value: number; format: (v: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (b - a) * e;
      setShown(v);
      from.current = v;
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);
  return <>{format(shown)}</>;
}

export function Bar({ value, max, tone = "boss" }: { value: number; max: number; tone?: "boss" | "xp" | "energy" | "risk" }) {
  const k = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={`bar bar-${tone}`}>
      <div className="bar-fill" style={{ transform: `scaleX(${k})` }} />
    </div>
  );
}

export function Avatar({ url, name, size = 44 }: { url?: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={url} alt="" width={size} height={size} onError={() => setBroken(true)} />;
  }
  const letter = (name.replace("@", "")[0] || "D").toUpperCase();
  return (
    <div className="avatar avatar-letter" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {letter}
    </div>
  );
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic",
};
export function RarityBadge({ rarity }: { rarity: Rarity }) {
  return <span className={`rarity rarity-${rarity}`}>{RARITY_LABEL[rarity]}</span>;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
