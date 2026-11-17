"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useGame, useNow } from "../store.tsx";
import { type Hit, type Tray } from "../api.ts";
import { WEAPONS, itemById } from "../../content/items.ts";
import { CRAFT_WEAPONS } from "../../content/craft.ts";
import { DEFAULT_FIGHT_SLOTS, FIGHT_PACKS, FIGHT_SLOTS, type FightSlot } from "../../content/fight-slots.ts";
import { HIT_PHRASES } from "../../content/phrases.ts";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { ART_VER } from "../preload.ts";
import { clock, full, short } from "../format.ts";
import { haptic } from "../telegram.ts";
import { weaponStats } from "../weapon-stats.ts";

/*
 * The fight's weapons: six square cells under the boss (FightTray), set up in a panel that slides up from the bottom
 * (WeaponPanel: drag a weapon — a single one or a pack of 10…1000 — from the list onto a cell; «Усиление» switches the
 * clan's boost). The side panels: «Топ» from the left, «Инфо» (who hit with what) from the right.
 */

/** the pack pictures drawn so far (public/assets/items/packs/<weapon>-<n>.webp); the others show the weapon with ×n */
const PACK_ART = new Set<string>([]);

export function PackArt({ id, n, size }: { id: string; n: number; size: number }) {
  if (n > 1 && PACK_ART.has(`${id}-${n}`)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="pack-art" src={`/assets/items/packs/${id}-${n}.webp?v=${ART_VER.items}`} width={size} height={size} alt="" draggable={false} />;
  }
  return <ItemArt id={id} size={size} />;
}

export const slotsOf = (s: ReturnType<typeof useGame>["state"]): FightSlot[] => s?.player.fightSlots ?? DEFAULT_FIGHT_SLOTS;

/** the six cells: a tap hits with that weapon (the pack's count, or what is left of it) */
export function FightTray({ slots, tray, onHit, onCooldown, onBuy, disabled }: {
  slots: FightSlot[]; tray: Tray[]; onHit: (id: string, n: number) => void; onCooldown: (name: string, leftMs: number, id: string) => void; onBuy: () => void; disabled: boolean;
}) {
  const { state } = useGame();
  const now = useNow();
  return (
    <div className="ftray">
      {Array.from({ length: FIGHT_SLOTS }, (_, i) => {
        const s = slots[i];
        const w = s ? itemById(s.w) : null;
        if (!s || !w?.weapon) return <span key={i} className="fcell empty" aria-hidden="true" />;
        const t = tray.find((x) => x.id === w.id);
        const qty = t?.qty ?? 0;
        const perm = w.weapon.kind === "permanent";
        const n = perm ? 1 : Math.max(1, Math.min(s.n, qty));
        const cd = t?.readyAt && t.readyAt > now ? t.readyAt - now : 0;
        const total = (w.weapon.cooldownMin ?? 0) * 60_000;
        const done = cd && total ? Math.max(0, Math.min(1, 1 - cd / total)) : 1;
        const none = !perm && qty <= 0;
        return (
          <button key={i} type="button" className={`fcell rar-${w.rarity} ${none ? "none" : ""} ${cd ? "cd" : ""}`} disabled={disabled} aria-disabled={!!cd}
            onClick={() => (cd ? onCooldown(w.name, cd, w.id) : none ? onBuy() : onHit(w.id, n))} title={`${w.name}${s.n > 1 ? ` ×${s.n}` : ""}: ${w.weapon.action}`}>
            <PackArt id={w.id} n={s.n} size={44} />
            {s.n > 1 && <b className="fcell-pack num">{s.n}шт</b>}
            <span className="fcell-dmg num">−{short(weaponStats(state, w.id).damage * n)}</span>
            {!perm && <span className="fcell-qty num">x{qty.toLocaleString("ru-RU")}</span>}
            {cd > 0 && <span className="w-cd" style={{ ["--p" as string]: `${done * 360}deg` }} />}
          </button>
        );
      })}
    </div>
  );
}

