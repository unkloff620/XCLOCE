"use client";
/*
 * A computer's wide screen: the game stays a phone-wide column in the middle, and the empty sides get panels a phone
 * has no room for. Left — today: the daily tasks (claim right here), the automation toggles of today, the events on
 * now. Right — the players by authority (who is in the game) and the clan chat's last messages.
 * Shown only when the window leaves at least WIDE_SIDE px on each side of the column and «Как на телефоне» is off;
 * on a phone nothing changes.
 */
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api.ts";
import { useGame, useNow } from "./store.tsx";
import { Avatar, RewardChips } from "./ui.tsx";
import { Icon } from "./art/icons.tsx";
import { haptic } from "./telegram.ts";
import { clock } from "./format.ts";
import { leftText } from "./event-banner.tsx";
import { isPhoneMode, onPhoneModeChange } from "./phone-mode.ts";
import { monthTaskOf } from "../content/monthly.ts";
import { questById } from "../content/quests.ts";
import { bossById } from "../content/bosses.ts";
import { locationById } from "../content/locations.ts";
import { EVENT_BOSSES } from "../content/event-bosses.ts";
import { fightMode } from "../content/medals.ts";

/** the column is 480 px; a side panel needs at least this much room */
const WIDE_SIDE = 250;
const COL = 480;

function useWide(): boolean {
  const phone = useSyncExternalStore(onPhoneModeChange, isPhoneMode, () => false);
  const [w, setW] = useState(0);
  useEffect(() => {
    const set = () => setW(window.innerWidth);
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, []);
  return !phone && (w - COL) / 2 >= WIDE_SIDE;
}

interface TopRow { id: number; name: string; photo: string | null; xp: number; place: number; frame: string | null; online: boolean }
interface TopView { top: TopRow[]; me: { place: number | null; xp: number } | null; online: number }
type Msg = { id: number; pid: number | null; name: string; photo: string | null; text: string; at: number };

/** polls an endpoint while the game is on screen (a minimized app must not keep the database awake) */
function usePoll<T>(url: string | null, every: number): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const load = () => api.get<T>(url).then((v) => { if (alive) setData(v); }).catch(() => {});
    load();
    const t = window.setInterval(() => document.visibilityState === "visible" && load(), every);
    return () => { alive = false; clearInterval(t); };
  }, [url, every]);
  return data;
}

function Box({ title, icon, right, children }: { title: string; icon?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="wp-box">
      <header className="wp-head">{icon && <Icon name={icon} size={16} />}<b>{title}</b><span className="grow" />{right}</header>
      <div className="wp-body">{children}</div>
    </section>
  );
}

/** «От звонка до звонка»: today's делюга and the days closed (the window — from the home menu) */
function Monthly() {
  const { state } = useGame();
  const now = useNow();
  const m = state?.monthly;
  if (!m) return null;
  const task = monthTaskOf(m.today);
  const done = !!m.closed[m.today];
  return (
    <Box title="Делюга дня" icon="clock" right={<span className="wp-muted num">{clock(m.resetAt - now)}</span>}>
      {task && (
        <div className={`wp-quest ${done ? "done" : ""}`}>
          <span className="wp-quest-t">{task.title}</span>
          {done ? <span className="wp-ok">✓</span> : <span className="wp-muted num">{m.progress}/{task.target}</span>}
          {!done && <i className="wp-bar" style={{ ["--p" as string]: `${Math.round((m.progress / task.target) * 100)}%` }} />}
        </div>
      )}
      <div className="wp-quest"><span className="wp-quest-t">Закрыто дней</span><span className="wp-muted num">{m.closedN}/{m.days}</span></div>
      {m.claimable && <span className="wp-muted">Есть награда — открой «Делюги» дома</span>}
    </Box>
  );
}

function Quests() {
  const { state, act, busy } = useGame();
  const now = useNow();
  const q = state?.quests;
  if (!q) return null;
  if (state?.monthly) return <Monthly />;
  const left = q.list.filter((x) => !x.claimed).length;
  return (
    <Box title="Задания дня" icon="clock" right={<span className="wp-muted num">{clock(q.resetAt - now)}</span>}>
      {q.list.map((x) => {
        const def = questById(x.id);
        if (!def) return null;
        return (
          <div key={x.id} className={`wp-quest ${x.claimed ? "done" : ""}`}>
            <span className="wp-quest-t">{def.title}</span>
            {x.claimed ? <span className="wp-ok">✓</span>
              : x.done ? <button className="btn gold sm" disabled={busy === "quest_claim"} onClick={async () => { if (await act("quest_claim", { id: x.id })) haptic.ok(); }}>Забрать</button>
              : <span className="wp-muted num">{x.progress}/{x.target}</span>}
            {!x.claimed && <i className="wp-bar" style={{ ["--p" as string]: `${Math.round((x.progress / x.target) * 100)}%` }} />}
          </div>
        );
      })}
      <div className="wp-quest">
        <span className="wp-quest-t"><b>Сундук дня</b></span>
        {q.chest.opened ? <span className="wp-ok">✓</span>
          : q.chest.ready ? <button className="btn gold sm" disabled={busy === "quest_chest"} onClick={async () => { if (await act("quest_chest")) haptic.big(); }}>Открыть</button>
          : <span className="wp-muted">ещё {left}</span>}
      </div>
      {q.chest.reward && <RewardChips r={q.chest.reward} size={14} />}
    </Box>
  );
}

