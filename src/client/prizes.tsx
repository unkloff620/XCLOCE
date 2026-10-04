"use client";
import Link from "next/link";
import { useState } from "react";
import { useGame } from "./store.tsx";
import { Modal, RewardChips } from "./ui.tsx";
import { Icon } from "./art/icons.tsx";
import { haptic } from "./telegram.ts";
import { tutorialPending } from "./tutorial.tsx";

/** Weekly rating prizes: a window on any screen until they are collected (can be put off till the next visit). */
export function PrizeWindow() {
  const { state, act, busy } = useGame();
  const [later, setLater] = useState(false);
  if (!state || later || !state.prizes.length || tutorialPending(state) || state.pending.length) return null;
  const p = state.prizes[0];
  const claim = async () => {
    const r = await act("prize_claim", { id: p.id }, "Приз получен!");
    if (r) haptic.big();
  };
  return (
    <Modal title="Итоги недели" onClose={() => setLater(true)}>
      <div className="col" style={{ alignItems: "center", gap: 12, textAlign: "center" }}>
        <div className="prize-cup"><Icon name="trophy" size={72} /></div>
        <b className="display" style={{ fontSize: 20 }}>{p.title}</b>
        <RewardChips r={p.reward} size={18} />
        <button className="btn gold big block" disabled={busy === "prize_claim"} onClick={claim}><Icon name="gift" size={22} /> Забрать приз</button>
        <Link href="/rating" className="tiny muted" onClick={() => setLater(true)}>Открыть рейтинг</Link>
        {state.prizes.length > 1 && <span className="tiny muted">Ещё призов: {state.prizes.length - 1}</span>}
      </div>
    </Modal>
  );
}
