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

/** the bar's end (the last stage's pin stands there) */
const PIN_AT = BAR_INSIDE[2] - 4.5;

/**
 * The board in the middle: one bar for the whole fight, a pin (шпингалет) at every stage's damage. A stage passed and
 * not opened yet opens now, one after another: the nut, the plate, the pin fall — its reward lies on its plank.
 */
export function BossBoxWindow({ bossId, fightId, damage, onClose }: { bossId: string; fightId: number; damage: number; onClose: () => void }) {
  const stages = bossBonus(bossId);
  const reached = stages.filter((s) => damage >= s.damage).length;
  const [seen, setSeen] = useState(() => readSeen(fightId));
  const [opening, setOpening] = useState<number | null>(null);
  // the next passed stage opens a moment after the window
  useEffect(() => {
    if (opening !== null || seen >= reached) return;
    const t = window.setTimeout(() => { setOpening(seen); haptic.heavy(); }, 450);
    return () => window.clearTimeout(t);
  }, [opening, seen, reached]);
  // its pin is out: the reward is on the plank, then the next one
  useEffect(() => {
    if (opening === null) return;
    const i = opening;
    const t = window.setTimeout(() => { haptic.big(); setSeen(i + 1); writeSeen(fightId, i + 1); setOpening(null); }, 2700);
    return () => window.clearTimeout(t);
  }, [opening, fightId]);
  if (!stages.length) return null;
  const max = stages[stages.length - 1].damage;
  const [bl, bt, br, bb] = BAR_INSIDE;
  const xOf = (d: number) => bl + (PIN_AT - bl) * (d / max);
  const frac = Math.max(0, Math.min(1, damage / max));
  const next = stages.find((s) => damage < s.damage);
  const pin = (k: number, front: boolean) => {
    const st = stages[k];
    const shift = xOf(st.damage) - PIN_X;
    const open = k < seen;
    const cls = k === opening ? "go" : open ? "gone" : "";
    return (
      <div key={`${front ? "f" : "b"}${k}`} className={`bbox-pin ${front ? cls : ""}`} style={{ transform: `translateX(${shift}%)` }}>
        {front ? (
          <>
            {layer("pin", "pinrod")}
            {layer("clamps")}
            {layer("nut", "nut")}
            {layer("plate", "plate")}
            {/* the stage open: its reward on the plank, where the plate hung */}
            {open && (
              <span className="bbox-plank-gain" style={{ left: `${BOX_LAYERS.plank[0]}%`, top: `${BOX_LAYERS.plate[1] - 1}%`, width: `${BOX_LAYERS.plank[2]}%`, height: `${BOX_LAYERS.plate[3] + 2}%` }}>
                <GainLine r={st.reward} size={22} />
              </span>
            )}
            <span className="bbox-plate-n num plate" style={{ left: `${BOX_LAYERS.plate[0]}%`, top: `${BOX_LAYERS.plate[1]}%`, width: `${BOX_LAYERS.plate[2]}%`, height: `${BOX_LAYERS.plate[3]}%` }}>{short(st.damage)}</span>
          </>
        ) : layer("plank")}
      </div>
    );
  };
  return (
    <div className="bbox-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bbox-win" role="dialog" aria-label="Дополнительная награда">
        {layer("board")}
        <b className="bbox-title display">Дополнительная награда</b>
        {/* the pins' planks stand behind the bar */}
        {stages.map((_, k) => pin(k, false))}
        {layer("bar")}
        <span className="bbox-progress" style={{ left: `${bl}%`, top: `${bt}%`, width: `${(PIN_AT - bl) * frac + (frac >= 1 ? br - PIN_AT : 0)}%`, height: `${bb - bt}%` }} />
        <span className="bbox-dmg num" style={{ left: `${bl + 1.5}%`, top: `${bt}%`, height: `${bb - bt}%` }}>{full(Math.min(damage, max))} / {full(max)}</span>
        {stages.map((_, k) => pin(k, true))}
        <span className="bbox-text">
          {next ? <>Нанеси боссу {full(next.damage)} урона в этом бою и победи</> : <>Награды — при победе</>}
        </span>
        <button type="button" className="bbox-x" onClick={onClose} aria-label="Закрыть">×</button>
      </div>
    </div>
  );
}
