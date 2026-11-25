"use client";
/*
 * Друзья (the user 2026-11-25; it was the top of all the players) — полоска над нижним меню: я и мои друзья по
 * авторитету, аватар, под ним место среди нас, зелёная точка — сейчас в игре. Друзей добавляют кнопкой [+] в комнате
 * игрока (systems/friends.ts). Полоску можно свернуть (остаётся язычок «Друзья»), выбор помнится в браузере. Данные — /api/top.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { useGame } from "./store.tsx";
import { Avatar } from "./ui.tsx";
import { Icon } from "./art/icons.tsx";

interface TopRow { id: number; name: string; photo: string | null; xp: number; place: number; frame: string | null; online: boolean }
interface TopView { friends: TopRow[]; online: number }

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
    // only while the game is on screen: a minimized app must not keep the database awake
    const t = window.setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  // the page below makes room for the open strip
  useEffect(() => {
    document.documentElement.style.setProperty("--strip-h", open && data?.friends.length ? "74px" : "0px");
    return () => { document.documentElement.style.setProperty("--strip-h", "0px"); };
  }, [open, data?.friends.length]);
  const set = (v: boolean) => {
    setOpen(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ }
  };
  const toggle = () => set(!open);
  // a tap anywhere outside the open strip folds it away
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".leaders")) set(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);
  if (!data?.friends.length) return null;
  const meId = state?.player.id;
  return (
    <div className={`leaders ${open ? "open" : "closed"}`}>
      <button className="leaders-tab" onClick={toggle} aria-expanded={open} aria-label={open ? "Скрыть друзей" : "Показать друзей"}>
        <Icon name="xp" size={14} /> Друзья{data.online > 0 && <span className="leaders-online"><i />{data.online}</span>} <i className="leaders-arrow">▾</i>
      </button>
      {/* always there: opening and closing slide it (the height), folded it takes no taps */}
      <div className="leaders-row" inert={!open} aria-hidden={!open}>
          {data.friends.map((r) => (
            <Link key={r.id} href={`/profile?id=${r.id}`} className={`leader p${Math.min(r.place, 4)} ${r.id === meId ? "me" : ""}`} title={`${r.place}. ${r.name} · ${r.xp.toLocaleString("ru-RU")} авторитета${r.online ? " · в игре" : ""}`}>
              <span className="leader-av">
                <Avatar name={r.name} photo={r.photo} size={40} frame={r.frame} />
                {r.online && <i className="leader-on" aria-label="в игре" />}
              </span>
              <b className="leader-n num">{r.place}</b>
            </Link>
          ))}
          <Link href="/rating" className="leader more" aria-label="Весь рейтинг">›</Link>
      </div>
    </div>
  );
}
