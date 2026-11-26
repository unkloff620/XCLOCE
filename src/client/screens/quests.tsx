"use client";
import Link from "next/link";
import { useGame, useNow } from "../store.tsx";
import { Modal, RewardChips } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { clock } from "../format.ts";
import { haptic, requestWriteAccess } from "../telegram.ts";
import { questById } from "../../content/quests.ts";
import { ItemArt } from "../art/items.tsx";
import type { Granted } from "../api.ts";
import { sfx } from "../sound.ts";


/** Telegram reminders switch: energy full, fist ready, boss almost dead, streak about to burn. */
export function NotifySwitch() {
  const { state, act, busy } = useGame();
  if (!state?.notify.available) return null;
  const n = state.notify;
  const enable = async () => {
    // the bot may write only after the player allows it once; Telegram asks with its own dialog
    const granted = await requestWriteAccess();
    await act("notify_set", { on: true, granted }, granted || !n.blocked ? "Напоминания включены" : undefined);
  };
  const disable = () => act("notify_set", { on: false }, "Напоминания выключены");
  const live = n.on && !n.blocked;
  return (
    <div className={`notify-row ${live ? "on" : ""}`}>
      <span className="notify-ico" aria-hidden="true">🔔</span>
      <span className="notify-text">
        <b>Напоминания в Telegram</b>
        <span className="tiny muted">
          {live ? "Энергия полная, кулак готов, босс почти убит, серия сгорает" : n.on && n.blocked ? "Разреши боту писать тебе — иначе он молчит" : "Выключены"}
        </span>
      </span>
      {live ? (
        <button className="btn dark sm" disabled={busy === "notify_set"} onClick={disable}>Выкл</button>
      ) : (
        <button className="btn green sm" disabled={busy === "notify_set"} onClick={enable}>{n.on ? "Разрешить" : "Включить"}</button>
      )}
    </div>
  );
}

export function QuestsWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const now = useNow();
  if (!state) return null;
  const q = state.quests;
  const openChest = async () => {
    const r = await act<{ reward: Granted }>("quest_chest", {});
    if (r) { haptic.ok(); sfx("chest"); }
  };
  const claim = async (id: string) => {
    const r = await act<{ reward: Granted }>("quest_claim", { id });
    if (r) haptic.ok();
  };
  return (
    <Modal title="Задания дня" onClose={onClose} head={
      <div className="small muted row" style={{ justifyContent: "space-between" }}>
        <span>Выполни все — откроется сундук.</span>
        <span className="row num" style={{ gap: 4, whiteSpace: "nowrap" }}><Icon name="clock" size={14} />{clock(q.resetAt - now)}</span>
      </div>}>
      <div className="col" style={{ gap: 10 }}>
        {q.list.map((x) => {
          const def = questById(x.id);
          if (!def) return null;
          const pct = Math.round((x.progress / x.target) * 100);
          return (
            <div key={x.id} className={`quest ${x.claimed ? "claimed" : x.done ? "done" : ""}`}>
              <div className="quest-main">
                <b className="quest-title">{def.title}</b>
                <div className="quest-bar" style={{ ["--p" as string]: `${pct}%` }}><i /><span className="num">{x.progress}/{x.target}</span></div>
                <RewardChips r={def.reward} size={14} />
                {!x.done && def.hint && <span className="tiny muted">{def.hint}</span>}
              </div>
              {x.claimed ? (
                <span className="quest-ok display">✓</span>
              ) : x.done ? (
                <button className="btn gold sm" disabled={busy === "quest_claim"} onClick={() => claim(x.id)}>Забрать</button>
              ) : def.href ? (
                <Link href={def.href} className="btn dark sm" onClick={onClose}>Идти</Link>
              ) : null}
            </div>
          );
        })}
        {/* the chest of the day: all seven claimed */}
        <div className={`quest quest-chest ${q.chest.opened ? "claimed" : q.chest.ready ? "done" : ""}`}>
          <ItemArt id="chest" size={46} />
          <div className="quest-main">
            <b className="quest-title">Сундук дня</b>
            {/* what is inside is a surprise: shown only once it is opened */}
            {q.chest.opened && q.chest.reward && <RewardChips r={q.chest.reward} size={14} />}
          </div>
          {q.chest.opened ? <span className="quest-ok display">✓</span>
            : <button className="btn gold sm" disabled={!q.chest.ready || busy === "quest_chest"} onClick={openChest}>{q.chest.ready ? "Открыть" : `${q.list.filter((x) => x.claimed).length}/${q.list.length}`}</button>}
        </div>
        <NotifySwitch />
      </div>
    </Modal>
  );
}
