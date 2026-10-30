"use client";
import { useEffect, useState } from "react";
import { Modal } from "./ui.tsx";
import { UPDATES, type UpdateNote } from "../content/updates.ts";
import { haptic } from "./telegram.ts";

const SEEN = "xc-upd-seen";
const SHOW = "xc-upd-show";

function read(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function write(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* storage blocked */ }
}

/** the switch «show updates on entry» (on by default) */
export function updatesShown(): boolean {
  return read(SHOW) !== "0";
}

/** The updates window: the switch on top, then the notes — pictures with a short line each. */
export function UpdatesWindow({ onClose, count = UPDATES.length, list }: { onClose: () => void; count?: number; list?: UpdateNote[] }) {
  const notes = list ?? UPDATES.slice(0, count);
  const [show, setShow] = useState(updatesShown);
  const toggle = () => {
    haptic.tap();
    const v = !show;
    setShow(v);
    write(SHOW, v ? "1" : "0");
  };
  return (
    <Modal title="Что нового" onClose={onClose}>
      <label className="upd-switch">
        <span>Показывать обновления при входе</span>
        <button type="button" role="switch" aria-checked={show} className={`upd-toggle ${show ? "on" : ""}`} onClick={toggle}><i /></button>
      </label>
      <div className="upd-list">
        {list && notes.length === 0 && <div className="small muted center">Сегодня обновлений не было. Лента обновляется в 0:00 по Москве.</div>}
        {notes.map((u) => (
          <section key={u.id} className="upd-entry">
            <h4 className="display">{u.title}<small>{u.date}</small></h4>
            {u.items.map((it, i) => (
              <figure key={i} className="upd-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.img && <img src={it.img} alt="" loading="lazy" draggable={false} />}
                <figcaption className="small">{it.text}</figcaption>
              </figure>
            ))}
          </section>
        ))}
      </div>
      <button className="btn gold block" onClick={onClose}>Понятно</button>
    </Modal>
  );
}

/** On the home screen: a new update note opens once (unless the player turned the switch off). */
export function UpdatesNotice({ wait, onOpen }: { wait: boolean; onOpen?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (wait || open) return;
    const last = UPDATES[0]?.id;
    if (!last || read(SEEN) === last) return;
    write(SEEN, last);
    if (!updatesShown()) return;
    setOpen(true);
    onOpen?.(true);
  }, [wait, open, onOpen]);
  if (!open) return null;
  return <UpdatesWindow count={1} onClose={() => { setOpen(false); onOpen?.(false); }} />;
}
