"use client";
/*
 * Game events (set in /admin → «События»): while one is on, a glowing button sits next to the sound switches in the HUD;
 * the first time a player sees an event its window opens by itself (remembered on this device).
 */
import { useEffect, useState } from "react";
import { useGame, useNow } from "./store.tsx";
import { Modal } from "./ui.tsx";
import { effectLines, type GameEventView } from "../content/events.ts";

const SEEN_KEY = "xc2_events_seen";

function seenIds(): number[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as number[];
  } catch {
    return [];
  }
}
function markSeen(id: number) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenIds().filter((x) => x !== id), id].slice(-30)));
  } catch {
    /* private mode */
  }
}

/** «2 д 5 ч», «3 ч 12 мин», «8 мин» */
export function leftText(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${mm} мин`;
  return `${Math.max(1, mm)} мин`;
}

export function EventButton() {
  const { state } = useGame();
  const now = useNow();
  const events = (state?.events ?? []).filter((e) => e.endsAt > now);
  const [open, setOpen] = useState<GameEventView[] | null>(null);
  // a new event opens its window once
  useEffect(() => {
    const seen = seenIds();
    const fresh = events.filter((e) => !seen.includes(e.id));
    if (fresh.length) {
      setOpen(fresh);
      fresh.forEach((e) => markSeen(e.id));
    }
  }, [events.map((e) => e.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!events.length) return null;
  return (
    <>
      <button type="button" className="hud-tog hud-event" aria-label="Событие" title={events[0].title} onClick={() => setOpen(events)}>
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d="M12 2l2.6 6.2 6.7.5-5.1 4.4 1.6 6.5L12 16.1 6.2 19.6l1.6-6.5L2.7 8.7l6.7-.5z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <Modal title="Событие" onClose={() => setOpen(null)}>
          <div className="col" style={{ gap: 14 }}>
            {open.map((e) => (
              <div key={e.id} className="ev-card">
                <b className="display ev-title">{e.title}</b>
                {e.description && <p className="ev-desc">{e.description}</p>}
                {effectLines(e.effects).length > 0 && (
                  <ul className="ev-effects">{effectLines(e.effects).map((l) => <li key={l}>{l}</li>)}</ul>
                )}
                <span className="small muted">До конца: <b>{leftText(e.endsAt - now)}</b></span>
              </div>
            ))}
            <button className="btn gold block" onClick={() => setOpen(null)}>Понятно</button>
          </div>
        </Modal>
      )}
    </>
  );
}
