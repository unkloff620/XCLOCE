"use client";
/*
 * Друзья (the user 2026-11-25; it was the top of all the players) — полоска над нижним меню: я и мои друзья по
 * авторитету, аватар, под ним место среди нас, зелёная точка — сейчас в игре. Друзей добавляют кнопкой [+] в комнате
 * игрока (systems/friends.ts). Полоску можно свернуть (остаётся язычок «Друзья»), выбор помнится в браузере. Данные — /api/top.
 * Слева — язычок «Топ 100» (2026-11-28): та же полоска с первой сотней игры по авторитету (/api/top100).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { useGame } from "./store.tsx";
import { Avatar, Modal } from "./ui.tsx";
import { Icon } from "./art/icons.tsx";
import { fromGameId, gameId } from "../content/social.ts";

interface TopRow { id: number; name: string; photo: string | null; xp: number; place: number; frame: string | null; online: boolean }
interface TopView { friends: TopRow[]; online: number }
interface Top100 { top: TopRow[]; me: { place: number; xp: number } | null; online: number }
type Panel = "friends" | "top" | null;

const KEY = "xc2_leaders_open";
// "1" (or nothing) — the friends open, "top" — «Топ 100» open, "0" — folded
const readOpen = (): Panel => {
  try { const v = localStorage.getItem(KEY); return v === "0" ? null : v === "top" ? "top" : "friends"; } catch { return "friends"; }
};

/** a player in the strip: avatar, the place under it, the green dot when in the game */
function Leader({ r, me }: { r: TopRow; me: boolean }) {
  return (
    <Link href={`/profile?id=${r.id}`} className={`leader p${Math.min(r.place, 4)} ${me ? "me" : ""}`} title={`${r.place}. ${r.name} · ${r.xp.toLocaleString("ru-RU")} авторитета${r.online ? " · в игре" : ""}`}>
      <span className="leader-av">
        <Avatar name={r.name} photo={r.photo} size={40} frame={r.frame} />
        {r.online && <i className="leader-on" aria-label="в игре" />}
      </span>
      <b className="leader-n num">{r.place}</b>
    </Link>
  );
}

/**
 * The strip above the bottom menu with two tabs: «Друзья» on the right (me and my friends by authority) and «Топ 100»
 * on the left (the first hundred players of the game by authority, the user 2026-11-28; /api/top100). One open at a time.
 */
export function LeadersStrip() {
  const { state } = useGame();
  const [open, setOpen] = useState<Panel>("friends");
  const [data, setData] = useState<TopView | null>(null);
  const [top, setTop] = useState<Top100 | null>(null);
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
  // «Топ 100»: loaded when opened (and again every minute while it is open)
  useEffect(() => {
    if (open !== "top") return;
    let alive = true;
    const load = () => api.get<Top100>("/api/top100").then((v) => { if (alive) setTop(v); }).catch(() => {});
    load();
    const t = window.setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [open]);
  const hasFriends = !!data?.friends.length;
  const shown: Panel = open === "friends" && !hasFriends ? null : open;
  // the page below makes room for the open strip
  useEffect(() => {
    document.documentElement.style.setProperty("--strip-h", shown ? "74px" : "0px");
    return () => { document.documentElement.style.setProperty("--strip-h", "0px"); };
  }, [shown]);
  const set = (v: Panel) => {
    setOpen(v);
    try { localStorage.setItem(KEY, v === null ? "0" : v === "top" ? "top" : "1"); } catch { /* private mode */ }
  };
  // a tap anywhere outside the open strip folds it away
  useEffect(() => {
    if (!shown) return;
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".leaders")) set(null);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [shown]);
  const meId = state?.player.id;
  const meInTop = !!top?.top.some((r) => r.id === meId);
  return (
    <div className={`leaders ${shown ? "open" : "closed"} ${shown === "top" ? "is-top" : ""}`}>
      <button className={`leaders-tab left ${shown === "top" ? "on" : ""}`} onClick={() => set(shown === "top" ? null : "top")} aria-expanded={shown === "top"} aria-label={shown === "top" ? "Скрыть топ 100" : "Показать топ 100"}>
        <Icon name="xp" size={14} /> Топ 100 <i className="leaders-arrow">▾</i>
      </button>
      {hasFriends && (
        <button className={`leaders-tab ${shown === "friends" ? "on" : ""}`} onClick={() => set(shown === "friends" ? null : "friends")} aria-expanded={shown === "friends"} aria-label={shown === "friends" ? "Скрыть друзей" : "Показать друзей"}>
          <Icon name="xp" size={14} /> Друзья{data!.online > 0 && <span className="leaders-online"><i />{data!.online}</span>} <i className="leaders-arrow">▾</i>
        </button>
      )}
      {/* always there: opening and closing slide it (the height), folded it takes no taps */}
      <div className="leaders-row" inert={!shown} aria-hidden={!shown}>
        {shown === "top" ? (
          <>
            {/* my own place first when I am not in the hundred */}
            {top?.me && !meInTop && state && (
              <Leader r={{ id: state.player.id, name: state.player.name, photo: state.player.photo ?? null, xp: top.me.xp, place: top.me.place, frame: null, online: true }} me />
            )}
            {top?.top.map((r) => <Leader key={r.id} r={r} me={r.id === meId} />)}
            <Link href="/rating" className="leader more" aria-label="Весь рейтинг">›</Link>
          </>
        ) : (
          <>
            {data?.friends.map((r) => <Leader key={r.id} r={r} me={r.id === meId} />)}
            {/* a player found by his game id (on his dossier's cover) — the way to add a friend */}
            <button type="button" className="leader more find" onClick={() => setFind(true)} aria-label="Найти по ID" title="Найти по ID">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M15 15l6 6" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" /></svg>
            </button>
            <Link href="/rating" className="leader more" aria-label="Весь рейтинг">›</Link>
          </>
        )}
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
    const id = fromGameId(Number(q.trim()));
    if (!id) { setMiss(true); setFound(null); return; }
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
            <small className="muted">ID {gameId(found.id)} · уровень {found.level}</small>
          </span>
          <span className="btn green sm">{found.self ? "Это ты" : "В комнату"}</span>
        </button>
      )}
    </Modal>
  );
}
