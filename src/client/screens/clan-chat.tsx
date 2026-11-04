"use client";
/** The clan chat (server: systems/clan-chat.ts): the members' messages, refreshed every few seconds while it is open. */
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { useGame } from "../store.tsx";
import { Avatar } from "../ui.tsx";

type Msg = { id: number; pid: number | null; name: string; photo: string | null; leader: boolean; text: string; at: number };
type Chat = { clanId: number; me: number; leader: boolean; msgs: Msg[] };
const MAX = 300;
const POLL = 4000;

const hm = (t: number) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const dayKey = (t: number) => new Date(t).toDateString();
function dayName(t: number) {
  const d = new Date(t), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function ClanChat() {
  const { toast, refresh, state } = useGame();
  const unread = useRef(0);
  unread.current = state?.clanRequests?.chat ?? 0;
  const [chat, setChat] = useState<Chat | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastId = useRef(0);

  const load = useCallback(async () => {
    try {
      const c = await api.get<Chat>("/api/clan-chat");
      setChat(c);
      // the server marked them seen: take the dot off the Clans tab
      if (unread.current > 0) void refresh();
    } catch { /* the next poll tries again */ }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), POLL);
    return () => clearInterval(t);
  }, [load, refresh]);

  // new messages: keep the list at the bottom (unless the player scrolled up to read)
  useLayoutEffect(() => {
    const el = list.current;
    const last = chat?.msgs.at(-1)?.id ?? 0;
    if (!el || last === lastId.current) return;
    const first = lastId.current === 0;
    lastId.current = last;
    if (first || stick.current) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const c = await api.post<Chat>("/api/clan-chat", { text: t });
      setText("");
      stick.current = true;
      setChat(c);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSending(false);
    }
  };
  const remove = async (id: number) => {
    setPicked(null);
    try { setChat(await api.post<Chat>("/api/clan-chat", { delete: id })); } catch (e) { toast((e as Error).message, "err"); }
  };

  return (
    <div className="panel cchat">
      <div ref={list} className="cchat-list" onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}>
        {!chat ? <p className="cchat-empty muted small">Загрузка…</p> : chat.msgs.length === 0 ? (
          <p className="cchat-empty muted small">Тут пока тихо. Напиши первым — поздоровайся с братвой 👋</p>
        ) : chat.msgs.map((m, i) => {
          const prev = chat.msgs[i - 1];
          const day = !prev || dayKey(prev.at) !== dayKey(m.at) ? <div className="cchat-day"><span>{dayName(m.at)}</span></div> : null;
          if (m.pid == null) return <div key={m.id}>{day}<div className="cchat-news">{m.text}</div></div>;
          const mine = m.pid === chat.me;
          const cont = !day && prev && prev.pid === m.pid && m.at - prev.at < 5 * 60_000;
          const canDel = mine || chat.leader;
          return (
            <div key={m.id}>
              {day}
              <div className={`cchat-msg${mine ? " mine" : ""}${cont ? " cont" : ""}`}>
                {!mine && (cont ? <span className="cchat-ava" /> : <Link href={`/profile?id=${m.pid}`} className="cchat-ava"><Avatar name={m.name} photo={m.photo} size={30} /></Link>)}
                <div className={`cchat-bub${picked === m.id ? " on" : ""}`} onClick={() => canDel && setPicked(picked === m.id ? null : m.id)}>
                  {!mine && !cont && <b className={`cchat-name${m.leader ? " lead" : ""}`}>{m.leader ? "👑 " : ""}{m.name}</b>}
                  <span className="cchat-text">{m.text}</span>
                  <span className="cchat-time">{hm(m.at)}</span>
                  {picked === m.id && <button className="btn sm red cchat-del" onClick={(e) => { e.stopPropagation(); void remove(m.id); }}>Удалить</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form className="cchat-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea className="input cchat-input" rows={1} maxLength={MAX} placeholder="Сообщение клану…" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <button className="btn green cchat-send" type="submit" disabled={sending || !text.trim()} aria-label="Отправить">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 11.5 21 3l-6.5 18-3-7.5L3 11.5Z" fill="#fff3e3" stroke="#0b0604" strokeWidth="2" strokeLinejoin="round" /><path d="M11.5 13.5 21 3" stroke="#0b0604" strokeWidth="2" /></svg>
        </button>
      </form>
      {text.length > MAX - 50 && <span className="tiny muted cchat-count">{text.length}/{MAX}</span>}
    </div>
  );
}
