"use client";
import { useState, type ReactNode } from "react";
import { useGame } from "./store.tsx";
import { Modal } from "./ui.tsx";
import type { HelpTopic } from "../content/home.ts";

/**
 * Small [?] button with the rules of a screen. Until the player has opened it once it blinks,
 * so a newcomer reads the instruction before attacking a boss.
 */
export function Help({ topic, title, children }: { topic: HelpTopic; title: string; children: ReactNode }) {
  const { state, act } = useGame();
  const [open, setOpen] = useState(false);
  const fresh = !!state && !state.helpSeen.includes(topic);
  const show = () => {
    setOpen(true);
    if (fresh) void act("help_seen", { topic });
  };
  return (
    <>
      <button type="button" className={`help-btn ${fresh ? "fresh" : ""}`} onClick={show} aria-label={`Подсказка: ${title}`} title="Как это работает">?</button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <div className="help-body">{children}</div>
          <button className="btn green block" style={{ marginTop: 12 }} onClick={() => setOpen(false)}>Понятно</button>
        </Modal>
      )}
    </>
  );
}

/** A legend inside a help window: picture + name + one line on what it is. */
export function HelpList({ title, rows }: { title: string; rows: { key: string; icon: ReactNode; name: string; hint: string }[] }) {
  return (
    <>
      <b>{title}</b>
      <div className="help-nav">
        {rows.map((r) => (
          <div key={r.key} className="help-nav-row">
            {r.icon}
            <div><b>{r.name}</b><div className="small muted">{r.hint}</div></div>
          </div>
        ))}
      </div>
    </>
  );
}
