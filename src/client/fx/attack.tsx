"use client";
/*
 * Short attack animations on the boss arena (≤ 1 s each, they overlap, so the player can hit again right away).
 * Every weapon has its own: the fist punches up from below, the mouse flies on its cable, the red candle crashes from above, the keyboard spins
 * and sheds keys, the GPU tumbles and smokes, the Rug Pull Gun fires and the floor disappears under the boss.
 */
import { useCallback, useRef, useState } from "react";
import { ItemArt } from "../art/items.tsx";
import { weaponById } from "../../content/items.ts";

export interface Fx {
  id: number;
  weapon: string;
  damage: number;
  phrase: string;
  mine: boolean;
  /** horizontal start offset for other players' hits, so overlapping hits do not stack */
  lane: number;
}

const IMPACT_MS = 430;

export function useFx(onImpact: (fx: Fx) => void) {
  const [list, setList] = useState<Fx[]>([]);
  const seq = useRef(0);
  const play = useCallback(
    (weapon: string, damage: number, phrase: string, mine: boolean) => {
      const fx: Fx = { id: ++seq.current, weapon, damage, phrase, mine, lane: (seq.current % 5) - 2 };
      setList((l) => [...l.slice(-7), fx]);
      setTimeout(() => onImpact(fx), IMPACT_MS);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== fx.id)), 1500);
    },
    [onImpact],
  );
  const layer = (
    <div className="fx-layer" aria-hidden="true">
      {list.map((f) => (
        <FxItem key={f.id} fx={f} />
      ))}
    </div>
  );
  return { play, layer };
}

function FxItem({ fx }: { fx: Fx }) {
  const anim = weaponById(fx.weapon)?.weapon.animation ?? "fist";
  const style = { ["--lane" as string]: fx.lane } as React.CSSProperties;
  return (
    <div className={`fx fx-${anim} ${fx.mine ? "mine" : "other"}`} style={style}>
      {anim === "fist" && (
        <>
          <div className="fx-proj"><ItemArt id="fist" size={110} /></div>
          <div className="fx-pow" />
        </>
      )}
      {anim === "mouse" && (
        <>
          <svg className="fx-cable" viewBox="0 0 200 300" preserveAspectRatio="none">
            <path d="M100 300 C40 220 160 140 100 40" fill="none" stroke="#e8ebff" strokeWidth="4" strokeDasharray="8 6" />
          </svg>
          <div className="fx-proj"><ItemArt id="mouse" size={64} /></div>
        </>
      )}
      {anim === "candle" && (
        <>
          <div className="fx-proj"><ItemArt id="red-candle" size={120} /></div>
          <div className="fx-tag display">−{fx.damage} MC</div>
        </>
      )}
      {anim === "keyboard" && (
        <>
          <div className="fx-proj"><ItemArt id="keyboard" size={92} /></div>
          {[0, 1, 2, 3, 4, 5].map((k) => <i key={k} className={`fx-key k${k}`} />)}
        </>
      )}
      {anim === "gpu" && (
        <>
          <div className="fx-proj"><ItemArt id="gpu" size={96} /></div>
          <div className="fx-smoke" />
        </>
      )}
      {anim === "rugpull" && (
        <>
          <div className="fx-gun"><ItemArt id="rug-pull-gun" size={90} /></div>
          <div className="fx-flash" />
          <div className="fx-rug" />
          <div className="fx-tag display">ЛИКВИДНОСТЬ −100%</div>
        </>
      )}
      <div className="fx-dmg display">−{fx.damage}</div>
      {fx.mine && fx.phrase && <div className="fx-phrase">{fx.phrase}</div>}
    </div>
  );
}