function Autos() {
  const { state } = useGame();
  const a = state?.autos;
  const bosses = Object.entries(a?.bosses ?? {});
  return (
    <Box title="Автоматика сегодня" icon="energy">
      {!a?.zone && !bosses.length && <span className="wp-muted">Ничего не включено. Тумблеры — на двери босса и на карточке локации, включаются на день.</span>}
      {a?.zone && <Link href="/locations" className="wp-row"><span className="wp-dot on" />Задания: {locationById(a.zone)?.name ?? a.zone}</Link>}
      {bosses.map(([id, mode]) => (
        <Link key={id} href={`/bosses/${id}`} className="wp-row"><span className="wp-dot on" />Автобой: {bossById(id)?.name ?? id} · {fightMode(mode).name}</Link>
      ))}
    </Box>
  );
}

function Events() {
  const { state } = useGame();
  const now = useNow();
  const rows: { key: string; href: string; text: React.ReactNode }[] = [];
  if (state?.heist) rows.push({ key: "heist", href: "/event/heist", text: <>Взлом{state.heist.on && state.heist.endsAt ? <> · ещё {leftText(state.heist.endsAt - now)}</> : " · довскрыть ящики"} · ящиков {state.heist.boxes.length}/{state.heist.slots}</> });
  if (state?.tosya && state.tosya.next !== null) rows.push({ key: "tosya", href: "/event/tosya", text: <>Тося приехал · ещё {leftText(state.tosya.endsAt - now)}</> });
  for (const b of EVENT_BOSSES.filter((x) => state?.eventBosses?.includes(x.id))) rows.push({ key: b.id, href: b.href, text: <>Ивент-босс: {b.name}</> });
  if (!rows.length) return null;
  return (
    <Box title="Сейчас идёт" icon="sun">
      {rows.map((r) => <Link key={r.key} href={r.href} className="wp-row"><span className="wp-dot hot" />{r.text}</Link>)}
    </Box>
  );
}

function Top() {
  const { state } = useGame();
  const data = usePoll<TopView>("/api/top", 60_000);
  if (!data?.top.length) return null;
  const me = state?.player.id;
  return (
    <Box title="Игроки" icon="xp" right={<span className="wp-muted"><i className="wp-dot on" />{data.online} в игре</span>}>
      {data.top.slice(0, 12).map((r) => (
        <Link key={r.id} href={`/profile?id=${r.id}`} className={`wp-player ${r.id === me ? "me" : ""}`}>
          <b className="num wp-place">{r.place}</b>
          <span className="wp-av"><Avatar name={r.name} photo={r.photo} size={28} frame={r.frame} />{r.online && <i className="wp-dot on" />}</span>
          <span className="wp-name">{r.name}</span>
          <span className="num wp-muted">{r.xp.toLocaleString("ru-RU")}</span>
        </Link>
      ))}
      {data.me?.place && !data.top.slice(0, 12).some((r) => r.id === me) && <Link href="/rating" className="wp-row">Твоё место: <b className="num">{data.me.place}</b></Link>}
      <Link href="/rating" className="wp-more">Весь рейтинг ›</Link>
    </Box>
  );
}

function Chat() {
  const { state } = useGame();
  const clan = state?.clan;
  const chat = usePoll<{ msgs: Msg[] }>(clan ? "/api/clan-chat" : null, 15_000);
  if (!clan) return null;
  const msgs = (chat?.msgs ?? []).slice(-8);
  return (
    <Box title={`Клан [${clan.tag}]`} icon="mail">
      {!msgs.length && <span className="wp-muted">В чате пока тихо.</span>}
      {msgs.map((m) => (
        <div key={m.id} className="wp-msg"><b>{m.name}:</b> {m.text}</div>
      ))}
      <Link href={`/clans/${clan.id}`} className="wp-more">Открыть чат ›</Link>
    </Box>
  );
}

export function WidePanels() {
  const wide = useWide();
  const { state } = useGame();
  if (!wide || !state) return null;
  return (
    <>
      <aside className="wp-side left"><Quests /><Events /><Autos /></aside>
      <aside className="wp-side right"><Top /><Chat /></aside>
    </>
  );
}
