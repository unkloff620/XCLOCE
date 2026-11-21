"use client";
/*
 * «Дополнительная награда» (content/boss-bonus.ts): the small box by the boss (under the HP and the time) — the knife in
 * its window fills with my damage in this fight towards the next stage. A tap opens the box's board in the middle: the bar
 * with the pin at the stage's damage. A stage passed: the nut unscrews and drops off the screen, the plate with the damage
 * falls, then the pin slips out of its clamps — and the stage's reward shows (it comes with the win). Then the next stage.
 * Which stages were already opened is kept per fight on this device.
 */
import { useEffect, useState } from "react";
import { bossBonus } from "../../content/boss-bonus.ts";
import { BAR_INSIDE, BOX_LAYERS, BOX_WINDOW, PIN_X } from "../art/boss-box-layout.ts";
import { GainLine } from "../ui.tsx";
import { full, short } from "../format.ts";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";

const seenKey = (fightId: number) => `xc-bbox-${fightId}`;
const readSeen = (fightId: number) => { try { return Number(localStorage.getItem(seenKey(fightId)) ?? 0) || 0; } catch { return 0; } };
const writeSeen = (fightId: number, n: number) => { try { localStorage.setItem(seenKey(fightId), String(n)); } catch { /* storage blocked */ } };

/** the box by the boss: its knife fills towards the next stage; it glows when a stage is waiting to be opened */
export function BossBoxButton({ bossId, fightId, damage, onOpen }: { bossId: string; fightId: number; damage: number; onOpen: () => void }) {
  const stages = bossBonus(bossId);
  const [seen, setSeen] = useState(0);
  useEffect(() => { setSeen(readSeen(fightId)); }, [fightId, damage]);
  if (!stages.length) return null;
  const reached = stages.filter((s) => damage >= s.damage).length;
  const next = stages.find((s) => damage < s.damage);
  const frac = next ? Math.max(0, Math.min(1, damage / next.damage)) : 1;
  const [l, t, r, b] = BOX_WINDOW;
  return (
    <button type="button" className={`bbox-btn ${reached > seen ? "ready" : ""}`} onClick={() => { haptic.tap(); onOpen(); }} aria-label="Дополнительная награда">
      <span className="bbox-fill" style={{ left: `${l}%`, top: `${t}%`, width: `${(r - l) * frac}%`, height: `${b - t}%` }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/bossbox/box.webp" alt="" draggable={false} />
    </button>
  );
}

const layer = (name: keyof typeof BOX_LAYERS, extra = "") => {
  const [l, t, w, h] = BOX_LAYERS[name];
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={name} className={`bbox-l bbox-${name} ${extra}`} src={`/assets/bossbox/${name}.webp`} alt="" draggable={false} style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` }} />;
};

/** where the pin stands on the bar: near its right end */
const PIN_AT = BAR_INSIDE[2] - 4.5;

/** the board in the middle: the stage's bar and pin; a passed stage opens with the animation, then its reward */
export function BossBoxWindow({ bossId, fightId, damage, onClose }: { bossId: string; fightId: number; damage: number; onClose: () => void }) {
  const stages = bossBonus(bossId);
  const reached = stages.filter((s) => damage >= s.damage).length;
  const [seen, setSeen] = useState(() => readSeen(fightId));
  // «open»: the unlock is playing (the stage index), «shown»: its reward is out
  const [phase, setPhase] = useState<{ kind: "idle" } | { kind: "open"; i: number } | { kind: "shown"; i: number }>({ kind: "idle" });
  // a stage passed and not opened yet: open it now
  useEffect(() => {
    if (phase.kind !== "idle" || seen >= reached) return;
    const i = seen;
    const t = window.setTimeout(() => { setPhase({ kind: "open", i }); haptic.heavy(); sfx("locked"); }, 450);
    return () => window.clearTimeout(t);
  }, [phase.kind, seen, reached]);
  // the pin is out: the stage's reward
  useEffect(() => {
    if (phase.kind !== "open") return;
    const i = phase.i;
    const t = window.setTimeout(() => { setPhase({ kind: "shown", i }); haptic.big(); sfx("reward"); setSeen(i + 1); writeSeen(fightId, i + 1); }, 2700);
    return () => window.clearTimeout(t);
  }, [phase, fightId]);

  const i = phase.kind === "idle" ? Math.min(seen, stages.length - 1) : phase.i;
  const stage = stages[i];
  if (!stage) return null;
  const done = phase.kind === "shown" || (phase.kind === "idle" && seen >= stages.length);
  const frac = phase.kind !== "idle" || seen > i ? 1 : Math.max(0, Math.min(1, damage / stage.damage));
  const [bl, bt, br, bb] = BAR_INSIDE;
  const shift = PIN_AT - PIN_X;
  const anim = phase.kind === "open" ? "go" : done ? "gone" : "";
  return (
    <div className="bbox-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bbox-win" role="dialog" aria-label="Дополнительная награда">
        {layer("board")}
        <b className="bbox-title display">Дополнительная награда</b>
        <span className="bbox-text">
          {done ? <>За {full(stage.damage)} урона — при победе:</> : <>Нанеси боссу {full(stage.damage)} урона в этом бою и победи</>}
        </span>
        {layer("bar")}
        <span className="bbox-progress" style={{ left: `${bl}%`, top: `${bt}%`, width: `${(PIN_AT - bl) * frac + (frac >= 1 ? br - PIN_AT : 0)}%`, height: `${bb - bt}%` }} />
        <span className="bbox-dmg num" style={{ left: `${bl + 1.5}%`, top: `${bt}%`, height: `${bb - bt}%` }}>{full(Math.min(damage, stage.damage))} / {full(stage.damage)}</span>
        {/* the pin assembly, moved to the stage's place on the bar */}
        <div className={`bbox-pin ${anim}`} style={{ transform: `translateX(${(shift / 100) * 100}%)`, ["--shift" as string]: `${shift}%` }}>
          {layer("plank")}
          {layer("pin", "pinrod")}
          {layer("clamps")}
          {layer("nut", "nut")}
          {layer("plate", "plate")}
          <span className="bbox-plate-n num plate" style={{ left: `${BOX_LAYERS.plate[0]}%`, top: `${BOX_LAYERS.plate[1]}%`, width: `${BOX_LAYERS.plate[2]}%`, height: `${BOX_LAYERS.plate[3]}%` }}>{short(stage.damage)}</span>
        </div>
        <div className="bbox-foot">
          {done ? <GainLine r={stage.reward} size={26} /> : <span className="bbox-step">Этап {i + 1} из {stages.length}</span>}
        </div>
        <button type="button" className="bbox-x" onClick={onClose} aria-label="Закрыть">×</button>
        {done && phase.kind === "shown" && seen < stages.length && (
          <button type="button" className="btn gold sm bbox-next" onClick={() => { haptic.tap(); setPhase({ kind: "idle" }); }}>Дальше</button>
        )}
      </div>
    </div>
  );
}