/** the panel from the bottom: the six cells on top, the weapons (Атака) or the boosts (Усиление) below */
export function WeaponPanel({ tray, onClose }: { tray: Tray[]; onClose: () => void }) {
  const { state, act } = useGame();
  const [slots, setSlots] = useState<FightSlot[]>(() => slotsOf(state).slice());
  const [tab, setTab] = useState<"attack" | "boost">("attack");
  const [pick, setPick] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ w: string; n: number; x: number; y: number; moved: boolean } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const boost = state?.player.boost;

  const put = (i: number, s: FightSlot) => {
    setSlots((old) => {
      const next = old.slice();
      // the same weapon and pack in another cell moves here
      if (s) next.forEach((x, k) => { if (x && x.w === s.w && x.n === s.n) next[k] = null; });
      next[i] = s;
      return next;
    });
    haptic.tap();
  };
  const close = () => {
    if (closing) return;
    setClosing(true);
    const before = JSON.stringify(slotsOf(state));
    if (JSON.stringify(slots) !== before) void act("fight_slots", { slots });
    setTimeout(onClose, 220);
  };
  // a dragged weapon: follows the finger; let go over a cell — it goes there
  useEffect(() => {
    if (!drag) return;
    const cellAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest("[data-cell]") as HTMLElement | null;
      return el ? Number(el.dataset.cell) : null;
    };
    const move = (e: PointerEvent) => {
      const s = start.current;
      const moved = drag.moved || (!!s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8);
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, moved } : d));
      setOver(moved ? cellAt(e.clientX, e.clientY) : null);
    };
    const up = (e: PointerEvent) => {
      const cell = cellAt(e.clientX, e.clientY);
      if (drag.moved && cell !== null) put(cell, { w: drag.w, n: drag.n });
      else if (!drag.moved) {
        // a tap: into the chosen cell, else the first empty one, else the last
        const target = pick ?? (slots.findIndex((x) => !x) >= 0 ? slots.findIndex((x) => !x) : FIGHT_SLOTS - 1);
        put(target, { w: drag.w, n: drag.n });
        setPick(null);
      }
      setDrag(null);
      setOver(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, pick, slots]); // eslint-disable-line react-hooks/exhaustive-deps

  const qtyOf = (id: string) => tray.find((x) => x.id === id)?.qty ?? 0;
  const weapons = [...WEAPONS, ...CRAFT_WEAPONS.filter((c) => qtyOf(c.id) > 0).map((c) => itemById(c.id)!)];
  const tiles = weapons.flatMap((w) => (w.weapon!.kind === "consumable" ? FIGHT_PACKS.map((n) => ({ w, n })) : [{ w, n: 1 }]));

  return createPortal(
    <div className={`wpanel-back ${closing ? "out" : ""}`} onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="wpanel" role="dialog" aria-label="Оружие в бою">
        <div className="wpanel-grip" aria-hidden="true" />
        <div className="wpanel-cells">
          {slots.map((s, i) => {
            const w = s ? itemById(s.w) : null;
            return (
              <button key={i} type="button" data-cell={i} className={`fcell ${w ? `rar-${w.rarity}` : "empty"} ${pick === i ? "pick" : ""} ${over === i ? "over" : ""}`}
                onClick={() => (s ? (put(i, null), setPick(i)) : setPick(pick === i ? null : i))}
                title={s ? "Нажми, чтобы убрать" : "Выбери ячейку, потом оружие"}>
                {s && w ? (
                  <>
                    <PackArt id={w.id} n={s.n} size={40} />
                    {s.n > 1 && <b className="fcell-pack num">{s.n}шт</b>}
                    <i className="fcell-x" aria-hidden="true">×</i>
                  </>
                ) : <span className="fcell-n">{i + 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="wpanel-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "attack"} className={tab === "attack" ? "on" : ""} onClick={() => setTab("attack")}>Атака</button>
          <button type="button" role="tab" aria-selected={tab === "boost"} className={tab === "boost" ? "on" : ""} onClick={() => setTab("boost")}>Усиление</button>
        </div>
        {tab === "attack" ? (
          <>
            <p className="wpanel-hint">Перетащи оружие в ячейку (или нажми на ячейку, потом на оружие). Нажатие на занятую ячейку — убрать.</p>
            <div className="wpanel-list">
              {tiles.map(({ w, n }) => {
                const perm = w.weapon!.kind === "permanent";
                const have = perm ? 1 : qtyOf(w.id);
                const used = slots.some((s) => s && s.w === w.id && s.n === n);
                return (
                  <button key={`${w.id}-${n}`} type="button" className={`fcell rar-${w.rarity} ${!perm && have < n ? "short" : ""} ${used ? "used" : ""}`}
                    onPointerDown={(e) => { e.preventDefault(); start.current = { x: e.clientX, y: e.clientY }; setDrag({ w: w.id, n, x: e.clientX, y: e.clientY, moved: false }); }}
                    title={`${w.name}${n > 1 ? ` — пачка ${n}` : ""}${!perm ? ` (есть ${full(have)})` : ""}`}>
                    <PackArt id={w.id} n={n} size={40} />
                    {n > 1 && <b className="fcell-pack num">{n}шт</b>}
                    {!perm && <span className="fcell-qty num">x{have.toLocaleString("ru-RU")}</span>}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="wpanel-boost">
            {!boost ? (
              <p className="wpanel-hint">Усилений пока нет. Клан на 1 месте «Сходняка» получает усиление оружия на неделю: Rug Pull Gun или Видеокарта.</p>
            ) : boost.weapon === null ? (
              <p className="wpanel-hint">Клан взял 1 место «Сходняка»! Выбери оружие для усиления на странице Сходняка в клане.</p>
            ) : (
              <div className={`wboost ${boost.on ? "on" : ""}`}>
                <ItemArt id={boost.weapon} size={48} />
                <span className="wboost-t">
                  <b>{itemById(boost.weapon)?.name}: +{boost.pct}% урона</b>
                  <small>Сходняк · ещё {clock(Math.max(0, (boost.until ?? 0) - Date.now()))}</small>
                </span>
                <button type="button" className={`btn sm ${boost.on ? "gold" : "dark"}`} onClick={() => act("shod_boost_on", { on: !boost.on }, boost.on ? "Усиление выключено" : "Усиление включено")}>
                  {boost.on ? "Вкл" : "Выкл"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {drag?.moved && (
        <span className="wdrag" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <PackArt id={drag.w} n={drag.n} size={48} />
          {drag.n > 1 && <b className="fcell-pack num">{drag.n}шт</b>}
        </span>
      )}
    </div>,
    document.body,
  );
}

/** the boosts in use, top left of the fight: a square with the weapon and +N% (the clan's «Сходняк» boost now; timed and
 * permanent ones later) */
export function BoostIcons() {
  const { state } = useGame();
  const b = state?.player.boost;
  // just under the boss's time bar
  const [top, setTop] = useState<number | null>(null);
  const on = !!(b && b.weapon && b.on);
  useLayoutEffect(() => {
    if (!on) return;
    const t = document.querySelector(".arena-time")?.getBoundingClientRect().bottom;
    if (t) setTop(t + 8);
  }, [on]);
  if (!b || !b.weapon || !b.on) return null;
  return (
    <div className="fboosts" style={top !== null ? { top } : undefined}>
      <span className="fboost" title={`${itemById(b.weapon)?.name}: +${b.pct}% урона (Сходняк), ещё ${clock(Math.max(0, (b.until ?? 0) - Date.now()))}`}>
        <ItemArt id={b.weapon} size={28} />
        <b className="num">+{b.pct}%</b>
      </span>
    </div>
  );
}

/** a side panel (half transparent) sliding in from the left («Топ») or the right («Инфо»); a tap outside closes it */
export function SidePanel({ side, title, onClose, children }: { side: "l" | "r"; title: string; onClose: () => void; children: React.ReactNode }) {
  const [closing, setClosing] = useState(false);
  const close = () => { if (!closing) { setClosing(true); setTimeout(onClose, 220); } };
  // between the boss's bars (HP, time) and the weapons: the panel never covers them
  const [box, setBox] = useState<{ top: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    const top = document.querySelector(".arena-time")?.getBoundingClientRect().bottom;
    const bot = document.querySelector(".fight-bottom")?.getBoundingClientRect().top;
    if (top && bot && bot - top > 120) setBox({ top: top + 6, bottom: window.innerHeight - bot + 6 });
  }, []);
  return createPortal(
    <div className={`spanel-back ${closing ? "out" : ""}`} onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={`spanel ${side}`} role="dialog" aria-label={title} style={box ? { top: box.top, bottom: box.bottom } : undefined}>
        <b className="spanel-h display">{title}</b>
        <div className="spanel-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function TopList({ rows, me }: { rows: { playerId: number; name: string; damage: number }[]; me?: number }) {
  if (!rows.length) return <p className="spanel-empty">В этом бою ещё никто не бил. Будь первым.</p>;
  return (
    <div className="spanel-list">
      {rows.map((t, i) => (
        <Link key={t.playerId} href={`/profile?id=${t.playerId}`} className={`spanel-row ${t.playerId === me ? "me" : ""}`}>
          <b className="spanel-n num">{i + 1}</b>
          <span className="grow ellipsis">{t.name}</span>
          <b className="num">{short(t.damage)}</b>
        </Link>
      ))}
    </div>
  );
}

/** «Инфо»: every hit of the fight, the newest on top — who, with what (and how many), how much */
export function HitLog({ hits }: { hits: Hit[] }) {
  if (!hits.length) return <p className="spanel-empty">Ударов пока нет.</p>;
  return (
    <div className="spanel-list">
      {hits.map((h) => (
        <div key={h.seq} className="spanel-row hit">
          <span className="spanel-who ellipsis"><b>{h.name}</b><small className="ellipsis">{HIT_PHRASES[h.weapon]?.[h.phrase] ?? ""}</small></span>
          <span className="spanel-w"><ItemArt id={h.weapon} size={22} />{(h.count ?? 1) > 1 && <small className="num">×{h.count}</small>}</span>
          <b className="num dmg">−{short(h.damage)}{h.crit && <i> КРИТ</i>}</b>
        </div>
      ))}
    </div>
  );
}
