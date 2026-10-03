"use client";
import { useEffect, useRef, useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { RewardChips } from "../ui.tsx";
import { clock } from "../format.ts";
import { haptic } from "../telegram.ts";
import { SLOT_OUTCOMES, SLOT_SYMBOLS, type SlotSymbol } from "../../content/slots.ts";
import type { Granted } from "../api.ts";

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

const STRIP: SlotSymbol[] = [...SLOT_SYMBOLS, ...SLOT_SYMBOLS];

interface Spin { outcome: string; kind: "jackpot" | "triple" | "pair" | "miss"; title: string; reels: SlotSymbol[]; reward: Granted | null; left: number }

export function SlotMachine() {
  const { state, act } = useGame();
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
    const r = await act<Spin>("slots_spin");
    if (!r) {
      setSpinning([false, false, false]);
      return;
    }
    // reels stop one by one, the result shows after the last one
    const wait = Math.max(0, 700 - (Date.now() - started));
    [0, 1, 2].forEach((i) => {
      timers.current.push(
        setTimeout(() => {
          setReels((old) => old.map((x, k) => (k === i ? r.reels[i] : x)));
          setSpinning((old) => old.map((x, k) => (k === i ? false : x)));
          haptic.tap();
          if (i === 2) {
            setResult(r);
            if (r.kind !== "miss") haptic.ok();
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
