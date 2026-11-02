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
    // the background of a new level, the voice over it
    sfx("levelupbg");
    haptic.big();
    // after the fanfare: a voice (one of two at random)
    const t = setTimeout(() => sfx("lvlvoice"), 750);
    return () => clearTimeout(t);
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
  const left = p.levelNeed ? Math.max(0, p.levelNeed - p.levelXp) : 0;
  return createPortal(
    <div className="lvlup" role="dialog" aria-label={`Новый уровень ${levelUp.to}`} onClick={clearLevelUp}>
      <div className="lvlup-confetti" aria-hidden="true">
        {bits.map((b) => <i key={b.k} style={{ left: `${b.x}%`, background: b.c, animationDelay: `${b.d}s`, animationDuration: `${b.t}s`, ["--r" as string]: `${b.r}deg` }} />)}
      </div>
      <div className="lvlup-body">
        {/* a sheet of the district newspaper (tools/ui/build-levelup-paper.py); the box in its middle is written in by pen */}
        <div className="lvl-paper">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lvl-paper-bg" src="/assets/ui/levelup-paper.webp" alt="" draggable={false} />
          <div className="lvl-note">
            <span className="lvl-hand lvl-w1">Поздравляю!</span>
            <span className="lvl-hand lvl-title lvl-w2">
              Новый уровень!
              <svg className="lvl-under" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path d="M3 9 C 40 3, 80 12, 120 6 S 180 4, 197 8" /></svg>
            </span>
            <span className="lvl-row lvl-w3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="lvl-sketch" src="/assets/ui/levelup-sketch.webp" alt="" draggable={false} />
              <span className="lvl-level">
                <b className="lvl-hand lvl-num">{levelUp.to}
                  <svg className="lvl-ring" viewBox="0 0 120 80" preserveAspectRatio="none" aria-hidden="true"><path d="M70 6 C 30 2, 4 18, 6 42 C 8 70, 60 78, 96 66 C 122 56, 118 18, 86 8 C 70 4, 52 6, 40 12" /></svg>
                </b>
                <i className="lvl-hand lvl-word">уровень</i>
              </span>
            </span>
            {jump > 1 && <span className="lvl-hand lvl-jump lvl-w3">сразу +{jump}!</span>}
            <span className="lvl-hand lvl-stat lvl-w4">Авторитет: <b>{full(p.xp)}</b></span>
            <span className="lvl-hand lvl-stat lvl-w5">
              {p.levelNeed ? <>До {p.level + 1} уровня: <b>{full(left)}</b></> : <>Это максимум!</>}
            </span>
          </div>
        </div>
        <button className="btn gold big" onClick={clearLevelUp}>Круто!</button>
      </div>
    </div>,
    document.body,
  );
}
