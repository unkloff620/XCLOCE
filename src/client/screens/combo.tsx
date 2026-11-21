"use client";
/*
 * «Комбо» in a boss fight (content/combo.ts): the picker before the fight (under the fight mode), the «Комбо» button by
 * the weapons with the progress, its panel sliding up like the weapons one (the cells of the sequence: the guessed hits
 * show, the rest are «?»; done — the «ВЫПОЛНЕНО» stamp), and the «КОМБО РАЗГАДАНО!» window with the payout and «Забрать».
 */
import { useState } from "react";
import { COMBO_MODES, comboMode, type ComboMode } from "../../content/combo.ts";
import type { Reward } from "../../content/rewards.ts";
import { ItemArt } from "../art/items.tsx";
import { GainLine } from "../ui.tsx";
import { useGame } from "../store.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";

export interface ComboState {
  mode: ComboMode;
  length: number;
  progress: number;
  guessed: string[];
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

/** the panel: the sequence's cells, what is guessed, «Забрать» once done */
export function ComboPanel({ c, bossId, onClose, onClaimed }: { c: ComboState; bossId: string; onClose: () => void; onClaimed: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 220);
  };
  return (
    <div className={`wpanel-back ${closing ? "out" : ""}`} onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="wpanel combo-panel" role="dialog" aria-label="Комбо">
        <div className="wpanel-grip" aria-hidden="true" />
        <div className="combo-head">
          <b>Режим комбо: {comboMode(c.mode)?.name}</b>
          <span className="num">{c.progress}/{c.length}</span>
        </div>
        <div className={`combo-cells n${c.length}`}>
          {Array.from({ length: c.length }, (_, i) => {
            const h = c.guessed[i];
            return <span key={i} className={`combo-cell ${h ? "on" : ""}`}>{h ? <ItemArt id={h} size={40} /> : <i>?</i>}</span>;
          })}
          {c.done && <span className="combo-stamp">выполнено</span>}
        </div>
        {c.done && !c.claimed && <ClaimButton bossId={bossId} mode={c.mode} onClaimed={() => { onClaimed(); close(); }} />}
      </div>
    </div>
  );
}

function ClaimButton({ bossId, mode, onClaimed }: { bossId: string; mode: ComboMode; onClaimed: () => void }) {
  const { act, busy } = useGame();
  return (
    <button type="button" className="btn gold block combo-take" disabled={busy === "combo_claim"}
      onClick={async () => {
        const r = await act("combo_claim", { boss: bossId, mode });
        if (r) {
          haptic.big();
          sfx("reward");
          onClaimed();
        }
      }}>
      Забрать
    </button>
  );
}

/** «КОМБО РАЗГАДАНО!»: the payout, «Забрать» */
export function ComboDone({ c, bossId, onClose }: { c: ComboState; bossId: string; onClose: () => void }) {
  return (
    <div className="combo-done-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="combo-done" role="dialog" aria-label="Комбо разгадано">
        <button type="button" className="combo-done-x" onClick={onClose} aria-label="Закрыть">×</button>
        <b className="combo-done-title display">Комбо разгадано!</b>
        <span className="combo-done-sub">Держи, тебе подгон:</span>
        <div className="combo-done-gain"><GainLine r={c.reward} size={30} /></div>
        {!c.claimed && <ClaimButton bossId={bossId} mode={c.mode} onClaimed={onClose} />}
      </div>
    </div>
  );
}
