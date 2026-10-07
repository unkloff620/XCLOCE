"use client";
import { useEffect, useRef, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { RewardChips } from "../ui.tsx";
import { clock } from "../format.ts";
import { sfx } from "../sound.ts";
import { haptic } from "../telegram.ts";
import { SLOT_OUTCOMES, SLOT_SYMBOLS, type SlotSymbol } from "../../content/slots.ts";
import { api, type GameState, type Granted } from "../api.ts";

const OL = "#140d24";

/** Big red "7" with an outline and a shine. */
function Seven({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M12 10 H54 V20 L32 58 H18 L39 21 H12 Z" fill="#ff3b5c" stroke={OL} strokeWidth="4" strokeLinejoin="round" />
      <path d="M16 14 H48" stroke="#ffd1da" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

/** BAR: a black bar plate with the word on it */
function Bar({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect x="5" y="19" width="54" height="26" rx="5" fill="#1b1b22" stroke={OL} strokeWidth="4" />
      <rect x="9" y="23" width="46" height="18" rx="3" fill="none" stroke="#ffd23f" strokeWidth="2" />
      <text x="32" y="38.5" textAnchor="middle" fontSize="15" fontWeight="900" fill="#ffd23f" fontFamily="var(--font-display), sans-serif" letterSpacing="1">BAR</text>
    </svg>
  );
}
function Bell({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M32 8 C20 8 16 20 16 32 C16 40 12 44 8 48 H56 C52 44 48 40 48 32 C48 20 44 8 32 8 Z" fill="#ffc21a" stroke={OL} strokeWidth="4" strokeLinejoin="round" />
      <path d="M24 18 C21 22 20 28 20 34" stroke="#fff3b0" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <circle cx="32" cy="53" r="6" fill="#e08a00" stroke={OL} strokeWidth="3.5" />
      <rect x="29" y="3" width="6" height="7" rx="2" fill="#e08a00" stroke={OL} strokeWidth="3" />
    </svg>
  );
}
function Melon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M6 22 A26 26 0 0 0 58 22 Z" fill="#2fbf5a" stroke={OL} strokeWidth="4" strokeLinejoin="round" />
      <path d="M11 22 A21 21 0 0 0 53 22 Z" fill="#ff4d6d" />
      {[[22, 30], [32, 34], [42, 30], [27, 39], [37, 39]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="1.8" ry="2.8" fill="#1e1006" />)}
      <path d="M6 22 H58" stroke={OL} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
function Grape({ size }: { size: number }) {
  const g = [[24, 22], [36, 22], [48, 22], [30, 32], [42, 32], [36, 42], [24, 32], [30, 51]];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M36 14 C36 8 40 5 46 4" stroke="#6b3b12" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M38 12 C44 8 54 10 56 16 C48 18 42 16 38 12 Z" fill="#2fbf5a" stroke={OL} strokeWidth="3" strokeLinejoin="round" />
      {g.slice(0, 7).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="7" fill="#8e44e8" stroke={OL} strokeWidth="3" />)}
      {g.slice(0, 7).map(([x, y], i) => <circle key={`h${i}`} cx={x - 2.5} cy={y - 2.5} r="1.8" fill="#d9b8ff" />)}
    </svg>
  );
}
function Lemon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M6 32 C6 20 18 12 32 12 C46 12 58 20 58 32 C58 44 46 52 32 52 C18 52 6 44 6 32 Z" fill="#ffe14a" stroke={OL} strokeWidth="4" />
      <path d="M2 32 L7 29 M62 32 L57 29" stroke={OL} strokeWidth="4" strokeLinecap="round" />
      <path d="M18 24 C22 19 28 17 34 17" stroke="#fff8c9" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
function Cherry({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path d="M20 42 C22 28 30 16 42 8 M44 42 C42 28 42 18 42 8" stroke="#3f7a1e" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M42 8 C48 4 56 6 58 12 C52 14 46 12 42 8 Z" fill="#2fbf5a" stroke={OL} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="19" cy="46" r="12" fill="#e8173c" stroke={OL} strokeWidth="4" />
      <circle cx="45" cy="46" r="12" fill="#e8173c" stroke={OL} strokeWidth="4" />
      <circle cx="15" cy="42" r="3" fill="#ffb3c1" />
      <circle cx="41" cy="42" r="3" fill="#ffb3c1" />
    </svg>
  );
}

export function SlotSymbolArt({ s, size = 44 }: { s: SlotSymbol; size?: number }) {
  switch (s) {
    case "seven": return <Seven size={size} />;
    case "bar": return <Bar size={size} />;
    case "bell": return <Bell size={size} />;
    case "melon": return <Melon size={size} />;
    case "grape": return <Grape size={size} />;
    case "lemon": return <Lemon size={size} />;
    case "cherry": return <Cherry size={size} />;
  }
}

/** The machine as it stands in the yard (button picture). */
export function SlotCabinet() {
  return (
    <svg viewBox="0 0 120 190" width="100%" height="100%" aria-hidden="true">
      <rect x="10" y="30" width="100" height="150" rx="14" fill="#7a1730" stroke={OL} strokeWidth="5" />
      <rect x="22" y="8" width="76" height="30" rx="10" fill="#ffd23f" stroke={OL} strokeWidth="5" />
      <text x="60" y="31" textAnchor="middle" fontSize="22" fontWeight="900" fill="#c2143c" fontFamily="var(--font-display), sans-serif">777</text>
      <rect x="20" y="50" width="80" height="44" rx="8" fill="#140d24" stroke="#ffd23f" strokeWidth="4" />
      {[0, 1, 2].map((i) => <rect key={i} x={26 + i * 24} y="56" width="20" height="32" rx="4" fill="#f2f3fb" stroke={OL} strokeWidth="2.5" />)}
      {[0, 1, 2].map((i) => <text key={i} x={36 + i * 24} y="80" textAnchor="middle" fontSize="20" fontWeight="900" fill="#ff3b5c" fontFamily="var(--font-display), sans-serif">7</text>)}
      <rect x="26" y="106" width="68" height="14" rx="5" fill="#4a0c1f" stroke={OL} strokeWidth="3" />
      <circle cx="44" cy="140" r="9" fill="#2ee88a" stroke={OL} strokeWidth="3" />
      <circle cx="76" cy="140" r="9" fill="#ff4d6d" stroke={OL} strokeWidth="3" />
      <rect x="30" y="158" width="60" height="12" rx="4" fill="#2a0614" stroke={OL} strokeWidth="3" />
      <path d="M110 70 H116 V36" stroke={OL} strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M110 70 H116 V36" stroke="#c9ceea" strokeWidth="4" strokeLinecap="round" fill="none" />
      <circle cx="116" cy="30" r="9" fill="#ff4d6d" stroke={OL} strokeWidth="3.5" />
      {[0, 1, 2, 3, 4].map((i) => <circle key={i} className="bulb" cx={20 + i * 20} cy="44" r="3.5" fill="#ffd23f" style={{ animationDelay: `${i * 0.15}s` }} />)}
    </svg>
  );
}

const STRIP: SlotSymbol[] = [...SLOT_SYMBOLS, ...SLOT_SYMBOLS];

interface Spin { outcome: string; kind: "jackpot" | "triple" | "pair" | "miss"; title: string; reels: SlotSymbol[]; reward: Granted | null; left: number }

export function SlotMachine() {
  const { state, setState, toast } = useGame();
  const now = useNow();
  const [reels, setReels] = useState<SlotSymbol[]>(["seven", "seven", "seven"]);
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false]);
  const [result, setResult] = useState<Spin | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  if (!state) return null;
  const s = state.slots;
  const busy = spinning.some(Boolean);
  const cooling = s.left < 1;

  const spin = async () => {
    if (busy || cooling) return;
    haptic.tap();
    setResult(null);
    setSpinning([true, true, true]);
    const started = Date.now();
    let r: Spin;
    let fresh: GameState;
    try {
      const res = await api.action<Spin>("slots_spin");
      r = res.result;
      fresh = res.state;
    } catch (e) {
      haptic.err();
      sfx("error");
      toast(e instanceof Error ? e.message : "Автомат заело", "err");
      setSpinning([false, false, false]);
      return;
    }
    const spinRes = r;
    const st = fresh;
    // reels stop one by one, the result shows after the last one
    const wait = Math.max(0, 700 - (Date.now() - started));
    [0, 1, 2].forEach((i) => {
      timers.current.push(
        setTimeout(() => {
          setReels((old) => old.map((x, k) => (k === i ? spinRes.reels[i] : x)));
          setSpinning((old) => old.map((x, k) => (k === i ? false : x)));
          haptic.tap();
          sfx("tap");
          if (i === 2) {
            setResult(spinRes);
            setState(st); // the balance changes only when the last reel stops
            if (spinRes.kind === "jackpot") {
              haptic.big();
              sfx("levelup");
            } else if (spinRes.kind !== "miss") {
              haptic.ok();
              sfx("reward");
            }
          }
        }, wait + i * 380),
      );
    });
  };

  const win = result && result.kind !== "miss";
  return (
    <div className={`slots ${result?.kind === "jackpot" ? "jackpot" : ""}`}>
      <div className="slots-top">
        <span className="slots-lights" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</span>
        <b className="display slots-title">777</b>
        <span className="tiny slots-sub">7 · BAR · ФРУКТЫ</span>
      </div>
      <div className="slots-window">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`reel ${spinning[i] ? "spin" : "stop"} ${win && result?.reels[i] === reels[i] ? "hit" : ""}`}>
            {spinning[i] ? (
              <div className="reel-strip" style={{ animationDelay: `${-i * 0.11}s` }}>
                {STRIP.map((x, k) => <span key={k}><SlotSymbolArt s={x} size={38} /></span>)}
              </div>
            ) : (
              <span className="reel-face"><SlotSymbolArt s={reels[i]} size={44} /></span>
            )}
          </div>
        ))}
        <i className="slots-line" aria-hidden="true" />
      </div>
      <div className="slots-result" aria-live="polite">
        {result ? (
          <>
            <b className={`display ${win ? "win" : "miss"}`}>{result.title}</b>
            {result.reward && <RewardChips r={result.reward} size={15} />}
          </>
        ) : (
          <span className="tiny muted">Удачи!</span>
        )}
      </div>
      <button className={`btn big block ${cooling ? "dark" : "red"} slots-btn`} disabled={busy || cooling} onClick={spin}>
        {busy ? "Крутится…" : cooling ? <>Остывает · {clock((s.nextAt ?? now) - now)}</> : "Крутить"}
      </button>
      <div className="row tiny muted" style={{ justifyContent: "space-between" }}>
        <span>Прокрутки: <b className="num" style={{ color: "var(--ink)" }}>{s.left}/{s.max}</b> в час</span>
        <details className="slots-pay">
          <summary>Выплаты</summary>
          <div className="col" style={{ gap: 4, marginTop: 6 }}>
            {SLOT_OUTCOMES.filter((o) => o.kind !== "miss").map((o) => (
              <div key={o.id} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="row" style={{ gap: 1 }}>
                  {o.triple ? [0, 1, 2].map((k) => <SlotSymbolArt key={k} s={o.triple!} size={16} />) : <span className="tiny">любые 2</span>}
                </span>
                <RewardChips r={o.reward} size={13} />
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
