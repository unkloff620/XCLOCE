"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./art/icons.tsx";
import { ItemArt } from "./art/items.tsx";
import { itemById } from "../content/items.ts";
import { CURRENCY_DEFS, type Currency } from "../content/currencies.ts";
import type { Reward } from "../content/rewards.ts";
import type { Granted } from "./api.ts";
import { tattooSetsOfBoss } from "../content/tattoos.ts";
import { full, money, pct } from "./format.ts";

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
/** a window opened from a window lies over it, whatever the order the DOM got them in (80, 81, … — below the loaders at 85) */
let openModals = 0;
/** `head`: a line that stays under the title while the rest scrolls (a plain window: only its body scrolls, inside the paper) */
export function Modal({ title, onClose, children, wide, maxWidth, full, page, head, className }: { title?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; maxWidth?: number; full?: boolean; page?: boolean; head?: ReactNode; /** an extra class on the window (its own look) */ className?: string }) {
  const [z] = useState(() => 80 + Math.min(4, openModals++));
  useEffect(() => () => { openModals = Math.max(0, openModals - 1); }, []);
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
    <div className={`modal-back ${full ? "full" : ""} ${page ? "page" : ""}`} style={{ zIndex: z }} onClick={full || page ? undefined : onClose} role="dialog" aria-modal="true">
      <div className={`modal ${full ? "full" : ""} ${page ? "page" : ""} ${className ?? ""}`} style={full ? ({ ["--mw" as string]: maxWidth ? `${maxWidth}px` : "100%" }) : page ? undefined : maxWidth ? { maxWidth } : wide ? { maxWidth: 460 } : undefined} onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Закрыть">×</button>
        {title && <h3 className="display">{title}</h3>}
        {full || page ? children : (
          <>
            {head && <div className="modal-head">{head}</div>}
            <div className="modal-body">{children}</div>
          </>
        )}
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

/**
 * Reward preview (from the catalog) or what was actually granted.
 * `times` (the default): no plate, a picture and a thin small «×N» at its top right corner, a little over it;
 * `times={false}` — the old line «picture +N».
 * In the corner mode a picture is never smaller than CORNER_MIN px (smaller than in the case, bigger than a text line).
 */
const CORNER_MIN = 22;
/** `side`: the «×N» stands to the right of the icon (not in its corner), and the icon may be smaller than the corner minimum. */
/** `extra`: more chips at the end, in the same row (e.g. the event box on the boss cards) */
export function RewardChips({ r, size = 18, times = true, side = false, extra }: { r: Reward | Granted | null | undefined; size?: number; times?: boolean; side?: boolean; extra?: ReactNode }) {
  if (!r) return null;
  // nothing for 0 (a one-of-a-kind thing already owned); the craft parts — one chip «×N» with the parts pile, the names in the tooltip
  const all = (r.items ?? []).filter((it) => it.qty > 0);
  const parts = all.filter((it) => it.id.startsWith("part-"));
  const items = all.filter((it) => !it.id.startsWith("part-"));
  const partsN = parts.reduce((t, it) => t + it.qty, 0);
  const partsTip = parts.map((it) => `${itemById(it.id)?.name ?? it.id} ×${it.qty}`).join(", ");
  if (side) times = true;
  const sz = times && !side ? Math.max(size, CORNER_MIN) : size;
  const n = (v: string) => <span className="num rc-n">×{v}</span>;
  return (
    <span className={`row rchips${side ? " rc-side" : times ? " rc-times" : ""}`} style={{ flexWrap: "wrap", gap: times ? "6px 8px" : "4px 10px" }}>
      {Object.entries(r.currencies ?? {}).map(([c, v]) => (v ? (
        times ? <span key={c} className="chip" title={CURRENCY_DEFS[c as Currency]?.name}><Icon name={c} size={sz} />{n(money(c as Currency, v))}</span>
          : <span key={c} className="chip"><Coin c={c as Currency} v={v} size={size} /></span>
      ) : null))}
      {!!r.xp && <span className="chip violet" title="Авторитет"><Icon name="xp" size={sz} />{times ? n(full(r.xp)) : `+${r.xp}`}</span>}
      {!!r.energy && <span className="chip gold" title="Энергия"><Icon name="energy" size={sz} />{times ? n(full(r.energy)) : `+${r.energy}`}</span>}
      {!!r.achPoints && <span className="chip ach-pts" title="Очки достижений"><Icon name="sun" size={sz} />{times ? n(full(r.achPoints)) : `+${r.achPoints}`}</span>}
      {items.map((it) => (
        // a picture and how many — no name (it is in the tooltip)
        <span key={it.id} className="chip rc-item" title={itemById(it.id)?.name ?? it.id} aria-label={`${itemById(it.id)?.name ?? it.id} ×${it.qty}`}>
          <ItemArt id={it.id} size={sz + 2} />
          {times ? n(full(it.qty)) : <span className="num">+{it.qty}</span>}
        </span>
      ))}
      {partsN > 0 && (
        <span className="chip rc-item rc-parts" title={`Детали: ${partsTip}`} aria-label={`Детали ×${partsN}`}>
          <Icon name="parts" size={sz + 2} />
          {times ? n(full(partsN)) : <span className="num">×{partsN}</span>}
        </span>
      )}
      {extra}
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

/**
 * What else a boss drops, by its picture: «drop-tattoo» — a piece of his tattoo set (content/tattoos.ts), «drop-wear» —
 * his things (clothes); `count` — how many of them the player has, e.g. "3/12".
 */
export function DropKind({ kind, size = 18, count }: { kind: "tattoo" | "wear"; size?: number; count?: string }) {
  return (
    <span className={`gain drop-kind ${kind}`} title={kind === "tattoo" ? `Наколки с этого босса${count ? `: ${count}` : ""}` : `Вещи с этого босса${count ? `: ${count}` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/assets/ui/drop-${kind}.webp`} alt={kind === "tattoo" ? "наколки" : "вещи"} width={size * 1.25} height={size * 1.25} draggable={false} />
      {count && <span className="mystery-count">{count}</span>}
    </span>
  );
}

/** "x/N" of a boss's tattoo sets for this mode (or any mode); null when he has none */
export function bossTattooCount(bossId: string, state: { inventory: { id: string; qty: number }[] } | null, mode?: string): string | null {
  const sets = tattooSetsOfBoss(bossId).filter((s) => !mode || s.mode === mode);
  if (!sets.length) return null;
  const ids = sets.flatMap((s) => s.pieces.map((p) => p.id));
  const have = ids.filter((id) => (state?.inventory.find((i) => i.id === id)?.qty ?? 0) > 0).length;
  return `${have}/${ids.length}`;
}

/** "x/N": how many of a boss's things the player has opened (or owns); null when the boss has none */
export function bossItemsCount(boss: { wear?: { items: string[] } }, state: { unlocks?: string[]; inventory: { id: string; qty: number }[] } | null): string | null {
  if (!boss.wear?.items.length) return null;
  const have = boss.wear.items.filter((id) => state?.unlocks?.includes(id) || (state?.inventory.find((i) => i.id === id)?.qty ?? 0) > 0).length;
  return `${have}/${boss.wear.items.length}`;
}

/** What was gained or will be: pictures with «×N» at their corner (`times`, the default) or «+N» after them. */
export function GainLine({ r, size = 26, times = true, side = false, extra }: { r: Reward | Granted | null | undefined; size?: number; times?: boolean; side?: boolean; extra?: ReactNode }) {
  if (!r) return null;
  if (side) times = true;
  const sz = times && !side ? Math.max(size, CORNER_MIN) : size;
  const n = (v: string) => (times ? <span className="num rc-n">×{v}</span> : <>+{v}</>);
  return (
    <span className={`gain-line${side ? " rc-side" : times ? " rc-times" : ""}`}>
      {(r.items ?? []).map((it) => (
        <span key={it.id} className="gain" title={itemById(it.id)?.name}><ItemArt id={it.id} size={sz} />{n(full(it.qty))}</span>
      ))}
      {Object.entries(r.currencies ?? {}).map(([c, v]) => (v ? (
        <span key={c} className="gain" title={CURRENCY_DEFS[c as Currency]?.name ?? c}><Icon name={c} size={sz} />{n(money(c as Currency, v))}</span>
      ) : null))}
      {!!r.energy && <span className="gain" title="Энергия"><Icon name="energy" size={sz} />{n(full(r.energy))}</span>}
      {!!r.xp && <span className="gain" title="Авторитет"><Icon name="xp" size={sz} />{n(full(r.xp))}</span>}
      {!!r.achPoints && <span className="gain" title="Очки достижений"><Icon name="sun" size={sz} />{n(full(r.achPoints))}</span>}
      {extra}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="panel center muted" style={{ padding: 22 }}>{children}</div>;
}

/** an on/off switch (automation toggles): a pill with a sliding knob; `children` — what it says next to it */
export function Toggle({ on, onChange, disabled, title, children }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string; children?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`toggle ${on ? "on" : ""}`} disabled={disabled} title={title}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(!on); }}>
      <span className="toggle-track"><span className="toggle-knob" /></span>
      {children && <span className="toggle-label">{children}</span>}
    </button>
  );
}
