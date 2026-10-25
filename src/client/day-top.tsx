"use client";
/*
 * The daily tops of the mini-games (server: systems/minigame-extras.ts dayTop): blackjack — who won the most today,
 * poker — the best combination of the day (equal hands: who got it first). The leader is on a sheet of paper in the
 * game window's corner; a tap on it opens the whole top.
 */
import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { useGame } from "./store.tsx";
import { Avatar, Modal } from "./ui.tsx";
import { Icon } from "./art/icons.tsx";
import { haptic } from "./telegram.ts";
import { POKER_HANDS } from "../content/games.ts";

interface Row { id: number; name: string; photo: string | null; place: number; value: number; hand?: string }
interface Top { game: "bj" | "poker"; day: "today" | "yesterday"; top: Row[]; me: { place: number | null; value: number; hand?: string } | null }

/** dollars: whole or with cents */
const money = (v: number) => (Math.round(v * 100) / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const handName = (id?: string) => POKER_HANDS.find((h) => h.id === id)?.name ?? "—";
const MEDAL = ["🥇", "🥈", "🥉"];

function DayTopWindow({ game, onClose }: { game: "bj" | "poker"; onClose: () => void }) {
  const { state } = useGame();
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [data, setData] = useState<Top | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    api.get<Top>(`/api/game-day?game=${game}&day=${day}`).then((v) => { if (alive) setData(v); }).catch(() => { if (alive) setData({ game, day, top: [], me: null }); });
    return () => { alive = false; };
  }, [game, day]);
  const value = (r: { value: number; hand?: string }) => game === "bj"
    ? <><b className="num">+{money(r.value)}</b> <Icon name="USD" size={14} /></>
    : <b>{handName(r.hand)}</b>;
  const meIn = !!data?.top.some((r) => r.id === state?.player.id);
  return (
    <Modal title={game === "bj" ? "Топ дня · блэкджек" : "Топ дня · покер"} onClose={onClose} maxWidth={420}>
      <div className="dt">
        <div className="dt-tabs">
          {(["today", "yesterday"] as const).map((d) => (
            <button key={d} type="button" className={day === d ? "on" : ""} onClick={() => { haptic.tap(); setDay(d); }}>{d === "today" ? "Сегодня" : "Вчера"}</button>
          ))}
        </div>
        <span className="tiny muted">{game === "bj" ? "Кто больше всех выиграл за день (выплаты минус ставки)" : "Лучшая комбинация дня; при равной — кто собрал раньше"}. День — по Москве.</span>
        <div className="dt-list">
          {!data ? <span className="tiny muted center">Загружаем…</span>
            : !data.top.length ? <span className="tiny muted center">{day === "today" ? "Сегодня ещё никого — будь первым!" : "Вчера никто не играл"}</span>
            : data.top.map((r) => (
              <div key={r.id} className={`dt-row p${r.place} ${r.id === state?.player.id ? "me" : ""}`}>
                <span className="dt-place">{MEDAL[r.place - 1] ?? <b className="num">{r.place}</b>}</span>
                <Avatar name={r.name} photo={r.photo} size={30} />
                <b className="ellipsis grow">{r.name}</b>
                <span className="dt-val">{value(r)}</span>
              </div>
            ))}
        </div>
        {data?.me && !meIn && (
          <div className="dt-row me mine">
            <span className="dt-place"><b className="num">{data.me.place ?? "—"}</b></span>
            <span className="grow">Ты</span>
            <span className="dt-val">{game === "bj" ? <><b className="num">{data.me.value > 0 ? "+" : ""}{money(data.me.value)}</b> <Icon name="USD" size={14} /></> : <b>{handName(data.me.hand)}</b>}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * The day's leader on an old sheet of paper in the top-left corner of the game window (tilted, a bit off the screen):
 * avatar, nick and what he got. Early in the day, while nobody has played, yesterday's. A tap opens the whole top.
 */
export function DayTopNote({ game, refresh = 0 }: { game: "bj" | "poker"; refresh?: number }) {
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState<{ row: Row; day: "today" | "yesterday" } | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await api.get<Top>(`/api/game-day?game=${game}&day=today`);
        if (t.top[0]) { if (alive) setLead({ row: t.top[0], day: "today" }); return; }
        const y = await api.get<Top>(`/api/game-day?game=${game}&day=yesterday`);
        if (alive) setLead(y.top[0] ? { row: y.top[0], day: "yesterday" } : null);
      } catch {
        if (alive) setLead(null);
      }
    })();
    return () => { alive = false; };
  }, [game, refresh]);
  return (
    <>
      <button type="button" className="dt-note" onClick={() => { haptic.tap(); setOpen(true); }} aria-label="Топ дня">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="dt-note-bg" src="/assets/yard/top-paper.webp" alt="" draggable={false} />
        <span className="dt-note-in">
          <b className="dt-note-h">{lead?.day === "yesterday" ? "Топ вчера" : "Топ дня"}</b>
          {lead ? (
            <>
              <span className="dt-note-who">
                <Avatar name={lead.row.name} photo={lead.row.photo} size={22} />
                <i className="ellipsis">{lead.row.name}</i>
              </span>
              <b className="dt-note-val">{game === "bj" ? <>+{money(lead.row.value)} $</> : handName(lead.row.hand)}</b>
            </>
          ) : <span className="dt-note-none">{lead === undefined ? "…" : "пока никого"}</span>}
        </span>
      </button>
      {open && <DayTopWindow game={game} onClose={() => setOpen(false)} />}
    </>
  );
}
