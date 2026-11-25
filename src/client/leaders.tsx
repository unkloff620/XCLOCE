"use client";
/*
 * Друзья (the user 2026-11-25; it was the top of all the players) — полоска над нижним меню: я и мои друзья по
 * авторитету, аватар, под ним место среди нас, зелёная точка — сейчас в игре. Друзей добавляют кнопкой [+] в комнате
 * игрока (systems/friends.ts). Полоску можно свернуть (остаётся язычок «Друзья»), выбор помнится в браузере. Данные — /api/top.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { useGame } from "./store.tsx";
import { Avatar, Modal } from "./ui.tsx";
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
  const [find, setFind] = useState(false);
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
          {/* a player found by his game id (on his dossier's cover) — the way to add a friend */}
          <button type="button" className="leader more find" onClick={() => setFind(true)} aria-label="Найти по ID" title="Найти по ID">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M15 15l6 6" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" /></svg>
          </button>
          <Link href="/rating" className="leader more" aria-label="Весь рейтинг">›</Link>
      </div>
      {find && createPortal(<FindById onClose={() => setFind(false)} />, document.body)}
    </div>
  );
}

interface Found { id: number; name: string; photo: string | null; frame: string | null; level: number; self?: boolean }

/** «Найти по ID»: his number → his avatar and nick → into his room (the [+] is there) */
function FindById({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [miss, setMiss] = useState(false);
  const search = async () => {
    const id = Number(q.trim());
    if (!Number.isSafeInteger(id) || id <= 0) { setMiss(true); setFound(null); return; }
    setBusy(true);
    try {
      const p = await api.get<Found>(`/api/profile?id=${id}`);
      setFound(p); setMiss(false);
    } catch { setFound(null); setMiss(true); }
    setBusy(false);
  };
  const go = (id: number) => { onClose(); router.push(`/profile?id=${id}`); };
  return (
    <Modal title="Найти по ID" onClose={onClose}>
      <form className="find-id" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input className="input grow" inputMode="numeric" pattern="[0-9]*" placeholder="ID игрока" value={q} autoFocus
          onChange={(e) => { setQ(e.target.value.replace(/\D/g, "").slice(0, 12)); setMiss(false); }} />
        <button type="submit" className="btn gold" disabled={busy || !q}>Найти</button>
      </form>
      {miss && <p className="small muted" style={{ margin: "10px 0 0", textAlign: "center" }}>Игрока с таким ID нет</p>}
      {found && (
        <button type="button" className="find-id-row" onClick={() => go(found.id)}>
          <Avatar name={found.name} photo={found.photo} size={44} frame={found.frame} />
          <span className="grow" style={{ minWidth: 0, textAlign: "left" }}>
            <b className="ellipsis" style={{ display: "block" }}>{found.name}</b>
            <small className="muted">ID {found.id} · уровень {found.level}</small>
          </span>
          <span className="btn green sm">{found.self ? "Это ты" : "В комнату"}</span>
        </button>
      )}
    </Modal>
  );
}
