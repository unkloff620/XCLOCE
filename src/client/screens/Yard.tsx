"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { api, type YardItem, type YardView } from "../api.ts";
import { itemById } from "../../shared/items.ts";
import { ItemIcon } from "../art/items.tsx";
import { haptic } from "../telegram.ts";
import { skinUrl } from "../../shared/skin.ts";

/** Courtyard: a new item appears every 5 s (beer, energy drink, coins, rarely a weapon) and lies for 30 s. */
export function YardScreen() {
  const { act, toast } = useGame();
  const [view, setView] = useState<YardView | null>(null);
  const [gone, setGone] = useState<Set<number>>(new Set());
  const offset = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const v = await api.yard();
        if (!alive) return;
        offset.current = v.serverTime - Date.now();
        setView(v);
        // poll right after the next spawn
        timer = setTimeout(load, Math.max(500, v.nextAt - v.serverTime + 150));
      } catch {
        timer = setTimeout(load, 3000);
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const pick = async (it: YardItem) => {
    haptic.tap();
    setGone((g) => new Set(g).add(it.slot));
    const r = await act<{ reward: YardItem["reward"] }>("yard_pick", { slot: it.slot });
    if (!r) return;
    const w = r.reward;
    toast("ok", w.item ? `В инвентарь: ${itemById(w.item)?.name}${itemById(w.item)?.kind === "weapon" ? " — уже доступно в бою" : ""}` : `+${w.rub} ₽`);
    setView((v) => (v ? { ...v, pickedToday: v.pickedToday + 1 } : v));
  };

  const serverNow = Date.now() + offset.current;
  const items = (view?.items ?? []).filter((i) => !gone.has(i.slot));
  const limitReached = !!view && view.pickedToday >= view.limit;
  const nextIn = view ? Math.max(0, Math.ceil((view.nextAt - serverNow) / 1000)) : 0;

  return (
    <div className="screen yard-view">
      <div className="screen-title">
        <h2 className="comic">ДВОР</h2>
        <span className="muted small">Собрано сегодня: {view?.pickedToday ?? 0}/{view?.limit ?? 100}</span>
      </div>
      <div className="yard-stage">
        {skinUrl("bg-yard") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="yard-scene skin-cover" src={skinUrl("bg-yard")!} alt="" draggable={false} />
        ) : <YardScene />}
        {!limitReached && items.map((it) => {
          const ageSlots = view ? Math.floor((serverNow - it.slot * view.slotMs) / view.slotMs) : 0;
          return (
            <button key={it.slot} className={`yard-item k-${it.kind} ${ageSlots >= 4 ? "old" : ""}`} style={{ left: `${it.x}%`, top: `${it.y}%` }} onClick={() => pick(it)} aria-label="Подобрать">
              {it.kind === "weapon" && it.reward.item ? <ItemIcon id={it.reward.item} size={46} /> : <YardItemArt kind={it.kind} />}
            </button>
          );
        })}
        <div className="yard-hud comic">{limitReached ? "На сегодня всё собрано" : `Новый предмет через ${nextIn}с`}</div>
      </div>
      <div className="yard-legend">
        <span><YardItemArt kind="beer" size={26} /> Пиво (+5⚡) → инвентарь</span>
        <span><YardItemArt kind="energy" size={26} /> Энергетик (+15⚡) → инвентарь</span>
        <span><YardItemArt kind="coins" size={26} /> Мелочь 10–60 ₽ → баланс</span>
        <span>🗡 Редко оружие → инвентарь и бой</span>
      </div>
      <p className="muted small center">Каждые 5 секунд во дворе что-то появляется и лежит 30 секунд. Лимит — {view?.limit ?? 100} находок в сутки.</p>
    </div>
  );
}

export function YardItemArt({ kind, size = 44 }: { kind: YardItem["kind"]; size?: number }) {
  const up = skinUrl(`yard-${kind}`);
  // eslint-disable-next-line @next/next/no-img-element
  if (up) return <img className="skin-img" src={up} alt="" width={size} height={size} draggable={false} />;
  if (kind === "beer") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <ellipse cx="32" cy="60" rx="14" ry="3" fill="#0006" />
        <path d="M27 4h10v12q0 4 4 9 3 4 3 10v22q0 4-4 4H24q-4 0-4-4V35q0-6 3-10 4-5 4-9z" fill="#7a3d0e" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
        <rect x="26" y="2" width="12" height="6" rx="1" fill="#ffd23f" stroke="#111" strokeWidth="2.5" />
        <rect x="21" y="36" width="22" height="14" rx="2" fill="#f4e7c8" stroke="#111" strokeWidth="2" />
        <path d="M25 41h14M25 45h9" stroke="#c0392b" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M25 26q-2 6-1 18" stroke="#fff6" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "energy") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <ellipse cx="32" cy="60" rx="14" ry="3" fill="#0006" />
        <rect x="18" y="8" width="28" height="50" rx="5" fill="#1a1f2b" stroke="#111" strokeWidth="3" />
        <rect x="18" y="8" width="28" height="7" rx="3" fill="#c9d0dc" stroke="#111" strokeWidth="2.5" />
        <path d="M35 18L24 36h8l-4 16 13-20h-8z" fill="#9dff3a" stroke="#111" strokeWidth="2" strokeLinejoin="round" />
        <path d="M22 18v34" stroke="#fff4" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="56" rx="22" ry="5" fill="#0006" />
      <ellipse cx="24" cy="46" rx="14" ry="6" fill="#e0a800" stroke="#111" strokeWidth="2.5" />
      <ellipse cx="24" cy="42" rx="14" ry="6" fill="#ffd23f" stroke="#111" strokeWidth="2.5" />
      <ellipse cx="42" cy="44" rx="13" ry="5.5" fill="#c9d0dc" stroke="#111" strokeWidth="2.5" />
      <ellipse cx="34" cy="32" rx="14" ry="6" fill="#ffd23f" stroke="#111" strokeWidth="2.5" transform="rotate(-14 34 32)" />
      <text x="34" y="36" textAnchor="middle" fontSize="10" fontWeight="900" fill="#8a5a00" transform="rotate(-14 34 32)">₽</text>
    </svg>
  );
}

