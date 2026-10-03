"use client";
import { useEffect, useRef, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { RewardChips } from "../ui.tsx";
import { clock } from "../format.ts";
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

export function SlotSymbolArt({ s, size = 44 }: { s: SlotSymbol; size?: number }) {
  switch (s) {
    case "seven": return <Seven size={size} />;
    case "btc": return <Icon name="BTC" size={size} />;
    case "sol": return <Icon name="SOL" size={size} />;
    case "usd": return <Icon name="USD" size={size} />;
    case "rub": return <Icon name="RUB" size={size} />;
    case "keyboard": return <ItemArt id="keyboard" size={size} />;
    case "candle": return <ItemArt id="red-candle" size={size} />;
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
          if (i === 2) {
            setResult(spinRes);
            setState(st); // the balance changes only when the last reel stops
            if (spinRes.kind !== "miss") haptic.ok();
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
        <span className="tiny slots-sub">ИГРОВОЙ АВТОМАТ</span>
      </div>
      <div className="slots-window">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`reel ${spinning[i] ? "spin" : "stop"} ${win && result?.reels[i] === reels[i] ? "hit" : ""}`}>
            {spinning[i] ? (
              <div className="reel-strip" style={{ animationDelay: `${-i * 0.11}s` }}>
                {STRIP.map((x, k) => <span key={k}><SlotSymbolArt s={x} size={46} /></span>)}
              </div>
            ) : (
              <span className="reel-face"><SlotSymbolArt s={reels[i]} size={52} /></span>
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
          <span className="tiny muted">Три одинаковых — приз. 777 — куш: деньги и оружие.</span>
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
