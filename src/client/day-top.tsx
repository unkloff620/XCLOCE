"use client";
/*
 * The daily tops of the mini-games (server: systems/minigame-extras.ts dayTop): blackjack — who won the most today,
 * poker — the best combination of the day (equal hands: who got it first). A trophy button in the game window opens it.
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

/** the trophy in the corner of a game window */
export function DayTopButton({ game }: { game: "bj" | "poker" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="dt-btn" onClick={() => { haptic.tap(); setOpen(true); }} aria-label="Топ дня">🏆<small>Топ дня</small></button>
      {open && <DayTopWindow game={game} onClose={() => setOpen(false)} />}
    </>
  );
}
