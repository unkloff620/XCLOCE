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
  // the bat, the eye poke (mouse) and the kick (red-candle) fly like the fist, each with its own picture
  const anim0 = weaponById(fx.weapon)?.weapon.animation ?? "fist";
  const anim = anim0 === "bat" || anim0 === "mouse" || anim0 === "candle" ? "fist" : anim0;
  const pic = anim0 === "bat" ? "bat" : anim0 === "mouse" ? "mouse" : anim0 === "candle" ? "red-candle" : "fist";
  const style = { ["--lane" as string]: fx.lane } as React.CSSProperties;
  return (
    <div className={`fx fx-${anim} ${fx.mine ? "mine" : "other"}`} style={style}>
      {anim === "fist" && (
        <>
          <div className="fx-proj"><ItemArt id={pic} size={110} /></div>
          <div className="fx-pow" />
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
          {/* the arm with the gun slides in from the left, fires (a flash at the muzzle, the recoil, bills flying out), and goes */}
          <div className="fx-arm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/fx/rugpull-arm.webp" alt="" draggable={false} />
            <i className="fx-muzzle" />
            {[0, 1, 2, 3].map((k) => <i key={k} className={`fx-bill b${k}`} />)}
          </div>
          {/* the striped rug pulled from under the boss — removed (the user 2026-11-20) */}
        </>
      )}
      {anim === "flame" && (
        <>
          {/* the flamethrower comes in from the left and pours a jet of fire at the boss, sparks fly, the air goes red */}
          <div className="fx-thrower"><ItemArt id={fx.weapon} size={96} /></div>
          <div className="fx-jet"><i /><i /><i /></div>
          {[0, 1, 2, 3, 4, 5].map((k) => <i key={k} className={`fx-ember e${k}`} />)}
          <div className="fx-heat" />
        </>
      )}
      <div className="fx-dmg display">−{fx.damage}</div>
      {fx.mine && fx.phrase && <div className="fx-phrase">{fx.phrase}</div>}
    </div>
  );
}
