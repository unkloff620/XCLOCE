"use client";
/*
 * «Новичок» (content/newbie.ts): Баба Зина's tasks for the first 3 days — one chain, the current task with her words,
 * its progress and reward; done ones are ticked, the next ones wait. All done — her chest.
 */
import Link from "next/link";
import { useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Modal, RewardChips } from "../ui.tsx";
import { haptic } from "../telegram.ts";
import { leftText } from "../event-banner.tsx";
import { NEWBIE_CHEST, NEWBIE_TASKS } from "../../content/newbie.ts";
import type { Granted } from "../api.ts";

export function NewbieButton() {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  const v = state?.newbie;
  if (!v) return null;
  const ready = v.tasks.some((t, i) => !t.claimed && t.have >= t.n && v.tasks.slice(0, i).every((x) => x.claimed)) || v.tasks.every((t) => t.claimed);
  return (
    <>
      <button type="button" className={`menu-toggle event-toggle nb-toggle ${ready ? "glow" : ""}`} onClick={() => { haptic.tap(); setOpen(true); }} aria-label="Новичок: задания Бабы Зины" title="Задания Бабы Зины">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/guide/zina-face.webp?v=1" alt="" draggable={false} />
        <span className="event-tag">НОВИЧОК</span>
        {ready && <i className="side-dot" />}
      </button>
      {open && <NewbieWindow onClose={() => setOpen(false)} />}
    </>
  );
}

function NewbieWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const now = useNow();
  const [got, setGot] = useState<Granted | null>(null);
  const v = state?.newbie;
  if (!v) return null;
  const done = v.tasks.filter((t) => t.claimed).length;
  const cur = v.tasks.findIndex((t) => !t.claimed);
  const claim = async (id: string) => {
    const r = await act<{ reward: Granted }>("newbie_claim", { id });
    if (r) { haptic.big(); setGot(r.reward); }
  };
  const def = cur >= 0 ? NEWBIE_TASKS[cur] : null;
  const t = cur >= 0 ? v.tasks[cur] : null;
  return (
    <Modal title="Задания Бабы Зины" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        <div className="nb-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/guide/zina.webp?v=1" alt="" draggable={false} />
          <div className="nb-say">
            {def ? <>«{def.say}»</> : <>«Всё сделал? Ай, молодец! Держи мой сундук — заслужил.»</>}
            <span className="tiny muted nb-left">Выполнено {done}/{v.tasks.length} · осталось {leftText(v.endsAt - now)}</span>
          </div>
        </div>
        {def && t ? (
          <div className="nb-cur">
            <b>{cur + 1}. {def.title}</b>
            <div className="nb-bar"><i style={{ width: `${(t.have / t.n) * 100}%` }} /><span className="num">{t.have}/{t.n}</span></div>
            <RewardChips r={def.reward} size={20} />
            {t.have >= t.n
              ? <button className="btn gold block" disabled={busy === "newbie_claim"} onClick={() => claim(def.id)}>Забрать</button>
              : <Link href={def.href} className="btn green block" onClick={onClose}>Пойти</Link>}
          </div>
        ) : (
          <div className="nb-cur">
            <b>Сундук Бабы Зины</b>
            <RewardChips r={NEWBIE_CHEST} size={20} />
            <button className="btn gold block" disabled={busy === "newbie_claim"} onClick={() => claim("chest")}>Открыть сундук</button>
          </div>
        )}
        <div className="nb-list">
          {NEWBIE_TASKS.map((d, i) => {
            const x = v.tasks[i];
            return (
              <div key={d.id} className={`nb-row ${x.claimed ? "done" : i === cur ? "now" : "wait"}`}>
                <span className="nb-n num">{x.claimed ? "✓" : i + 1}</span>
                <span className="nb-t">{i <= cur || x.claimed ? d.title : "???"}</span>
              </div>
            );
          })}
          <div className={`nb-row ${cur < 0 ? "now" : "wait"}`}><span className="nb-n">🎁</span><span className="nb-t">Сундук Бабы Зины</span></div>
        </div>
      </div>
      {got && (
        <Modal title="Баба Зина дала" onClose={() => setGot(null)}>
          <div className="col" style={{ gap: 12, alignItems: "center" }}>
            <RewardChips r={got} size={26} />
            <button className="btn gold block" onClick={() => setGot(null)}>Спасибо, Баба Зина!</button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
