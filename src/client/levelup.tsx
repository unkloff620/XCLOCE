"use client";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useGame } from "./store.tsx";
import { sfx } from "./sound.ts";
import { haptic } from "./telegram.ts";
import { full } from "./format.ts";

/** Full-screen moment for a new level: rays, the new number flying in, confetti; a tap closes it. */
export function LevelUpOverlay() {
  const { levelUp, clearLevelUp, state } = useGame();
  useEffect(() => {
    if (!levelUp) return;
    sfx("levelup");
    haptic.big();
  }, [levelUp]);
  // confetti: fixed per opening so re-renders do not reshuffle it
  const bits = useMemo(
    () =>
      Array.from({ length: 34 }, (_, k) => ({
        k,
        x: Math.round(Math.random() * 100),
        d: (Math.random() * 0.8).toFixed(2),
        t: (1.8 + Math.random() * 1.6).toFixed(2),
        r: Math.round(Math.random() * 360),
        c: ["#ffcc33", "#ff4d6d", "#3ddc84", "#4da3ff", "#b06bff", "#ff9a2e"][k % 6],
      })),
    [levelUp?.to], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!levelUp || !state) return null;
  const p = state.player;
  const jump = levelUp.to - levelUp.from;
  return createPortal(
    <div className="lvlup" role="dialog" aria-label={`Новый уровень ${levelUp.to}`} onClick={clearLevelUp}>
      <div className="lvlup-rays" aria-hidden="true" />
      <div className="lvlup-confetti" aria-hidden="true">
        {bits.map((b) => <i key={b.k} style={{ left: `${b.x}%`, background: b.c, animationDelay: `${b.d}s`, animationDuration: `${b.t}s`, ["--r" as string]: `${b.r}deg` }} />)}
      </div>
      <div className="lvlup-body">
        <div className="lvlup-kicker display">Новый уровень!</div>
        <div className="lvlup-badge display">
          <small>LVL</small>
          <b className="num">{levelUp.to}</b>
        </div>
        {jump > 1 && <div className="lvlup-sub">Сразу +{jump} уровня — мощно!</div>}
        <div className="lvlup-sub">
          {p.levelNeed ? <>До {p.level + 1} уровня: <b className="num">{full(Math.max(0, p.levelNeed - p.levelXp))}</b> авторитета</> : <>Максимальный уровень!</>}
        </div>
        <button className="btn gold big" onClick={clearLevelUp}>Круто!</button>
      </div>
    </div>,
    document.body,
  );
}