/** Evening courtyard of a panel block: building, garages, bench, swing, bins, tree, asphalt with a puddle. */
function YardScene() {
  return (
    <svg className="yard-scene" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="ysky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a1650" /><stop offset=".6" stopColor="#b8476b" /><stop offset="1" stopColor="#ff9f5a" /></linearGradient>
        <linearGradient id="yasph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a3f4a" /><stop offset="1" stopColor="#1f232b" /></linearGradient>
        <pattern id="yht" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1" fill="#0002" /></pattern>
      </defs>
      <rect width="400" height="260" fill="url(#ysky)" />
      <circle cx="320" cy="70" r="26" fill="#ffe9a8" opacity=".9" />
      {/* panel block */}
      <rect x="20" y="40" width="250" height="210" fill="#a7a9b4" stroke="#111" strokeWidth="4" />
      <rect x="20" y="40" width="250" height="210" fill="url(#yht)" />
      {Array.from({ length: 5 }).map((_, r) =>
        Array.from({ length: 7 }).map((__, c) => {
          const lit = (r * 7 + c * 3) % 5 < 2;
          return <rect key={`${r}-${c}`} x={34 + c * 33} y={54 + r * 38} width="20" height="24" fill={lit ? "#ffd86b" : "#3a4458"} stroke="#111" strokeWidth="2" />;
        }),
      )}
      <rect x="128" y="206" width="34" height="44" fill="#5b3a1e" stroke="#111" strokeWidth="3" />
      <rect x="120" y="198" width="50" height="8" fill="#6d7280" stroke="#111" strokeWidth="2.5" />
      {/* garages */}
      <g stroke="#111" strokeWidth="3">
        <rect x="280" y="190" width="56" height="60" fill="#6b7a5a" />
        <rect x="338" y="190" width="56" height="60" fill="#7a5a5a" />
        <path d="M288 204h40M288 214h40M288 224h40M288 234h40M346 204h40M346 214h40M346 224h40M346 234h40" strokeWidth="2" />
      </g>
      <text x="300" y="183" fontSize="14" fontWeight="900" fill="#9dff3a" stroke="#111" strokeWidth="1" transform="rotate(-4 300 183)">HODL</text>
      {/* ground */}
      <rect y="250" width="400" height="250" fill="url(#yasph)" />
      <rect y="250" width="400" height="12" fill="#585e6a" stroke="#111" strokeWidth="3" />
      <ellipse cx="250" cy="420" rx="70" ry="16" fill="#2a3a5a" opacity=".8" />
      <ellipse cx="240" cy="416" rx="40" ry="6" fill="#ff9f5a" opacity=".25" />
      <path d="M40 330l40 10M300 460l60-14M120 470l30 8" stroke="#0004" strokeWidth="3" />
      {/* tree */}
      <rect x="352" y="250" width="12" height="70" fill="#5b3a1e" stroke="#111" strokeWidth="3" />
      <circle cx="358" cy="236" r="40" fill="#2f8f3a" stroke="#111" strokeWidth="4" />
      <circle cx="340" cy="250" r="22" fill="#3aa847" stroke="#111" strokeWidth="3" />
      {/* bench */}
      <g stroke="#111" strokeWidth="3">
        <rect x="40" y="282" width="90" height="10" fill="#c8722b" />
        <rect x="40" y="266" width="90" height="10" fill="#c8722b" />
        <path d="M48 292v18M122 292v18" />
      </g>
      {/* swing */}
      <g stroke="#111" strokeWidth="4" fill="none">
        <path d="M170 262l14-40h50l14 40" />
        <path d="M200 222v34M220 222v34" strokeWidth="2" />
      </g>
      <rect x="194" y="256" width="32" height="6" fill="#ff3b5c" stroke="#111" strokeWidth="2.5" />
      {/* bins */}
      <g stroke="#111" strokeWidth="3">
        <rect x="290" y="268" width="30" height="40" fill="#2f6f9a" />
        <rect x="324" y="272" width="30" height="36" fill="#2f8f3a" />
        <rect x="286" y="262" width="38" height="8" fill="#245a7c" />
      </g>
    </svg>
  );
}
