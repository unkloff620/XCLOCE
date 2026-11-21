"use client";
/*
 * «Комбо» in a boss fight (content/combo.ts): the picker before the fight (under the fight mode), the «Комбо» button by
 * the weapons with the progress, its panel sliding up like the weapons one (the cells of the sequence: the guessed hits
 * show, the rest are «?»; done — the «ВЫПОЛНЕНО» stamp), and the «КОМБО РАЗГАДАНО!» window with the payout and «Забрать».
 */
import { COMBO_MODES, comboMode, type ComboMode } from "../../content/combo.ts";
import type { Reward } from "../../content/rewards.ts";
import { ItemArt } from "../art/items.tsx";
import { GainLine } from "../ui.tsx";
import { haptic } from "../telegram.ts";

export interface ComboState {
  mode: ComboMode;
  length: number;
  progress: number;
  guessed: string[];
  /** done today already: the whole sequence, grey, to hit by again */
  known?: string[];
  runs?: number;
  done: boolean;
  claimed: boolean;
  reward: Reward | null;
  last?: "right" | "wrong" | "kept";
}

/** before the fight: which combo to guess (each mode marked when today's one is done) */
export function ComboPick({ value, onChange, done }: { value: ComboMode; onChange: (m: ComboMode) => void; done: (m: ComboMode) => boolean }) {
  return (
    <div className="combo-pick" role="radiogroup" aria-label="Режим комбо">
      <span className="combo-pick-k">Комбо</span>
      {COMBO_MODES.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={value === m.id} className={`combo-pick-b ${m.id} ${value === m.id ? "on" : ""} ${done(m.id) ? "done" : ""}`}
          onClick={() => { haptic.tap(); onChange(m.id); }}>
          {m.name}
          {done(m.id) && <i aria-label="выполнено">✓</i>}
        </button>
      ))}
    </div>
  );
}

/** the button by the weapons: the combo's progress */
export function ComboButton({ c, onOpen }: { c: ComboState; onOpen: () => void }) {
  return (
    <button type="button" key={`${c.progress}-${c.last ?? ""}`} className={`btn sm combo-btn ${c.done ? "done" : ""} ${c.last ?? ""}`} onClick={() => { haptic.tap(); onOpen(); }} aria-label={`Комбо: ${c.progress} из ${c.length}`}>
      <b>Комбо</b>
      <span className="num">{c.progress}/{c.length}</span>
    </button>
  );
}

/** the panel over the weapons (see-through, the hits stay in reach): the sequence's cells, what is guessed, «Забрать» once done */
export function ComboPanel({ c, onClose }: { c: ComboState; bossId: string; onClose: () => void; onClaimed: () => void }) {
  return (
    <div className="combo-strip" role="region" aria-label="Комбо">
      <div className="combo-head">
        <b>Режим комбо: {comboMode(c.mode)?.name}</b>
        <span className="num">{c.progress}/{c.length}</span>
        <button type="button" className="combo-x" onClick={() => { haptic.tap(); onClose(); }} aria-label="Свернуть комбо">×</button>
      </div>
      <div className={`combo-cells n${c.length}`}>
        {Array.from({ length: c.length }, (_, i) => {
          const h = c.guessed[i];
          const k = !h ? c.known?.[i] : undefined;
          return <span key={i} className={`combo-cell ${h ? "on" : k ? "known" : ""} ${i === c.progress && !c.done ? "next" : ""}`}>{h ? <ItemArt id={h} size={34} /> : k ? <ItemArt id={k} size={34} /> : <i>?</i>}</span>;
        })}
        {c.done && <span className="combo-stamp">выполнено</span>}
      </div>
    </div>
  );
}

/** a heap of нычки: up to PILE_MAX pictures thrown on each other, each a little turned (the same every time) */
const PILE_MAX = 14;
function StashPile({ ids }: { ids: string[] }) {
  const shown = ids.slice(0, PILE_MAX);
  const n = shown.length;
  return (
    <span className="stash-pile" aria-label="Нычки">
      {shown.map((id, i) => {
        // a heap: the first ones at the bottom, wide; the last ones on top, near the middle
        const k = (i * 2654435761) % 1000 / 1000;
        const up = n > 1 ? i / (n - 1) : 0.5;
        const x = 50 + (k - 0.5) * (70 - up * 40);
        const y = 72 - up * 44 + ((k * 7) % 1) * 8;
        const r = (k - 0.5) * 70;
        return <span key={i} className="stash-pile-i" style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${r}deg)`, zIndex: i }}><ItemArt id={id} size={34} /></span>;
      })}
    </span>
  );
}

/** «КОМБО РАЗГАДАНО!»: the payout, «Забрать» */
export function ComboDone({ c, onClose }: { c: ComboState; bossId: string; onClose: () => void }) {
  // the нычки lie in a heap — no count, just their pictures; the rest in the usual line
  const items = c.reward?.items ?? [];
  const stash = items.filter((i) => i.id.startsWith("stash-")).flatMap((i) => Array.from({ length: i.qty }, () => i.id));
  const rest = c.reward ? { ...c.reward, items: items.filter((i) => !i.id.startsWith("stash-")) } : null;
  return (
    <div className="combo-done-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="combo-done" role="dialog" aria-label="Комбо разгадано">
        <button type="button" className="combo-done-x" onClick={onClose} aria-label="Закрыть">×</button>
        <b className="combo-done-title display">Комбо разгадано!</b>
        <span className="combo-done-sub">Держи, тебе подгон:</span>
        <div className="combo-done-gain">
          {stash.length > 0 && <StashPile ids={stash} />}
          <GainLine r={rest} size={30} />
        </div>
        {/* the payout is already his: «Забрать» only closes the window */}
        <button type="button" className="btn gold combo-done-take" onClick={() => { haptic.big(); onClose(); }}>Забрать</button>
      </div>
    </div>
  );
}
