"use client";
/*
 * Все игроки по авторитету — полоска над нижним меню: аватар, под ним место, зелёная точка — сейчас в игре. Свою
 * строчку игрок видит, даже если он дальше списка. Полоску можно свернуть (остаётся маленький язычок «Игроки»), выбор помнится в браузере. Данные — /api/top.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { useGame } from "./store.tsx";
import { Avatar } from "./ui.tsx";
import { Icon } from "./art/icons.tsx";

interface TopRow { id: number; name: string; photo: string | null; xp: number; place: number; frame: string | null; online: boolean }
interface TopView { top: TopRow[]; me: { place: number | null; xp: number } | null; online: number }

const KEY = "xc2_leaders_open";
const readOpen = () => {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
};

export function LeadersStrip() {
  const { state } = useGame();
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<TopView | null>(null);
  useEffect(() => setOpen(readOpen()), []);
  useEffect(() => {
    let alive = true;
    const load = () => api.get<TopView>("/api/top").then((v) => { if (alive) setData(v); }).catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  // the page below makes room for the open strip
  useEffect(() => {
    document.documentElement.style.setProperty("--strip-h", open && data?.top.length ? "74px" : "0px");
    return () => { document.documentElement.style.setProperty("--strip-h", "0px"); };
  }, [open, data?.top.length]);
  const toggle = () => {
    const v = !open;
    setOpen(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ }
  };
  if (!data?.top.length) return null;
  const meId = state?.player.id;
  const inTop = data.top.some((r) => r.id === meId);
  return (
    <div className={`leaders ${open ? "open" : "closed"}`}>
      <button className="leaders-tab" onClick={toggle} aria-expanded={open} aria-label={open ? "Скрыть лидеров" : "Показать лидеров"}>
        <Icon name="xp" size={14} /> Игроки{data.online > 0 && <span className="leaders-online"><i />{data.online}</span>} <i>{open ? "▾" : "▴"}</i>
      </button>
      {open && (
        <div className="leaders-row">
          {data.top.map((r) => (
            <Link key={r.id} href={`/profile?id=${r.id}`} className={`leader p${Math.min(r.place, 4)} ${r.id === meId ? "me" : ""}`} title={`${r.place}. ${r.name} · ${r.xp.toLocaleString("ru-RU")} авторитета${r.online ? " · в игре" : ""}`}>
              <span className="leader-av">
                <Avatar name={r.name} photo={r.photo} size={40} frame={r.frame} />
                {r.online && <i className="leader-on" aria-label="в игре" />}
              </span>
              <b className="leader-n num">{r.place}</b>
            </Link>
          ))}
          {!inTop && state && data.me?.place && (
            <Link href="/rating" className="leader me" title={`Твоё место: ${data.me.place}`}>
              <span className="leader-av">
                <Avatar name={state.player.name} photo={state.player.photo} size={40} />
                <i className="leader-on" aria-label="в игре" />
              </span>
              <b className="leader-n num">{data.me.place}</b>
            </Link>
          )}
          <Link href="/rating" className="leader more" aria-label="Весь рейтинг">›</Link>
        </div>
      )}
    </div>
  );
}
