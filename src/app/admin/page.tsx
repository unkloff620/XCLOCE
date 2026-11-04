"use client";
/*
 * XCLOSE admin panel (outside the game): /admin. Sign-in from the Telegram app (Mini App) or the Login Widget; the Telegram id must be in
 * ADMIN_TELEGRAM_IDS. Overview, players, a player's card (edit money, items, authority, energy, talents, name, ban),
 * the action log and the admins' own log. Sections: Обзор, Игра (live controls), Игроки, Аналитика, Журнал — in the URL hash,
 * so a player's card can be linked: #player/42.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./admin.css";
import { ITEMS, itemById, type ItemDef, type Slot } from "../../content/items.ts";
import { ItemArt } from "../../client/art/items.tsx";
import { Icon } from "../../client/art/icons.tsx";
import { CURRENCIES } from "../../content/currencies.ts";
import { EXTRA_NAMES, TALENT_PATH, talentStop } from "../../content/talents.ts";
import { BOSSES, bossById, bossHasArt, keyId, unlockBossOf } from "../../content/bosses.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";
import { offerById } from "../../content/shop.ts";
import { taskById } from "../../content/locations.ts";
import { EVENT_EFFECTS, FOREVER, effectLines, cleanEffects, type BossTweak } from "../../content/events.ts";

const TOKEN_KEY = "xcloce.admin";
const ACTION_TYPES = [
  "fight_start", "fight_claim", "fight_flee", "task", "location_claim", "yard_pick", "buy", "exchange", "use", "equip", "unequip",
  "clan_create", "clan_join", "clan_leave", "clan_kick", "clan_transfer", "stash_wish", "stash_gift", "stash_accept", "clan_edit", "daily_claim", "sell", "rename", "slots_spin",
  "equipment_upgrade", "talent_up", "talent_reset", "room_buy", "room_set", "look_set", "decor_set", "decor_save", "piece_buy", "quest_claim", "quest_chest",
  "notify_set", "achievement_claim", "achievement_claim_all", "ach_box_open", "prize_claim", "game_start", "zonk_move", "poker_play", "bj_open", "bj_invite", "bj_join", "bj_leave", "bj_bet", "bj_move", "upgrade", "up_sell", "up_take", "clan_cancel", "clan_accept", "clan_reject", "stash_collect",
];
const ACTION_NAMES: Record<string, string> = {
  fight_start: "начал бой", fight_claim: "забрал награду боя", fight_flee: "сбежал из боя", task: "задание", location_claim: "награда локации",
  yard_pick: "находка во дворе", buy: "покупка", exchange: "обмен", use: "использовал", equip: "надел", unequip: "снял",
  clan_create: "создал клан", clan_join: "заявка в клан", clan_leave: "вышел из клана", clan_kick: "исключил из клана", clan_transfer: "передал лидерство", stash_wish: "попросил нычки", stash_gift: "отправил нычку", stash_accept: "принял нычки", clan_edit: "изменил клан",
  daily_claim: "ежедневная награда", sell: "продажа", rename: "смена имени", slots_spin: "автомат 777", equipment_upgrade: "улучшение комнаты",
  talent_up: "талант", talent_reset: "сброс талантов", room_buy: "купил комнату", room_set: "сменил комнату", look_set: "внешность", decor_set: "декор", decor_save: "обставил комнату", piece_buy: "купил мебель",
  quest_claim: "задание дня", quest_chest: "сундук дня", notify_set: "уведомления", achievement_claim: "достижение", prize_claim: "приз недели",
  game_start: "мини-игра", zonk_move: "зонк", zonk_give_up: "зонк: сдался", poker_play: "покер", poker_swap: "покер: замена", poker_stand: "покер: вскрыл", bj_open: "блэкджек: стол", bj_invite: "блэкджек: позвал", bj_join: "блэкджек: сел", bj_leave: "блэкджек: встал", bj_bet: "блэкджек: ставка", bj_move: "блэкджек: ход", upgrade: "апгрейдер", up_sell: "продал улучшенное", up_take: "забрал улучшенное", clan_cancel: "отменил заявку", clan_accept: "принял в клан", clan_reject: "отклонил заявку", stash_collect: "собрал набор нычек",
};
const OP_NAMES: Record<string, string> = {
  set_money: "валюта", set_item: "предмет", add_item: "выдал", set_xp: "авторитет", set_poker_xp: "опыт покера", set_zonk_xp: "опыт зонка", set_energy: "энергия", set_talents: "свободные таланты",
  set_talent: "ветка таланта", set_name: "имя", ban: "бан", unban: "разбан", reset: "сброс прогресса", boss_limit_reset: "сброс лимита боссов", give_tattoo_set: "сет наколок",
};

// ---------------- api ----------------
let token: string | null = null;
function loadToken() {
  try { token = localStorage.getItem(TOKEN_KEY); } catch { token = null; }
}
function saveToken(t: string | null) {
  token = t;
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}
class ApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}
async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j?.error?.message ?? `Ошибка ${r.status}`, r.status, j?.error?.code ?? "error");
  return j as T;
}
const admin = <T,>(op: string, args: Record<string, unknown> = {}) => call<T>("/api/admin", { op, ...args });

// ---------------- formatting ----------------
type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const fmt = (v: unknown) => num(v).toLocaleString("ru-RU", { maximumFractionDigits: 8 });
function when(v: unknown) {
  if (!v) return "—";
  const d = new Date(typeof v === "number" ? v : String(v));
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function ago(v: unknown) {
  if (!v) return "—";
  const s = Math.max(0, (Date.now() - new Date(String(v)).getTime()) / 1000);
  if (s < 60) return "только что";
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return `${Math.floor(s / 86400)} дн назад`;
}
/** «через 2 ч 15 мин» / «через 3 дн 4 ч» to a moment (ms) */
function inTime(t: number | null | undefined, now = Date.now()) {
  if (!t) return "—";
  const m = Math.max(0, Math.round((t - now) / 60_000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d} дн ${h} ч` : h ? `${h} ч ${mm} мин` : `${Math.max(1, mm)} мин`;
}
/** re-renders every 30 s (the countdowns) */
function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
}
const who = (r: Row) => `${r.display_name ?? "?"}${r.username ? ` @${r.username}` : ""}`;
function infoText(v: unknown): string {
  if (!v) return "";
  if (typeof v === "object") return Object.entries(v as Row).map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : x}`).join(", ");
  return String(v);
}

/** Entries logged before readable texts were stored as JSON of the request: show them in words too. */
function legacyInfo(v: unknown): string {
  const s = String(v ?? "");
  if (!s.startsWith("{")) return s;
  try {
    const j = JSON.parse(s) as Row;
    const out: string[] = [];
    for (const [k, x] of Object.entries(j)) {
      if (k === "offerId") out.push(`«${offerById(String(x))?.title ?? x}»`);
      else if (k === "taskId") out.push(`«${taskById(String(x))?.task.title ?? x}»`);
      else if (k === "boss") out.push(bossById(String(x))?.name ?? String(x));
      else if (k === "itemId") out.push(typeof x === "number" ? `находка #${x} (что именно — не записано)` : itemById(String(x))?.name ?? String(x));
      else if (k === "qty") out.push(`×${x}`);
      else if (k === "solo") out.push(x ? "соло" : "");
      else out.push(`${k}: ${typeof x === "object" ? JSON.stringify(x) : x}`);
    }
    return out.filter(Boolean).join(" · ");
  } catch {
    return s;
  }
}

// ---------------- routing ----------------
/*
 * Sections (the URL hash): #dash — overview; #live/<sub> — running the game (works, broadcast, Тося, bosses, events,
 * the exchanger); #players and #player/<id>; #stats/<sub> — analytics; #log/<sub> — the action log and the admins' edits
 * (#actions?… is the action log with filters, for links).
 */
type ActionsQuery = { type?: string; failed?: boolean; sinceHours?: number; playerId?: string };
type View =
  | { tab: "dash" }
  | { tab: "live"; sub: LiveSub }
  | { tab: "players" }
  | { tab: "player"; id: number }
  | { tab: "stats"; sub: StatsSub }
  | { tab: "log"; sub: "actions" | "admins"; q: ActionsQuery; key: string };
type LiveSub = "works" | "news" | "tosya" | "bosses" | "events" | "exchange";
type StatsSub = "funnel" | "items" | "actions";
const LIVE: [LiveSub, string, string][] = [
  ["works", "🛠", "Тех. работы"], ["news", "📣", "Рассылка"], ["tosya", "🥟", "Тося"], ["bosses", "👹", "Боссы"], ["events", "🎉", "События"], ["exchange", "💱", "Обменник"],
];
const STATS: [StatsSub, string, string][] = [["funnel", "🧭", "Воронка новичков"], ["items", "📦", "Предметы у игроков"], ["actions", "⚡", "Действия за 24 ч"]];
const NAV: [View["tab"], string, string][] = [["dash", "📊", "Обзор"], ["live", "🎮", "Игра"], ["players", "👥", "Игроки"], ["stats", "📈", "Аналитика"], ["log", "📜", "Журнал"]];

function parseHash(): View {
  const h = typeof location === "undefined" ? "" : location.hash.slice(1);
  const [path, query = ""] = h.split("?");
  const [a, b] = path.split("/");
  if (a === "player" && /^\d+$/.test(b ?? "")) return { tab: "player", id: Number(b) };
  if (a === "actions" || (a === "log" && b !== "admins")) {
    const p = new URLSearchParams(query);
    return { tab: "log", sub: "actions", key: query, q: { type: p.get("type") ?? undefined, failed: p.get("failed") === "1", sinceHours: p.get("since") ? Number(p.get("since")) : undefined, playerId: p.get("player") ?? undefined } };
  }
  if (a === "log") return { tab: "log", sub: "admins", key: "admins", q: {} };
  if (a === "live" || a === "events") return { tab: "live", sub: (LIVE.find(([k]) => k === b)?.[0] ?? (a === "events" ? "events" : "works")) };
  if (a === "stats") return { tab: "stats", sub: STATS.find(([k]) => k === b)?.[0] ?? "funnel" };
  if (a === "players") return { tab: "players" };
  return { tab: "dash" };
}
/** link to the action log with filters */
const actionsHref = (q: { type?: string; failed?: boolean; since?: number; player?: number | string }) => {
  const p = new URLSearchParams();
  if (q.type) p.set("type", q.type);
  if (q.failed) p.set("failed", "1");
  if (q.since) p.set("since", String(q.since));
  if (q.player) p.set("player", String(q.player));
  const s = p.toString();
  return `#actions${s ? "?" + s : ""}`;
};

// ---------------- page ----------------
export default function AdminPage() {
  const [me, setMe] = useState<number | null | undefined>(undefined);
  const [view, setView] = useState<View>({ tab: "dash" });
  useEffect(() => {
    document.body.classList.add("adm-body");
    loadToken();
    setView(parseHash());
    const on = () => setView(parseHash());
    addEventListener("hashchange", on);
    // opened in Telegram to confirm a browser sign-in: the confirmation screen, even with a session in this app
    const confirming = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } }).Telegram?.WebApp?.initDataUnsafe?.start_param?.startsWith("al_");
    if (!token || confirming) setMe(null);
    else admin<{ tg: number }>("me").then((r) => setMe(r.tg), () => { saveToken(null); setMe(null); });
    return () => removeEventListener("hashchange", on);
  }, []);
  if (me === undefined) return <div className="adm-center muted">Загрузка…</div>;
  if (me === null) return <Login onIn={setMe} />;
  const out = () => { saveToken(null); setMe(null); };
  const active = view.tab === "player" ? "players" : view.tab;
  return (
    <div className="adm">
      <header className="adm-top">
        <b className="adm-logo"><span>X</span>CLOSE <small>админка</small></b>
        <nav>
          {NAV.map(([k, ic, t]) => (
            <a key={k} href={`#${k}`} className={active === k ? "on" : ""}><span className="adm-ic" aria-hidden="true">{ic}</span>{t}</a>
          ))}
        </nav>
        <span className="grow" />
        <span className="muted small" title="Ваш Telegram id">🔑 {me}</span>
        <button className="adm-btn ghost sm" onClick={out} title="Выйти">⎋ Выйти</button>
      </header>
      <main className="adm-main">
        {view.tab === "dash" && <Dashboard />}
        {view.tab === "live" && <Live sub={view.sub} />}
        {view.tab === "players" && <Players />}
        {view.tab === "player" && <Player key={view.id} id={view.id} />}
        {view.tab === "stats" && <Stats sub={view.sub} />}
        {view.tab === "log" && (
          <>
            <SubTabs items={[["actions", "🧾", "Действия игроков"], ["admins", "🛡", "Правки админов"]]} value={view.sub} href={(k) => (k === "actions" ? "#log" : "#log/admins")} />
            {view.sub === "actions" ? <Actions key={view.key} initial={view.q} /> : <AdminLog />}
          </>
        )}
      </main>
    </div>
  );
}

/** a row of icon tabs; with `href` each tab is a link (the hash), otherwise `onPick` */
function SubTabs<T extends string>({ items, value, href, onPick }: { items: [T, string, string][]; value: T; href?: (k: T) => string; onPick?: (k: T) => void }) {
  return (
    <div className="adm-sub" role="tablist">
      {items.map(([k, ic, t]) => {
        const inner = <><span className="adm-ic" aria-hidden="true">{ic}</span><span>{t}</span></>;
        return href
          ? <a key={k} role="tab" aria-selected={value === k} href={href(k)} className={value === k ? "on" : ""}>{inner}</a>
          : <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onPick?.(k)}>{inner}</button>;
      })}
    </div>
  );
}

type TgApp = { initData?: string; initDataUnsafe?: { start_param?: string }; ready?(): void; expand?(): void; close?(): void };
const tgApp = (): TgApp | null => (typeof window === "undefined" ? null : (window as unknown as { Telegram?: { WebApp?: TgApp } }).Telegram?.WebApp ?? null);
const LOGIN_KEY = "xcloce.admin.login";

/** tg:// opens the installed Telegram app; resolves false when the browser stayed in front (no app answered) */
function openTelegram(bot: string, startapp: string): Promise<boolean> {
  return new Promise((done) => {
    let left = false;
    const away = () => { left = true; };
    addEventListener("blur", away);
    document.addEventListener("visibilitychange", away);
    location.href = `tg://resolve?domain=${encodeURIComponent(bot)}&startapp=${encodeURIComponent(startapp)}`;
    setTimeout(() => {
      removeEventListener("blur", away);
      document.removeEventListener("visibilitychange", away);
      done(left);
    }, 1800);
  });
}

function Center({ children }: { children: ReactNode }) {
  return <div className="adm-center"><div className="adm-card adm-login"><b className="adm-logo big"><span>X</span>CLOSE</b>{children}</div></div>;
}

/**
 * Sign-in. In a browser:
 *   «Войти через приложение Telegram» — Telegram Desktop opens only to confirm, the panel stays in the browser;
 *   «Открыть админку в Telegram» — the panel itself opens inside the Telegram app;
 *   the Login Widget — sign-in in the browser alone (when there is no Telegram app).
 * Inside Telegram: startapp=al_<code> is the confirmation screen, otherwise initData signs in right away.
 */
function Login({ onIn }: { onIn: (tg: number) => void }) {
  const [app, setApp] = useState<TgApp | null | undefined>(undefined);
  useEffect(() => setApp(tgApp()?.initData ? tgApp() : null), []);
  if (app === undefined) return null;
  if (app) {
    try { app.ready?.(); app.expand?.(); } catch { /* old client */ }
    const sp = app.initDataUnsafe?.start_param ?? "";
    if (sp.startsWith("al_")) return <ApproveInApp app={app} code={sp.slice(3)} />;
    return <InAppLogin app={app} onIn={onIn} />;
  }
  return <BrowserLogin onIn={onIn} />;
}

function InAppLogin({ app, onIn }: { app: TgApp; onIn: (tg: number) => void }) {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    call<{ token: string; tg: number }>("/api/admin/login", { initData: app.initData }).then((r) => { saveToken(r.token); onIn(r.tg); }, (e) => setErr((e as Error).message));
  }, [app, onIn]);
  return <Center>{err ? <p className="adm-err">{err}</p> : <p className="muted">Входим через Telegram…</p>}</Center>;
}

/** In the Telegram app: confirm that the browser asking to sign in is yours */
function ApproveInApp({ app, code }: { app: TgApp; code: string }) {
  const [info, setInfo] = useState<{ ip: string | null; ua: string | null; createdAt: string; approved: boolean; short: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ask = useCallback((confirm: boolean) => {
    setErr(null);
    call<typeof info>("/api/admin/login", { op: "approve", code, initData: app.initData, confirm }).then((r) => {
      setInfo(r);
      if (confirm) setTimeout(() => { try { app.close?.(); } catch { /* ignore */ } }, 2500);
    }, (e) => setErr((e as Error).message));
  }, [app, code]);
  useEffect(() => ask(false), [ask]);
  if (err) return <Center><p className="adm-err">{err}</p></Center>;
  if (!info) return <Center><p className="muted">Загрузка…</p></Center>;
  if (info.approved) return <Center><p className="adm-ok">Вход подтверждён. Вернитесь в браузер — админка уже открывается там.</p></Center>;
  return (
    <Center>
      <p>Подтвердить вход в админку в браузере?</p>
      <div className="adm-code-big">{info.short}</div>
      <p className="muted small">Код должен совпадать с кодом на сайте. Запрос: {ago(info.createdAt)}{info.ip ? `, IP ${info.ip}` : ""}</p>
      {info.ua && <p className="muted tiny">{info.ua}</p>}
      <button className="adm-btn tg" onClick={() => ask(true)}>Подтвердить вход</button>
      <button className="adm-btn ghost" onClick={() => { try { app.close?.(); } catch { /* ignore */ } }}>Это не я — отмена</button>
    </Center>
  );
}

function BrowserLogin({ onIn }: { onIn: (tg: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState<{ bot: string | null; mainApp?: boolean } | null>(null);
  const [dev, setDev] = useState(false);
  const [devId, setDevId] = useState("");
  /** the pending browser sign-in confirmed in the app */
  const [wait, setWait] = useState<{ code: string; secret: string; until: number } | null>(null);
  const [noApp, setNoApp] = useState(false);
  const [opening, setOpening] = useState(false);
  const signedIn = useCallback((r: { token: string; tg: number }) => {
    saveToken(r.token);
    try { sessionStorage.removeItem(LOGIN_KEY); } catch { /* ignore */ }
    onIn(r.tg);
  }, [onIn]);
  const done = useCallback(async (body: Row) => {
    setErr(null);
    try {
      signedIn(await call<{ token: string; tg: number }>("/api/admin/login", body));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [signedIn]);
  useEffect(() => {
    call<{ bot: string | null; mainApp?: boolean }>("/api/config").then(setCfg, () => setCfg({ bot: null }));
    call<{ dev: boolean }>("/api/admin/login").then((c) => setDev(c.dev), () => {});
    // a sign-in started before a reload keeps waiting
    try {
      const w = JSON.parse(sessionStorage.getItem(LOGIN_KEY) ?? "null");
      if (w && w.until > Date.now()) setWait(w);
    } catch { /* ignore */ }
  }, []);
  const bot = cfg?.bot ?? null;
  useEffect(() => {
    if (!bot || !box.current) return;
    (window as unknown as { onAdminAuth: (u: Row) => void }).onAdminAuth = (u) => done({ widget: u });
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "10");
    s.setAttribute("data-onauth", "onAdminAuth(user)");
    box.current.replaceChildren(s);
  }, [bot, done]);
  // waiting for the confirmation in Telegram
  useEffect(() => {
    if (!wait) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (Date.now() > wait.until) { setWait(null); setErr("Время на подтверждение вышло. Начните вход заново"); return; }
      try {
        const r = await call<{ status: string; token?: string; tg?: number }>("/api/admin/login", { op: "poll", code: wait.code, secret: wait.secret });
        if (r.status === "ok" && r.token && r.tg) { signedIn({ token: r.token, tg: r.tg }); return; }
      } catch (e) {
        if ((e as ApiError).status !== 429 && (e as ApiError).status !== 503) { setWait(null); setErr((e as Error).message); return; }
      }
      if (alive) setTimeout(tick, 2000);
    };
    const t = setTimeout(tick, 1500);
    return () => { alive = false; clearTimeout(t); };
  }, [wait, signedIn]);
  const viaApp = async () => {
    if (!bot) return;
    setErr(null);
    setOpening(true);
    try {
      const r = await call<{ code: string; secret: string; ttlMin: number }>("/api/admin/login", { op: "start" });
      const w = { code: r.code, secret: r.secret, until: Date.now() + r.ttlMin * 60_000 };
      setWait(w);
      try { sessionStorage.setItem(LOGIN_KEY, JSON.stringify(w)); } catch { /* ignore */ }
      setNoApp(!(await openTelegram(bot, `al_${r.code}`)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setOpening(false);
    }
  };
  const inApp = async () => {
    if (!bot) return;
    setOpening(true);
    setNoApp(!(await openTelegram(bot, "admin")));
    setOpening(false);
  };
  const cancel = () => { setWait(null); setNoApp(false); try { sessionStorage.removeItem(LOGIN_KEY); } catch { /* ignore */ } };
  return (
    <Center>
      <p className="muted">Админ-панель. Доступ только у Telegram ID из списка админов.</p>
      {bot && wait ? (
        <div className="adm-wait">
          <p>Подтвердите вход в приложении Telegram</p>
          <div className="adm-code-big">{wait.code.slice(0, 4).toUpperCase()}</div>
          <p className="muted small">Проверьте, что в Telegram тот же код, и нажмите «Подтвердить вход». Эта страница войдёт сама.</p>
          <div className="adm-spin" aria-hidden />
          <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <a className="adm-btn ghost" href={`https://t.me/${bot}?startapp=al_${wait.code}`} target="_blank" rel="noreferrer">Открыть Telegram ещё раз</a>
            <button className="adm-btn ghost" onClick={cancel}>Отмена</button>
          </div>
        </div>
      ) : bot ? (
        <div className="adm-choice">
          <button className="adm-btn tg" onClick={viaApp} disabled={opening}>Войти через приложение Telegram</button>
          <span className="muted tiny">Telegram откроется только для подтверждения — админка останется здесь, в браузере.</span>
          <button className="adm-btn ghost" onClick={inApp} disabled={opening}>Открыть админку в приложении Telegram</button>
        </div>
      ) : null}
      {noApp && <p className="adm-warn small">Приложение Telegram не открылось — похоже, его нет на этом компьютере. Войдите через браузер ниже.</p>}
      {cfg?.mainApp === false && bot && <p className="muted tiny">У бота не включено мини-приложение (BotFather → Bot Settings → Configure Mini App), поэтому Telegram откроет только чат бота.</p>}
      {bot && <div className="adm-or"><span>без приложения — в браузере</span></div>}
      <div ref={box} className="adm-widget" />
      {cfg && !bot && <p className="muted small">Вход через Telegram не настроен (нет бота или домена).</p>}
      {dev && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); done({ dev: Number(devId) }); }}>
          <input className="adm-in grow" placeholder="Telegram ID (тестовый вход)" value={devId} onChange={(e) => setDevId(e.target.value)} />
          <button className="adm-btn">Войти</button>
        </form>
      )}
      {err && <p className="adm-err">{err}</p>}
    </Center>
  );
}

// ---------------- shared bits ----------------
function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setErr(null);
    fn().then((d) => alive && setData(d), (e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [...deps, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, err, reload: () => setN((x) => x + 1), setData };
}
/**
 * A card. Every card folds: tap its header. Whether it is open is remembered per card title (in this browser);
 * `closed` — folded until opened the first time (the player's card, so it does not take the whole screen).
 */
function Box({ title, children, right, closed }: { title: ReactNode; children: ReactNode; right?: ReactNode; closed?: boolean }) {
  const key = typeof title === "string" ? `xcloce.admin.fold.${title.split(" · ")[0].replace(/\s+#?\d+$/, "")}` : null;
  const [open, setOpen] = useState(!closed);
  useEffect(() => {
    if (!key) return;
    try {
      const v = localStorage.getItem(key);
      if (v !== null) setOpen(v === "1");
    } catch { /* no storage */ }
  }, [key]);
  const toggle = () => {
    setOpen((o) => {
      if (key) try { localStorage.setItem(key, o ? "0" : "1"); } catch { /* no storage */ }
      return !o;
    });
  };
  return (
    <section className={`adm-card${open ? "" : " folded"}`}>
      <div className="adm-card-h" role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
        <span className="adm-fold" aria-hidden="true">{open ? "▾" : "▸"}</span>
        <h3>{title}</h3><span className="grow" />
        {open && right && <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{right}</span>}
      </div>
      {open && children}
    </section>
  );
}
function Table({ cols, rows, empty = "Пусто" }: { cols: [string, (r: Row) => ReactNode, string?][]; rows: Row[]; empty?: string }) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <div className="adm-scroll">
      <table className="adm-table">
        <thead><tr>{cols.map(([h, , c]) => <th key={h} className={c}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.id ?? i)}>{cols.map(([h, f, c]) => <td key={h} className={c}>{f(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
/** Telegram avatar; the first letter of the name when there is no photo or it does not load */
function Avatar({ r, size = 28 }: { r: Row; size?: number }) {
  const [bad, setBad] = useState(false);
  const url = typeof r.photo_url === "string" && r.photo_url ? r.photo_url : null;
  const letter = String(r.display_name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return url && !bad
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="adm-ava" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} referrerPolicy="no-referrer" onError={() => setBad(true)} />
    : <span className="adm-ava letter" style={{ width: size, height: size, fontSize: size * 0.45 }}>{letter}</span>;
}
/** the Telegram id, opening the player's Telegram profile; guests have none */
function TgId({ r }: { r: Row }) {
  if (!r.telegram_id) return <span className="tag" style={{ marginLeft: 0 }} title={`игровой ID ${r.id}`}>гость</span>;
  const href = r.username ? `https://t.me/${r.username}` : `tg://user?id=${r.telegram_id}`;
  return <a href={href} target="_blank" rel="noreferrer" title={r.username ? `@${r.username} в Telegram` : "профиль в Telegram"}>{String(r.telegram_id)}</a>;
}
const PlayerLink = ({ r, id = r.player_id ?? r.id }: { r: Row; id?: unknown }) => (
  <a href={`#player/${id}`} className="adm-who" title={r.username ? `@${r.username}` : undefined}><Avatar r={r} size={22} /><span className="ellipsis">{String(r.display_name ?? "?")}</span></a>
);
const ActionName = ({ t }: { t: unknown }) => <span title={String(t)}>{ACTION_NAMES[String(t)] ?? String(t)}</span>;
const Err = ({ e }: { e: string | null }) => (e ? <p className="adm-err">{e}</p> : null);

// ---------------- overview ----------------
type GameState = { works?: { on: boolean }; tosya?: { mode: string; here: boolean; endsAt: number | null; nextAt?: number | null }; events?: Row[]; exchange?: { window: { open: boolean; until: number } }; evb?: { bosses: { id: string; name: string; on: boolean }[] } };
/** the state of the game at a glance: each tile opens its control */
function GameStatus() {
  const { data } = useLoad(async (): Promise<GameState> => {
    const [works, tosya, events, exchange, evb] = await Promise.all([
      admin<{ on: boolean }>("maintenance").catch(() => undefined), admin<GameState["tosya"]>("tosya").catch(() => undefined), admin<Row[]>("events").catch(() => undefined),
      admin<GameState["exchange"]>("exchange_schedule").catch(() => undefined), admin<GameState["evb"]>("event_bosses").catch(() => undefined),
    ]);
    return { works, tosya, events, exchange, evb };
  }, []);
  useTick();
  const now = Date.now();
  const live = (data?.events ?? []).filter((r) => r.enabled !== false && new Date(String(r.starts_at)).getTime() <= now && new Date(String(r.ends_at)).getTime() > now && !cleanEffects(r.effects).silent);
  const evbOn = (data?.evb?.bosses ?? []).filter((b) => b.on);
  const tiles: [string, string, string, ReactNode, boolean][] = [
    ["works", "🛠", "Тех. работы", data?.works ? (data.works.on ? "игра закрыта" : "выключены") : "…", !!data?.works?.on],
    ["tosya", "🥟", "Тося", data?.tosya ? (data.tosya.here ? `в игре ещё ${inTime(data.tosya.endsAt)}` : data.tosya.mode === "off" ? "выключен" : data.tosya.nextAt ? `приедет через ${inTime(data.tosya.nextAt)}` : "не приехал") : "…", !!data?.tosya?.here],
    ["events", "🎉", "События", data?.events ? (live.length ? `идёт: ${live.map((r) => r.title).join(", ")}` : "нет активных") : "…", live.length > 0],
    ["bosses", "👹", "Ивент-боссы", data?.evb ? (evbOn.length ? evbOn.map((b) => b.name).join(", ") : "выключены") : "…", evbOn.length > 0],
    ["exchange", "💱", "Обменник", data?.exchange ? (data.exchange.window.open ? `открыт ещё ${inTime(data.exchange.window.until)}` : `откроется через ${inTime(data.exchange.window.until)}`) : "…", !!data?.exchange?.window.open],
  ];
  return (
    <div className="adm-status">
      {tiles.map(([k, ic, t, v, on]) => (
        <a key={k} href={`#live/${k}`} className={`adm-st ${on ? (k === "works" ? "warn" : "on") : ""}`}>
          <span className="adm-st-ic" aria-hidden="true">{ic}</span>
          <span className="col" style={{ minWidth: 0 }}><b>{t}</b><span className="small ellipsis">{v}</span></span>
        </a>
      ))}
    </div>
  );
}

function Dashboard() {
  const { data, err, reload } = useLoad(() => admin<{ counts: Row; byType: Row[]; top: Row[]; suspicious: Row[]; items: Row[] }>("dashboard"), []);
  const feed = useLoad(() => admin<Row[]>("actions", { limit: 30 }), []);
  useEffect(() => {
    const t = setInterval(() => { reload(); feed.reload(); }, 30_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const c = data?.counts ?? {};
  const stats: [string, string, unknown, string?, string?][] = [
    ["👥", "Игроков", c.players, `Telegram: ${fmt(c.telegram)}`, "#players"], ["🟢", "Онлайн (15 мин)", c.online], ["📅", "Активны за 24 ч", c.active24], ["🗓", "Активны за 7 дн", c.active7],
    ["🆕", "Новых за 24 ч", c.new24, undefined, "#stats/funnel"], ["⚔️", "Идёт боёв", c.fights], ["💥", "Ударов за 24 ч", c.hits24, `урон ${fmt(c.damage24)}`],
    ["⚡", "Действий за 24 ч", c.actions24, `отказов ${fmt(c.failed24)}`, actionsHref({ failed: true, since: 24 })], ["🚫", "В бане", c.banned, undefined, "#players"],
  ];
  return (
    <>
      <Err e={err} />
      <GameStatus />
      <div className="adm-stats">
        {stats.map(([ic, t, v, s, href]) => {
          const inner = <><span className="adm-stat-h"><span aria-hidden="true">{ic}</span>{t}</span><b>{data ? fmt(v) : "…"}</b>{s && <span className="muted tiny">{s}</span>}</>;
          return href ? <a key={t} className="adm-stat link" href={href}>{inner}</a> : <div key={t} className="adm-stat">{inner}</div>;
        })}
      </div>
      {!!data?.suspicious.length && (
        <Box title="⚠️ Подозрительно много отказов за 24 ч">
          <p className="muted small">Сервер отклонил 20+ действий: спам кнопок, скрипт или попытка обмануть сервер.</p>
          <Table rows={data.suspicious} cols={[["Игрок", (r) => <PlayerLink r={r} />], ["Действий", (r) => <a href={actionsHref({ player: String(r.id), since: 24 })}>{fmt(r.total)}</a>, "r"], ["Отказов", (r) => <a className="bad" href={actionsHref({ player: String(r.id), failed: true, since: 24 })}>{fmt(r.failed)}</a>, "r"]]} />
        </Box>
      )}
      <div className="adm-grid2">
        <Box title="🧾 Последние действия" right={<a href="#log" className="small">все →</a>}>
          <ActionRows rows={feed.data ?? []} withPlayer />
        </Box>
        <Box title="🏆 Топ по урону">
          <Table rows={data?.top ?? []} cols={[["#", (r) => (data!.top.indexOf(r) + 1)], ["Игрок", (r) => <PlayerLink r={r} />], ["Урон", (r) => fmt(r.total_damage), "r"]]} />
        </Box>
      </div>
    </>
  );
}

// ---------------- the game: live controls ----------------
function Live({ sub }: { sub: LiveSub }) {
  return (
    <>
      <SubTabs items={LIVE} value={sub} href={(k) => `#live/${k}`} />
      {sub === "works" && <Maintenance />}
      {sub === "news" && <Broadcast />}
      {sub === "tosya" && <TosyaAdmin />}
      {sub === "bosses" && <BossesLive />}
      {sub === "events" && <Events />}
      {sub === "exchange" && <ExchangeEvent />}
    </>
  );
}

/** «Боссы»: the chain bosses (in / out, HP, rewards), the event bosses, and the daily limit for everybody */
function BossesLive() {
  const { data, setData } = useLoad(() => admin<Row[]>("events"), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const resetAll = async () => {
    if (!confirm("Сбросить сегодняшний лимит боёв с боссами у ВСЕХ игроков?")) return;
    setBusy(true);
    try { const r = await admin<{ fights: number; players: number }>("boss_limit_reset_all"); setMsg(`Лимит сброшен у ${fmt(r.players)} игроков (боёв: ${fmt(r.fights)})`); } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  return (
    <>
      <div className="adm-actions">
        <button className="adm-btn danger" disabled={busy} onClick={resetAll}>🔄 Сбросить лимит боёв всем</button>
        {msg && <span className="small">{msg}</span>}
      </div>
      <BossControls rows={data ?? []} onSaved={setData} />
      <EventBosses />
    </>
  );
}

// ---------------- analytics ----------------
function Stats({ sub }: { sub: StatsSub }) {
  return (
    <>
      <SubTabs items={STATS} value={sub} href={(k) => `#stats/${k}`} />
      {sub === "funnel" && <Funnel />}
      {sub !== "funnel" && <DashTables sub={sub} />}
    </>
  );
}
function DashTables({ sub }: { sub: "items" | "actions" }) {
  const { data, err } = useLoad(() => admin<{ byType: Row[]; items: Row[] }>("dashboard"), []);
  return (
    <>
      <Err e={err} />
      {sub === "items" ? (
        <Box title="📦 Предметы у игроков">
          <p className="muted tiny">Сколько каждой вещи сейчас у всех игроков вместе (без забаненных) и у скольких она есть.</p>
          <Table rows={data?.items ?? []} empty={data ? "Пусто" : "Загрузка…"} cols={[
            ["Предмет", (r) => <span className="row" style={{ gap: 8 }}><ItemArt id={String(r.item_id)} size={28} />{itemById(String(r.item_id))?.name ?? String(r.item_id)}</span>],
            ["Всего", (r) => fmt(r.total), "r"], ["У игроков", (r) => fmt(r.holders), "r"],
          ]} />
        </Box>
      ) : (
        <Box title="⚡ Действия за 24 ч">
          <p className="muted tiny">Нажмите на действие или на число отказов — откроется журнал.</p>
          <Table rows={data?.byType ?? []} empty={data ? "Пусто" : "Загрузка…"} cols={[
            ["Действие", (r) => <a href={actionsHref({ type: String(r.type), since: 24 })}><ActionName t={r.type} /></a>],
            ["Всего", (r) => <a href={actionsHref({ type: String(r.type), since: 24 })}>{fmt(r.total)}</a>, "r"],
            ["Отказов", (r) => (num(r.failed) ? <a className="bad" href={actionsHref({ type: String(r.type), failed: true, since: 24 })}>{fmt(r.failed)}</a> : "0"), "r"],
          ]} />
        </Box>
      )}
    </>
  );
}

// ---------------- player card ----------------
type PlayerData = {
  player: Row; money: Record<string, number>; inventory: Row[]; stats: Row | null; talents: Row[]; clan: Row | null;
  fights: Row[]; actions: Row[]; ledger: Row[]; admin: Row[];
};
type PTab = "res" | "items" | "talents" | "stats" | "history" | "mod";
const PTABS: [PTab, string, string][] = [["res", "💰", "Ресурсы"], ["items", "🎒", "Вещи и наколки"], ["talents", "⭐", "Таланты"], ["stats", "📊", "Статистика"], ["history", "📜", "История"], ["mod", "🚫", "Модерация"]];

function Player({ id }: { id: number }) {
  const { data, err, reload } = useLoad(() => admin<PlayerData>("player", { id }), [id]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<PTab>(() => { try { return (localStorage.getItem("xcloce.admin.ptab") as PTab) || "res"; } catch { return "res"; } });
  const pick = (t: PTab) => { setTab(t); try { localStorage.setItem("xcloce.admin.ptab", t); } catch { /* no storage */ } };
  const edit = useCallback(async (e: Row, label: string) => {
    setMsg(null);
    try {
      const r = await admin<Row>("edit", { id, edit: e });
      setMsg({ ok: true, text: `${label}: ${"from" in r && "to" in r ? `${r.from} → ${r.to}` : "готово"}` });
      reload();
      return true;
    } catch (x) {
      setMsg({ ok: false, text: (x as Error).message });
      return false;
    }
  }, [id, reload]);
  if (err) return <><a href="#players">← игроки</a><Err e={err} /></>;
  if (!data) return <div className="muted">Загрузка…</div>;
  const p = data.player;
  const quick: [ReactNode, string, unknown][] = [
    [<Icon key="x" name="xp" size={20} />, "Авторитет", p.xp], [<Icon key="r" name="RUB" size={20} />, "Рубли", data.money.RUB], [<Icon key="u" name="USD" size={20} />, "Доллары", data.money.USD],
    [<Icon key="e" name="energy" size={20} />, "Энергия", p.energyNow], [<Icon key="t" name="talent" size={20} />, "Своб. таланты", p.talents],
  ];
  return (
    <>
      <div className="adm-ph">
        <a href="#players" className="small">← игроки</a>
        <div className="adm-ph-top">
          <Avatar r={p} size={56} />
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            <h2 className="adm-who-h">{String(p.display_name)} <span className="tag">ур. {String(p.level)}</span>{p.banned_at ? <span className="tag bad">🚫 бан{p.ban_reason ? `: ${p.ban_reason}` : ""}</span> : null}</h2>
            <div className="muted small adm-meta">
              <span title="Игровой ID">🆔 {String(p.id)}</span>
              {p.telegram_id ? <span title="Telegram">✈️ <TgId r={p} /></span> : <span className="tag">гость</span>}
              {p.username ? <a href={`https://t.me/${p.username}`} target="_blank" rel="noreferrer">@{String(p.username)}</a> : null}
              <span title="Создан">🐣 {when(p.created_at)}</span>
              <span title="Последний вход">👁 {ago(p.last_seen_at)}</span>
              <span title="Дней в игре">📅 {String(p.active_days)} дн.</span>
              {data.clan && <span title="Клан">🛡 [{String(data.clan.tag)}] {String(data.clan.name)}{data.clan.role === "leader" ? " · лидер" : ""}</span>}
            </div>
          </div>
        </div>
        <div className="adm-quick">
          {quick.map(([ic, t, v]) => <div key={t} className="adm-q" title={t}>{ic}<b>{fmt(v)}</b><span className="muted tiny">{t}</span></div>)}
        </div>
      </div>
      {msg && <p className={msg.ok ? "adm-ok" : "adm-err"}>{msg.text}</p>}
      <SubTabs items={PTABS} value={tab} onPick={pick} />
      {tab === "res" && (
        <section className="adm-card">
          <div className="adm-fields">
            {CURRENCIES.map((c) => <EditNum key={c} icon={<Icon name={c} size={22} />} label={c} value={data.money[c]} step="any" onSave={(v) => edit({ op: "set_money", currency: c, amount: v }, c)} />)}
            <EditNum icon={<Icon name="xp" size={22} />} label="Авторитет" value={num(p.xp)} onSave={(v) => edit({ op: "set_xp", value: v }, "Авторитет")} />
            <EditNum icon={<Icon name="energy" size={22} />} label="Энергия" value={num(p.energyNow)} onSave={(v) => edit({ op: "set_energy", value: v }, "Энергия")} />
            <EditNum icon={<Icon name="talent" size={22} />} label="Свободные таланты" value={num(p.talents)} onSave={(v) => edit({ op: "set_talents", value: v }, "Таланты")} />
            <EditNum icon="🃏" label="Опыт покера" hint="20 ур. = 390 · 50 = 1725 · 100 = 5950" value={num(p.poker_xp)} onSave={(v) => edit({ op: "set_poker_xp", value: v }, "Опыт покера")} />
            <EditNum icon="🎲" label="Опыт зонка" hint="100 опыта = уровень" value={num(p.zonk_xp)} onSave={(v) => edit({ op: "set_zonk_xp", value: v }, "Опыт зонка")} />
            <EditText icon="✏️" label="Имя" value={String(p.display_name)} onSave={(v) => edit({ op: "set_name", value: v }, "Имя")} />
          </div>
        </section>
      )}
      {tab === "items" && <Catalog rows={data.inventory} edit={edit} />}
      {tab === "talents" && <Talents rows={data.talents} edit={edit} />}
      {tab === "stats" && (
        <section className="adm-card">
          {data.stats ? (
            <dl className="adm-dl">
              {([["💥", "Урон всего", "total_damage"], ["🏆", "Побед", "fights_won"], ["💀", "Поражений", "fights_lost"], ["📋", "Заданий", "tasks_done"], ["👣", "Шагов заданий", "task_steps"], ["🗺", "Локаций", "locations_done"], ["🔎", "Находок во дворе", "yard_found"], ["🎁", "Наград", "rewards_got"]] as const).map(([ic, t, k]) => (
                <div key={k}><dt>{ic} {t}</dt><dd>{fmt(data.stats![k])}</dd></div>
              ))}
            </dl>
          ) : <p className="muted small">Нет статистики</p>}
          {!!data.stats?.weapons && Object.keys(data.stats.weapons as Row).length > 0 && (
            <div className="adm-wstats">
              {Object.entries(data.stats.weapons as Row).map(([w, v]) => (
                <span key={w} className="adm-wstat" title={itemById(w)?.name ?? w}><ItemArt id={w} size={28} /><b>{fmt(typeof v === "object" ? (v as Row).hits ?? 0 : v)}</b></span>
              ))}
            </div>
          )}
        </section>
      )}
      {tab === "history" && <History data={data} />}
      {tab === "mod" && (
        <section className="adm-card">
          <div className="adm-actions">
            <button className="adm-btn" onClick={() => { if (confirm("Сбросить сегодняшний лимит боёв со всеми боссами?")) void edit({ op: "boss_limit_reset" }, "Сброс лимита на боссов"); }}>🔄 Сбросить лимит боёв на сегодня</button>
          </div>
          <BanBox banned={!!p.banned_at} onBan={(reason) => edit({ op: "ban", reason }, "Бан")} onUnban={() => edit({ op: "unban" }, "Разбан")} />
          <ResetBox name={String(p.display_name)} onReset={() => edit({ op: "reset" }, "Сброс прогресса")} />
        </section>
      )}
    </>
  );
}

function History({ data }: { data: PlayerData }) {
  const [tab, setTab] = useState<"actions" | "fights" | "ledger" | "admin">("actions");
  return (
    <section className="adm-card">
      <select className="adm-in" value={tab} onChange={(e) => setTab(e.target.value as typeof tab)} style={{ marginBottom: 10 }}>
        <option value="actions">🧾 Действия ({data.actions.length})</option>
        <option value="fights">⚔️ Бои ({data.fights.length})</option>
        <option value="ledger">💸 Движения валют и вещей ({data.ledger.length})</option>
        <option value="admin">🛡 Правки админов ({data.admin.length})</option>
      </select>
      {tab === "actions" && <ActionRows rows={data.actions} />}
      {tab === "fights" && (
        <Table rows={data.fights} empty="Боёв нет" cols={[
          ["Босс", (r) => <span className="row" style={{ gap: 6 }}><BossFace id={String(r.boss_id)} />{bossById(String(r.boss_id))?.name ?? String(r.boss_id)}</span>], ["Статус", (r) => `${FIGHT_STATUS[String(r.status)] ?? r.status}${r.solo ? " · соло" : ""}`],
          ["Урон", (r) => fmt(r.my_damage), "r"], ["Ударов", (r) => fmt(r.my_hits), "r"], ["Начат", (r) => when(r.started_at), "nowrap"],
          ["Награда", (r) => <code className="adm-code">{infoText(r.reward)}</code>],
        ]} />
      )}
      {tab === "ledger" && (
        <Table rows={data.ledger} empty="Пусто" cols={[
          ["Когда", (r) => when(r.created_at), "nowrap"],
          ["Что", (r) => (r.kind === "item" || r.kind === "use" ? <span className="row" style={{ gap: 6 }}><ItemArt id={String(r.key)} size={22} />{itemById(String(r.key))?.name ?? String(r.key)}</span> : String(r.key))],
          ["Изм.", (r) => <span className={num(r.delta) < 0 ? "bad" : "good"}>{num(r.delta) > 0 ? "+" : ""}{fmt(r.delta)}</span>, "r"], ["Причина", (r) => <code className="adm-code">{String(r.reason)}</code>],
        ]} />
      )}
      {tab === "admin" && (
        <Table rows={data.admin} empty="Админ не правил этого игрока" cols={[
          ["Когда", (r) => when(r.at), "nowrap"], ["Админ", (r) => <AdminWho r={r} />], ["Что", (r) => OP_NAMES[String(r.op)] ?? String(r.op), "nowrap"], ["Изменение", (r) => <EditInfo op={String(r.op)} info={r.info} />],
        ]} />
      )}
    </section>
  );
}
const FIGHT_STATUS: Record<string, string> = { active: "идёт", won: "победа", lost: "проигрыш" };
const BossFace = ({ id }: { id: string }) => {
  const b = bossById(id);
  // eslint-disable-next-line @next/next/no-img-element
  return b?.photo.portrait ? <img src={b.photo.portrait} alt="" className="adm-boss-mini" /> : null;
};

type EditFn = (e: Row, label: string) => Promise<boolean>;

function EditNum({ icon, label, hint, value, onSave, step = "1" }: { icon?: ReactNode; label: string; hint?: string; value: number; onSave: (v: number) => Promise<boolean>; step?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const changed = v !== String(value) && v.trim() !== "" && Number.isFinite(Number(v));
  return (
    <form className="adm-fld" onSubmit={(e) => { e.preventDefault(); if (changed) onSave(Number(v)); }}>
      <span className="adm-fld-h">{icon && <span className="adm-fld-ic">{icon}</span>}<span className="col"><b>{label}</b>{hint && <span className="muted tiny">{hint}</span>}</span></span>
      <span className="row"><input className="adm-in grow" type="number" step={step} min={0} value={v} onChange={(e) => setV(e.target.value)} /><button className="adm-btn" disabled={!changed} title="Сохранить">✓</button></span>
    </form>
  );
}
function EditText({ icon, label, value, onSave }: { icon?: ReactNode; label: string; value: string; onSave: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const changed = v.trim() !== value && v.trim() !== "";
  return (
    <form className="adm-fld" onSubmit={(e) => { e.preventDefault(); if (changed) onSave(v.trim()); }}>
      <span className="adm-fld-h">{icon && <span className="adm-fld-ic">{icon}</span>}<b>{label}</b></span>
      <span className="row"><input className="adm-in grow" maxLength={32} value={v} onChange={(e) => setV(e.target.value)} /><button className="adm-btn" disabled={!changed} title="Сохранить">✓</button></span>
    </form>
  );
}

/*
 * «Вещи и наколки»: everything in the game in one catalog — a drop-down for the kind (what the player has, clothes,
 * weapons, tattoo sets, passes, rewards, stashes, craft, things, event things), a drop-down for the clothes slot, a
 * search; each thing is a tile: its picture, name, how many the player has and the buttons. Tattoos come as sets:
 * a tile per set (its picture and name); a tap opens its pieces and «Выдать весь сет».
 */
type Cat = "owned" | "clothing" | "weapon" | "tattoo" | "pass" | "reward" | "stash" | "craft" | "item" | "event";
const CATS: [Cat, string, string][] = [
  ["owned", "🎒", "Есть у игрока"], ["clothing", "👕", "Одежда"], ["weapon", "⚔️", "Оружие"], ["tattoo", "🖋", "Наколки"], ["pass", "🎟", "Пропуски"],
  ["reward", "🎁", "Награды"], ["stash", "🚬", "Нычки"], ["craft", "🔩", "Крафт"], ["item", "📦", "Предметы"], ["event", "🎉", "Ивенты"],
];
const SLOT_ORDER: { slot: Slot; name: string }[] = [
  { slot: "HEAD", name: "Голова" }, { slot: "FACE", name: "Лицо" }, { slot: "MOUTH", name: "Рот" }, { slot: "TEETH" as Slot, name: "Зубы" }, { slot: "ACCESSORY", name: "Шея" },
  { slot: "SHIRT", name: "Верх" }, { slot: "PANTS", name: "Низ" }, { slot: "SHOES", name: "Обувь" }, { slot: "HAND", name: "Кисть" }, { slot: "SPECIAL", name: "Особое" }, { slot: "BODY", name: "Тело" },
];
const RARITY_RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
const PASS_IDS = new Set(BOSSES.filter((b) => !b.final).map((b) => keyId(b.id)));
const catOf = (i: ItemDef): Cat => (PASS_IDS.has(i.id) ? "pass" : (i.category as Cat));
const setPic = (sid: string) => `tat-${sid}-chest-l`;
const setFrom = (boss: string) => (boss === "tosya" ? "Тося" : boss === "box" ? "Ящик ништяков" : bossById(boss)?.name ?? boss);

function Catalog({ rows, edit }: { rows: Row[]; edit: EditFn }) {
  const [cat, setCat] = useState<Cat>("owned");
  const [slot, setSlot] = useState<Slot | "all">("all");
  const [q, setQ] = useState("");
  const [set, setSet] = useState<string | null>(null);
  const have = (id: string) => num(rows.find((r) => r.item_id === id)?.qty);
  const all = useMemo(() => ITEMS.filter((i) => i.maxStack > 0), []);
  const needle = q.trim().toLowerCase();
  const count = (c: Cat) => (c === "owned" ? rows.filter((r) => num(r.qty) > 0 && itemById(String(r.item_id))?.category !== "tattoo").length : c === "tattoo" ? TATTOO_SETS.length : all.filter((i) => catOf(i) === c).length);
  const showSets = !needle && cat === "tattoo";
  const list = showSets ? [] : all
    .filter((i) => catOf(i) !== "tattoo" || !!needle)
    .filter((i) => (needle ? i.name.toLowerCase().includes(needle) || i.id.includes(needle) : cat === "owned" ? have(i.id) > 0 : catOf(i) === cat))
    .filter((i) => needle || cat !== "clothing" || slot === "all" || i.slot === slot)
    .sort((a, b) => (a.slot ? SLOT_ORDER.findIndex((s) => s.slot === a.slot) : 99) - (b.slot ? SLOT_ORDER.findIndex((s) => s.slot === b.slot) : 99) || RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name, "ru"));
  const slots = SLOT_ORDER.filter((s) => all.some((i) => i.category === "clothing" && i.slot === s.slot));
  const open = set ? TATTOO_SETS.find((s) => s.id === set) : null;
  return (
    <section className="adm-card">
      <div className="adm-filters">
        <select className="adm-in" value={cat} onChange={(e) => { setCat(e.target.value as Cat); setSet(null); setQ(""); }}>
          {CATS.map(([k, ic, t]) => <option key={k} value={k}>{ic} {t} · {count(k)}</option>)}
        </select>
        {cat === "clothing" && !needle && (
          <select className="adm-in" value={slot} onChange={(e) => setSlot(e.target.value as Slot | "all")}>
            <option value="all">Все места</option>
            {slots.map((s) => <option key={s.slot} value={s.slot}>{s.name}</option>)}
          </select>
        )}
        <input className="adm-in grow" placeholder="🔎 Поиск по всем вещам" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {showSets ? (
        <>
          <div className="adm-tiles sets">
            {TATTOO_SETS.map((s) => {
              const got = s.pieces.filter((x) => have(x.id) > 0).length;
              return (
                <button key={s.id} type="button" className={`adm-tile set ${set === s.id ? "on" : ""} ${got === s.pieces.length ? "full" : ""}`} onClick={() => setSet(set === s.id ? null : s.id)} title={`${s.name} · ${setFrom(s.boss)}`}>
                  <ItemArt id={setPic(s.id)} size={52} />
                  <span className="adm-tile-n">{s.name}</span>
                  <span className="adm-tile-q">{got}/{s.pieces.length}</span>
                </button>
              );
            })}
          </div>
          {open && (
            <div className="adm-setbox">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <b>🖋 {open.name} <span className="muted small">· {setFrom(open.boss)} · +{open.bonus.damage} к «{itemById(open.bonus.weapon)?.name ?? open.bonus.weapon}»</span></b>
                <button className="adm-btn" onClick={() => { if (confirm(`Выдать весь сет «${open.name}»?`)) void edit({ op: "give_tattoo_set", set: open.id }, `Сет наколок «${open.name}»`); }}>Выдать весь сет</button>
              </div>
              <div className="adm-tiles">
                {open.pieces.map((x) => <ItemTile key={x.id} i={itemById(x.id)!} have={have(x.id)} edit={edit} short={x.name.split(": ").pop()} />)}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="adm-tiles">
          {list.length ? list.map((i) => <ItemTile key={i.id} i={i} have={have(i.id)} edit={edit} />) : <p className="muted small">{cat === "owned" && !needle ? "У игрока пока ничего нет" : "Ничего не найдено"}</p>}
        </div>
      )}
      <p className="muted tiny" style={{ marginTop: 10 }}>Выданная одежда и наколки сразу появляются у игрока в редакторе персонажа. «−» и отрицательное число забирают.</p>
    </section>
  );
}

function ItemTile({ i, have, edit, short }: { i: ItemDef; have: number; edit: EditFn; short?: string }) {
  const [n, setN] = useState("");
  const add = (d: number) => { if (d) void edit({ op: "add_item", item: i.id, delta: d }, `${i.name} ${d > 0 ? "+" : ""}${d}`).then((ok) => ok && setN("")); };
  const boss = unlockBossOf(i.id);
  const from = boss ? `босс ${boss.name}` : i.sources.slice(0, 2).join(", ");
  return (
    <div className={`adm-tile rar-${i.rarity} ${have > 0 ? "have" : ""}`} title={`${i.name}${from ? ` — ${from}` : ""}`}>
      <ItemArt id={i.id} size={44} />
      <span className="adm-tile-n">{short ?? i.name}</span>
      {have > 0 && <span className="adm-tile-q">{i.maxStack === 1 ? "✓" : `×${fmt(have)}`}</span>}
      {i.maxStack === 1 ? (
        have > 0
          ? <button className="adm-btn sm ghost danger-text" onClick={() => edit({ op: "set_item", item: i.id, qty: 0 }, i.name)}>Забрать</button>
          : <button className="adm-btn sm" onClick={() => edit({ op: "set_item", item: i.id, qty: 1 }, i.name)}>Выдать</button>
      ) : (
        <form className="adm-tile-act" onSubmit={(e) => { e.preventDefault(); add(Math.trunc(Number(n))); }}>
          <button type="button" className="adm-btn sm ghost" disabled={have < 1} onClick={() => add(-1)}>−</button>
          <button type="button" className="adm-btn sm" onClick={() => add(1)}>+1</button>
          <button type="button" className="adm-btn sm" onClick={() => add(10)}>+10</button>
          <input className="adm-in xs" type="number" placeholder="±N" value={n} onChange={(e) => setN(e.target.value)} />
        </form>
      )}
    </div>
  );
}

// ---------------- overview ----------------
/** «Технические работы»: the game closed for players while the admins check a release */
function Maintenance() {
  const m = useLoad(() => admin<{ on: boolean; text: string }>("maintenance"), []);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const on = !!m.data?.on;
  const set = async (next: boolean) => {
    if (next && !confirm("Закрыть игру для всех игроков (кроме админов)?")) return;
    setBusy(true);
    try { await admin("maintenance_set", { on: next, text: text ?? m.data?.text }); m.reload(); } catch (e) { alert((e as Error).message); }
    setBusy(false);
  };
  return (
    <Box title={on ? "🛠 Технические работы — ИГРА ЗАКРЫТА" : "🛠 Технические работы"}>
      <p className="muted tiny">Включите перед выкладкой: игроки увидят текст ниже вместо игры, а админы (их Telegram id) заходят как обычно и всё проверяют. Срабатывает у всех в течение ~30 секунд.</p>
      <textarea className="adm-in" rows={2} style={{ width: "100%" }} value={text ?? m.data?.text ?? ""} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        {on
          ? <button className="adm-btn" disabled={busy} onClick={() => set(false)}>Выключить — открыть игру</button>
          : <button className="adm-btn danger" disabled={busy} onClick={() => set(true)}>Включить технические работы</button>}
        {on && <button className="adm-btn ghost" disabled={busy} onClick={() => set(true)}>Сохранить текст</button>}
      </div>
    </Box>
  );
}

/** «Тося»: start the event by hand (3 hours), reset it (a new visit — every tray full again), stop it, or his own schedule */
function TosyaAdmin() {
  const t = useLoad(() => admin<{ mode: "auto" | "off" | "run"; here: boolean; endsAt: number | null; nextAt: number | null }>("tosya"), []);
  useTick();
  const [busy, setBusy] = useState(false);
  const set = async (mode: string, ask?: string) => {
    if (ask && !confirm(ask)) return;
    setBusy(true);
    try { await admin("tosya_set", { mode }); t.reload(); } catch (e) { alert((e as Error).message); }
    setBusy(false);
  };
  const d = t.data;
  const status = !d ? "…" : d.here ? `в игре до ${when(d.endsAt)} (ещё ${inTime(d.endsAt)})` : d.mode === "off" ? "выключен" : d.nextAt ? `приедет через ${inTime(d.nextAt)} (${when(d.nextAt)})` : "сейчас не в игре";
  return (
    <Box title={`🥟 Тося — ${status}`}>
      <p className="muted tiny">«Запустить» — Тося приезжает сейчас на 3 часа. «Обнулить» — начать заново: у всех игроков снова полный поднос и цены с начала. «Остановить» — уехал и не приезжает сам. «Авто» — приезжает сам в случайные дни.</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {!d?.here
          ? <button className="adm-btn" disabled={busy} onClick={() => set("run")}>Запустить</button>
          : <button className="adm-btn" disabled={busy} onClick={() => set("run", "Обнулить ивент? У всех игроков снова будет полный поднос, купленные пирожки останутся у них.")}>Обнулить</button>}
        <button className="adm-btn danger" disabled={busy || d?.mode === "off"} onClick={() => set("off")}>Остановить</button>
        <button className="adm-btn ghost" disabled={busy || d?.mode === "auto"} onClick={() => set("auto")}>Авто</button>
      </div>
    </Box>
  );
}

/** «Рассылка»: a message from the bot to every player (test — to yourself first) */
function Broadcast() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async (test: boolean) => {
    if (!test && !confirm("Отправить это сообщение всем игрокам?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await admin<{ test: boolean; queued?: number }>("broadcast", { text, test });
      setMsg(r.test ? "Отправлено вам в Telegram — проверьте, как выглядит." : `Поставлено в очередь: ${fmt(r.queued)} игрокам. Уходит примерно по 40 сообщений каждые 20 секунд, ночью (00–09 МСК) ждёт утра.`);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  return (
    <Box title="📣 Рассылка в Telegram">
      <p className="muted tiny">Сообщение от бота всем игрокам, у которых включены уведомления, с кнопкой «Играть». Сначала отправьте себе — проверить текст.</p>
      <textarea className="adm-in" rows={4} style={{ width: "100%" }} maxLength={1000} placeholder="🥟 Приехал Тося! Привёз пирожки с оружием, деталями и деньгами — заходи, пока не уехал!" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
        <button className="adm-btn ghost" disabled={busy || !text.trim()} onClick={() => go(true)}>Отправить себе</button>
        <button className="adm-btn" disabled={busy || !text.trim()} onClick={() => go(false)}>Отправить всем</button>
        <span className="muted tiny">{text.length}/1000</span>
      </div>
      {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
    </Box>
  );
}

/** «Воронка новичков»: how far the players of the last N days got, and where the ones who left stopped */
type FunnelData = { days: number; players: number; old48h: number; old8d: number; acted: number; after1h: number; day1: number; day7: number;
  medianFirstDayMin: number | null; medianActionsH1: number | null; steps: { id: string; name: string; ever: number; hour: number }[]; lastBeforeQuit: { type: string; n: number }[] };
function Funnel() {
  const [days, setDays] = useState(30);
  const f = useLoad(() => admin<FunnelData>("funnel", { days }), [days]);
  const d = f.data;
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");
  return (
    <Box title="🧭 Воронка новичков">
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span className="muted small">Новички за</span>
        {[7, 14, 30, 60].map((n) => <button key={n} className={`adm-btn sm ${days === n ? "" : "ghost"}`} onClick={() => setDays(n)}>{n} дн.</button>)}
      </div>
      <Err e={f.err} />
      {d && (
        <>
          <p className="small">Пришло (с Telegram): <b>{fmt(d.players)}</b> · сделали хоть что-то: <b>{fmt(d.acted)}</b> ({pct(d.acted, d.players)}) · вернулись после первого часа: <b>{fmt(d.after1h)}</b> ({pct(d.after1h, d.players)})</p>
          <p className="small">Зашли на следующий день: <b>{pct(d.day1, d.old48h)}</b> (из {fmt(d.old48h)}, кто пришёл раньше 2 дней назад) · через неделю: <b>{pct(d.day7, d.old8d)}</b> (из {fmt(d.old8d)})</p>
          <p className="small">Медиана: первый день длится <b>{d.medianFirstDayMin ?? "—"} мин</b> (от входа до последнего действия), действий за первый час — <b>{d.medianActionsH1 ?? "—"}</b></p>
          <Table rows={d.steps as unknown as Row[]} cols={[
            ["Шаг", (r) => String(r.name)],
            ["За первый час", (r) => `${fmt(r.hour)} · ${pct(num(r.hour), d.players)}`, "r"],
            ["Хоть раз", (r) => `${fmt(r.ever)} · ${pct(num(r.ever), d.players)}`, "r"],
          ]} />
          <p className="muted tiny" style={{ marginTop: 10 }}>Кто не вернулся после первого часа — их последнее действие (где остановились):</p>
          <Table rows={d.lastBeforeQuit as unknown as Row[]} cols={[
            ["Последнее действие", (r) => (String(r.type).startsWith("—") ? String(r.type) : <ActionName t={r.type} />)],
            ["Игроков", (r) => fmt(r.n), "r"],
          ]} />
        </>
      )}
    </Box>
  );
}

function ActionRows({ rows, withPlayer }: { rows: Row[]; withPlayer?: boolean }) {
  return (
    <Table rows={rows} empty="Действий нет" cols={[
      ["Когда", (r) => <span title={when(r.at)}>{ago(r.at)}</span>, "nowrap"],
      ...(withPlayer ? [["Игрок", (r: Row) => <PlayerLink r={r} />] as [string, (r: Row) => ReactNode]] : []),
      ["Действие", (r) => <><span className={r.ok ? "dot ok" : "dot bad"} /> <ActionName t={r.type} /></>, "nowrap"],
      ["Детали", (r) => <span className="adm-info">{legacyInfo(r.info)}</span>],
    ]} />
  );
}

// ---------------- players ----------------
function Players() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("seen");
  const [banned, setBanned] = useState(false);
  const [offset, setOffset] = useState(0);
  const { data, err } = useLoad(() => admin<{ total: number; rows: Row[] }>("players", { q: query, sort, banned, offset }), [query, sort, banned, offset]);
  return (
    <Box title={`👥 Игроки${data ? ` · ${fmt(data.total)}` : ""}`}>
      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); setOffset(0); setQuery(q); }}>
        <input className="adm-in grow" placeholder="ID, Telegram ID, имя или @username" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="adm-in" value={sort} onChange={(e) => { setOffset(0); setSort(e.target.value); }}>
          <option value="seen">последний вход</option><option value="new">новые</option><option value="xp">авторитет</option>
          <option value="damage">урон</option>
        </select>
        <label className="adm-check"><input type="checkbox" checked={banned} onChange={(e) => { setOffset(0); setBanned(e.target.checked); }} /> в бане</label>
        <button className="adm-btn">Найти</button>
      </form>
      <Err e={err} />
      <Table rows={data?.rows ?? []} empty={data ? "Никого не нашли" : "Загрузка…"} cols={[
        ["ID", (r) => <TgId r={r} />, "nowrap"],
        ["Игрок", (r) => <a href={`#player/${r.id}`} className="adm-who"><Avatar r={r} /><span className="ellipsis">{String(r.display_name)}</span>{r.banned_at ? <span className="tag bad">бан</span> : null}</a>],
        ["Ур.", (r) => String(r.level), "r"],
        ["Авторитет", (r) => fmt(r.xp), "r"],
        ["Урон за всё время", (r) => fmt(r.damage), "r"],
        ["Дней", (r) => String(r.active_days), "r"],
        ["Был", (r) => <span title={when(r.last_seen_at)}>{ago(r.last_seen_at)}</span>, "nowrap"],
        ["Создан", (r) => when(r.created_at), "nowrap"],
      ]} />
      {data && data.total > 50 && (
        <div className="row adm-pager">
          <button className="adm-btn ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>←</button>
          <span className="muted small">{offset + 1}–{Math.min(data.total, offset + 50)} из {fmt(data.total)}</span>
          <button className="adm-btn ghost" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>→</button>
        </div>
      )}
    </Box>
  );
}

// ---------------- action log ----------------
function Actions({ initial }: { initial: ActionsQuery }) {
  const [type, setType] = useState(initial.type ?? "");
  const [playerId, setPlayerId] = useState(initial.playerId ?? "");
  const [pid, setPid] = useState(initial.playerId ?? "");
  const [failed, setFailed] = useState(!!initial.failed);
  const [since, setSince] = useState(initial.sinceHours ?? 0);
  const [rows, setRows] = useState<Row[]>([]);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async (before?: number) => {
    setErr(null);
    try {
      const r = await admin<Row[]>("actions", { type: type || undefined, playerId: pid || undefined, failed, before, limit: 100, sinceHours: since || undefined });
      setRows((x) => (before ? [...x, ...r] : r));
      setMore(r.length === 100);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [type, pid, failed, since]);
  useEffect(() => { load(); }, [load]);
  return (
    <Box title={failed ? "⛔ Отказы" : "🧾 Действия игроков"} right={<button className="adm-btn ghost" onClick={() => load()}>Обновить</button>}>
      <p className="muted small">Каждое действие в игре, кроме ударов по боссу (их видно в боях игрока). Красная точка — сервер отказал. Хранится 60 дней.</p>
      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); setPid(playerId.trim()); }}>
        <select className="adm-in" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">все действия</option>
          {ACTION_TYPES.map((t) => <option key={t} value={t}>{ACTION_NAMES[t] ?? t}</option>)}
        </select>
        <div className="adm-pid">
          <input className="adm-in" placeholder="ID игрока" value={playerId} onChange={(e) => setPlayerId(e.target.value.replace(/\D/g, ""))} />
          <PlayerPicker onPick={(id) => { setPlayerId(String(id)); setPid(String(id)); }} />
        </div>
        <select className="adm-in" value={since} onChange={(e) => setSince(Number(e.target.value))}>
          <option value={0}>за всё время</option><option value={1}>за 1 час</option><option value={24}>за 24 часа</option><option value={168}>за 7 дней</option>
        </select>
        <label className="adm-check"><input type="checkbox" checked={failed} onChange={(e) => setFailed(e.target.checked)} /> только отказы</label>
        <button className="adm-btn">Применить</button>
        {pid && <button type="button" className="adm-btn ghost" onClick={() => { setPid(""); setPlayerId(""); }}>× игрок {pid}</button>}
      </form>
      <Err e={err} />
      <ActionRows rows={rows} withPlayer />
      {more && <button className="adm-btn ghost wide" onClick={() => load(num(rows[rows.length - 1]?.id))}>Ещё</button>}
    </Box>
  );
}

/** «▾» next to the player id: the list of all players with a search, to pick one quickly */
function PlayerPicker({ onPick }: { onPick: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(() => {
      admin<{ total: number; rows: Row[] }>("players", { q: q || undefined, sort: "seen" }).then((r) => { if (alive) { setRows(r.rows); setTotal(r.total); } }, () => alive && setRows([]));
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [open, q]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="adm-picker" ref={box}>
      <button type="button" className="adm-btn ghost" aria-expanded={open} title="Список игроков" onClick={() => setOpen((v) => !v)}>Все игроки ▾</button>
      {open && (
        <div className="adm-pop">
          <input className="adm-in" autoFocus placeholder="Имя, @username, ID или Telegram ID" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="adm-pop-list">
            {rows === null ? <p className="muted small">Загрузка…</p> : rows.length === 0 ? <p className="muted small">Никого не нашли</p> : rows.map((r) => (
              <button type="button" key={String(r.id)} className="adm-pop-row" onClick={() => { onPick(num(r.id)); setOpen(false); }}>
                <Avatar r={r} size={26} />
                <span className="grow ellipsis">{String(r.display_name)}{r.username ? <span className="muted small"> @{String(r.username)}</span> : null}</span>
                <span className="muted tiny">#{String(r.id)}</span>
              </button>
            ))}
          </div>
          {total > 50 && <p className="muted tiny">Показаны 50 из {fmt(total)} — уточните поиск</p>}
        </div>
      )}
    </div>
  );
}

function AdminLog() {
  const { data, err } = useLoad(() => admin<Row[]>("admin_log"), []);
  return (
    <Box title="🛡 Правки админов">
      <Err e={err} />
      <Table rows={data ?? []} empty="Правок ещё не было" cols={[
        ["Когда", (r) => when(r.at), "nowrap"],
        ["Админ", (r) => <AdminWho r={r} />],
        ["Игрок", (r) => <a href={`#player/${r.player_id}`} className="adm-who"><Avatar r={r} size={24} /><span className="ellipsis">{String(r.display_name ?? "?")}</span></a>],
        ["Что", (r) => OP_NAMES[String(r.op)] ?? String(r.op), "nowrap"],
        ["Изменение", (r) => <EditInfo op={String(r.op)} info={r.info} />],
      ]} />
    </Box>
  );
}

/** the admin: avatar and name (when they play the game too) and the Telegram id linking to the profile */
function AdminWho({ r }: { r: Row }) {
  const a = { display_name: r.admin_name ?? "Админ", photo_url: r.admin_photo, username: r.admin_username, telegram_id: r.admin_tg, id: null };
  return (
    <span className="adm-who">
      <Avatar r={a} size={24} />
      <span className="col" style={{ minWidth: 0 }}>
        {r.admin_name ? <span className="ellipsis">{String(r.admin_name)}</span> : null}
        <span className="small"><TgId r={a} /></span>
      </span>
    </span>
  );
}

/** «RUB: 78 → 79»: green when it went up, red when it went down */
function EditInfo({ op, info }: { op: string; info: unknown }) {
  const i = (info && typeof info === "object" ? info : {}) as Row;
  const label =
    op === "set_money" ? String(i.currency ?? "") :
    op === "set_item" || op === "add_item" ? itemById(String(i.item))?.name ?? String(i.item ?? "") :
    op === "set_talent" ? `${EXTRA_NAMES[String(i.weapon)] ?? itemById(String(i.weapon))?.name ?? i.weapon}: ${talentStop(String(i.weapon), String(i.branch))?.name ?? i.branch}` :
    op === "set_xp" ? "Авторитет" : op === "set_energy" ? "Энергия" : op === "set_talents" ? "Свободные таланты" : op === "set_name" ? "Имя" : "";
  if (op === "ban") return <span className="bad">заблокирован{i.reason ? `: ${i.reason}` : ""}</span>;
  if (op === "unban") return <span className="good">разблокирован</span>;
  if (op === "boss_limit_reset") return <span className="good">лимит боссов на сегодня сброшен <span className="muted">(боёв: {fmt(i.fights)})</span></span>;
  if (op === "give_tattoo_set") return <span className="good">выдан сет наколок «{String(i.set)}» <span className="muted">(новых: {fmt(i.added)})</span></span>;
  if (op === "reset") {
    const b = (i.before ?? {}) as Row;
    const m = (b.money ?? {}) as Row;
    return <span className="bad">прогресс сброшен <span className="muted">(было: авторитет {fmt(b.xp)}, урон {fmt(b.damage)}, {fmt(m.RUB)} RUB)</span></span>;
  }
  if (!("from" in i) || !("to" in i)) return <span className="adm-info">{infoText(info)}</span>;
  const numeric = typeof i.from === "number" && typeof i.to === "number";
  const cls = numeric ? (num(i.to) > num(i.from) ? "good" : num(i.to) < num(i.from) ? "bad" : "") : "";
  const diff = numeric ? num(i.to) - num(i.from) : 0;
  return (
    <span className={`adm-edit ${cls}`}>
      {label && <b>{label}: </b>}
      {numeric ? fmt(i.from) : `«${i.from}»`} → {numeric ? fmt(i.to) : `«${i.to}»`}
      {numeric && diff !== 0 && <span className="adm-diff"> ({diff > 0 ? "+" : ""}{fmt(diff)})</span>}
    </span>
  );
}
/** Wipes the player's progress back to the starting kit: two steps and a typed word, it cannot be undone */
function ResetBox({ name, onReset }: { name: string; onReset: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <div className="adm-ban"><button className="adm-btn ghost danger-text" onClick={() => setOpen(true)}>Сбросить прогресс…</button></div>;
  const ok = word.trim().toUpperCase() === "СБРОС";
  return (
    <form className="adm-reset" onSubmit={async (e) => { e.preventDefault(); if (!ok || busy) return; setBusy(true); if (await onReset()) { setOpen(false); setWord(""); } setBusy(false); }}>
      <b className="bad">Сбросить весь прогресс игрока «{name}»?</b>
      <p className="small muted">Обнулятся валюты, предметы, одежда, авторитет и уровень, таланты, комната и техника, задания и локации, бои и победы над боссами, пропуски, двор, достижения, ежедневные награды и задания, рейтинг и призы. Игрок выйдет из клана (лидерство перейдёт старейшему участнику). Останутся аккаунт, имя, аватарка, бан и журналы. Игрок получит стартовый набор, как новичок. <b>Отменить нельзя.</b></p>
      <div className="row">
        <input className="adm-in grow" placeholder="Напишите СБРОС" value={word} onChange={(e) => setWord(e.target.value)} />
        <button className="adm-btn danger" disabled={!ok || busy}>{busy ? "Сбрасываем…" : "Сбросить"}</button>
        <button type="button" className="adm-btn ghost" onClick={() => { setOpen(false); setWord(""); }}>Отмена</button>
      </div>
    </form>
  );
}

function BanBox({ banned, onBan, onUnban }: { banned: boolean; onBan: (reason: string) => Promise<boolean>; onUnban: () => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  const [sure, setSure] = useState(false);
  if (banned) return <div className="adm-ban"><button className="adm-btn" onClick={onUnban}>Разбанить</button></div>;
  return (
    <form className="adm-ban" onSubmit={(e) => { e.preventDefault(); if (sure) onBan(reason).then(() => setSure(false)); else setSure(true); }}>
      <input className="adm-in grow" placeholder="Причина бана (её увидит игрок)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="adm-btn danger">{sure ? "Точно забанить?" : "Забанить"}</button>
    </form>
  );
}

function Talents({ rows, edit }: { rows: Row[]; edit: EditFn }) {
  const level = (w: string, b: string) => num(rows.find((r) => r.weapon_id === w && r.branch === b)?.level);
  // the talent path, stop by stop (content/talents.ts TALENT_PATH)
  return (
    <Box title="⭐ Дорожка талантов">
      <Table rows={TALENT_PATH.map((s, i) => ({ id: s.key, i }))} cols={[
        ["№", (r) => String(Number(r.i) + 1)],
        ["Талант", (r) => { const s = TALENT_PATH[Number(r.i)]; return `${EXTRA_NAMES[s.target] ? "" : `${itemById(s.target)?.name ?? s.target}: `}${s.name}`; }],
        ["Уровень", (r) => {
          const s = TALENT_PATH[Number(r.i)];
          return (
            <select className="adm-in sm" value={level(s.target, s.branch)} onChange={(e) => edit({ op: "set_talent", weapon: s.target, branch: s.branch, level: Number(e.target.value) }, s.name)}>
              {Array.from({ length: s.max + 1 }, (_, k) => <option key={k} value={k}>{k}</option>)}
            </select>
          );
        }, "r"],
      ]} />
    </Box>
  );
}

// ---------------- game events ----------------
/** date for <input type="datetime-local"> in the admin's own time zone */
const localInput = (v: unknown) => {
  const d = new Date(v ? String(v) : Date.now());
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
type EvForm = { id?: number; title: string; description: string; startsAt: string; endsAt: string; effects: Record<string, string>; enabled: boolean; extra?: Record<string, unknown> };
const emptyEvent = (): EvForm => {
  const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 2 * 86_400_000);
  return { title: "", description: "", startsAt: localInput(start), endsAt: localInput(end), effects: {}, enabled: true };
};
function evStatus(r: Row, now: number) {
  if (!r.enabled) return <span className="muted">выключено</span>;
  const s = new Date(String(r.starts_at)).getTime(), e = new Date(String(r.ends_at)).getTime();
  if (now >= e) return <span className="muted">прошло</span>;
  if (now >= s) return <b style={{ color: "#3ddc84" }}>идёт</b>;
  return <span style={{ color: "#ffcc33" }}>скоро</span>;
}

function Events() {
  const { data, err, reload, setData } = useLoad(() => admin<Row[]>("events"), []);
  const [form, setForm] = useState<EvForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const now = Date.now();
  const edit = (r: Row) => setForm({
    id: Number(r.id), title: String(r.title), description: String(r.description ?? ""), startsAt: localInput(r.starts_at), endsAt: localInput(r.ends_at),
    effects: Object.fromEntries(Object.entries((r.effects ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, String(v)])), enabled: r.enabled !== false,
    // boss tweaks and «silent» are kept as they are (the form edits only the common effects)
    extra: Object.fromEntries(Object.entries((r.effects ?? {}) as Record<string, unknown>).filter(([k]) => k === "bosses" || k === "silent")),
  });
  const save = async () => {
    if (!form) return;
    setBusy(true); setSaveErr(null);
    try {
      const effects = { ...(form.extra ?? {}), ...Object.fromEntries(Object.entries(form.effects).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v.replace(",", "."))])) };
      const rows = await admin<Row[]>("event_save", { event: { id: form.id, title: form.title, description: form.description, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), effects, enabled: form.enabled } });
      setData(rows); setForm(null);
    } catch (e) { setSaveErr((e as Error).message); }
    setBusy(false);
  };
  const del = async (id: number) => {
    if (!confirm("Удалить событие?")) return;
    setData(await admin<Row[]>("event_delete", { id }));
  };
  const set = (k: keyof EvForm, v: unknown) => setForm((f) => (f ? { ...f, [k]: v } : f));
  return (
    <>
      <Box title="🎉 События" right={<span className="row" style={{ gap: 8 }}><button className="adm-btn ghost sm" onClick={reload}>Обновить</button><button className="adm-btn" onClick={() => { setSaveErr(null); setForm(emptyEvent()); }}>+ Новое событие</button></span>}>
        <p className="muted small" style={{ marginTop: 0 }}>Событие идёт с даты начала до даты конца (время — твоего часового пояса). Пока оно идёт, его эффекты меняют числа в игре, а игроки видят окно события и звезду в HUD. Изменения доходят до игры в течение ~30 секунд.</p>
        <Err e={err} />
        <Table rows={data ?? []} empty="Событий пока нет" cols={[
          ["Статус", (r) => evStatus(r, now), "nowrap"],
          ["Название", (r) => <b>{String(r.title)}</b>],
          ["Начало", (r) => when(r.starts_at), "nowrap"],
          ["Конец", (r) => (new Date(String(r.ends_at)).getTime() >= FOREVER - 86_400_000 ? "навсегда" : when(r.ends_at)), "nowrap"],
          ["Эффекты", (r) => {
            const e = cleanEffects(r.effects);
            const t = effectLines(e, (id) => bossById(id)?.name ?? id).join(" · ");
            return <>{t || <span className="muted">только объявление</span>}{e.silent && <span className="muted small"> · игрокам не показывается</span>}</>;
          }],
          ["", (r) => <span className="row" style={{ gap: 6 }}><button className="adm-btn ghost sm" onClick={() => { setSaveErr(null); edit(r); }}>Изменить</button><button className="adm-btn danger sm" onClick={() => del(Number(r.id))}>Удалить</button></span>, "nowrap"],
        ]} />
      </Box>
      {form && (
        <Box title={form.id ? `Событие #${form.id}` : "Новое событие"} right={<button className="adm-btn ghost sm" onClick={() => setForm(null)}>Закрыть</button>}>
          <form className="adm-ev" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <label>Название<input className="adm-in" value={form.title} maxLength={80} onChange={(e) => set("title", e.target.value)} placeholder="Например: Выходные удвоения" required /></label>
            <label>Описание для игроков<textarea className="adm-in" rows={3} value={form.description} maxLength={1000} onChange={(e) => set("description", e.target.value)} placeholder="Что происходит и зачем заходить" /></label>
            <div className="adm-ev-dates">
              <label>Начало<input className="adm-in" type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} required /></label>
              <label>Конец<input className="adm-in" type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} required /></label>
            </div>
            <div className="adm-ev-fx">
              <b>Эффекты</b> <span className="muted small">(пусто — без изменений)</span>
              {EVENT_EFFECTS.map((d) => (
                <label key={d.id} className="adm-ev-row">
                  <span>{d.name}<br /><span className="muted small">{d.hint}</span></span>
                  <input className="adm-in sm" type="number" min={d.min} max={d.max} step={d.step} placeholder={String(d.neutral)} value={form.effects[d.id] ?? ""} onChange={(e) => set("effects", { ...form.effects, [d.id]: e.target.value })} />
                </label>
              ))}
            </div>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Включено</label>
            <Err e={saveErr} />
            <button className="adm-btn wide" disabled={busy}>{busy ? "Сохраняем…" : form.id ? "Сохранить" : "Создать событие"}</button>
          </form>
        </Box>
      )}
    </>
  );
}

/** Boss state now from the events: in the game or not (art by default), HP and reward multipliers, the nearest end. */
function bossNow(id: string, rows: Row[], now: number) {
  const b = bossById(id)!;
  let open = bossHasArt(b), hp = 1, reward = 1, until: number | null = null;
  const live = rows
    .filter((r) => r.enabled !== false && new Date(String(r.starts_at)).getTime() <= now && new Date(String(r.ends_at)).getTime() > now)
    .sort((a, c) => new Date(String(a.starts_at)).getTime() - new Date(String(c.starts_at)).getTime() || Number(a.id) - Number(c.id));
  for (const r of live) {
    const t = cleanEffects(r.effects).bosses?.[id];
    if (!t) continue;
    const end = new Date(String(r.ends_at)).getTime();
    if (t.visible !== undefined) open = t.visible;
    if (t.hpPct) hp *= t.hpPct / 100;
    if (t.rewardPct) reward *= t.rewardPct / 100;
    if (end < FOREVER - 86_400_000) until = until === null ? end : Math.min(until, end);
  }
  return { open, hp, reward, until };
}

type BossAct = "out" | "in" | "in_days" | "hp_up" | "hp_down" | "reward";
const BOSS_ACTS: { id: BossAct; name: string; pct?: number; days?: number | "" }[] = [
  { id: "out", name: "Убрать из игры", days: "" },
  { id: "in", name: "Добавить в игру" },
  { id: "in_days", name: "Добавить в игру на время", days: 2 },
  { id: "hp_up", name: "Увеличить здоровье", pct: 150, days: "" },
  { id: "hp_down", name: "Уменьшить здоровье", pct: 50, days: "" },
  { id: "reward", name: "Увеличить награды", pct: 200, days: "" },
];

function BossControls({ rows, onSaved }: { rows: Row[]; onSaved: (r: Row[]) => void }) {
  const [menu, setMenu] = useState<string | null>(null);
  const now = Date.now();
  return (
    <Box title="👹 Боссы цепочки">
      <p className="muted small" style={{ marginTop: 0 }}>Нажми «+» у босса: убрать или добавить его в игру (навсегда или на N дней), изменить здоровье или награды. Каждое действие — служебное событие в списке выше (игрокам окно не показывается); удали событие, чтобы отменить. Здоровье меняется у новых боёв, награды — при получении.</p>
      <div className="adm-bosses">
        {BOSSES.map((b) => {
          const s = bossNow(b.id, rows, now);
          return (
            <div key={b.id} className="adm-boss">
              {b.photo.portrait
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.photo.portrait} alt="" className="adm-boss-img" />
                : <span className="adm-boss-img empty">{b.name.slice(0, 1)}</span>}
              <span className="grow col" style={{ minWidth: 0, gap: 2 }}>
                <b className="ellipsis">{b.order}. {b.name}</b>
                <span className="small">
                  {s.open ? <span style={{ color: "#3ddc84" }}>в игре</span> : <span className="muted">не в игре</span>}
                  {!bossHasArt(b) && <span className="muted"> · нет арта</span>}
                  {s.hp !== 1 && <> · HP {Math.round(s.hp * 100)}%</>}
                  {s.reward !== 1 && <> · награды {Math.round(s.reward * 100)}%</>}
                  {s.until && <span className="muted"> · до {when(new Date(s.until).toISOString())}</span>}
                </span>
              </span>
              <button className="adm-btn sm" onClick={() => setMenu(menu === b.id ? null : b.id)} aria-label={`Действия: ${b.name}`}>+</button>
              {menu === b.id && <BossMenu id={b.id} onClose={() => setMenu(null)} onSaved={(r) => { onSaved(r); setMenu(null); }} />}
            </div>
          );
        })}
      </div>
    </Box>
  );
}

function BossMenu({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: (r: Row[]) => void }) {
  const b = bossById(id)!;
  const [vals, setVals] = useState<Record<string, { pct?: string; days?: string }>>(
    Object.fromEntries(BOSS_ACTS.map((a) => [a.id, { pct: a.pct !== undefined ? String(a.pct) : undefined, days: a.days !== undefined ? String(a.days) : undefined }])),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (a: (typeof BOSS_ACTS)[number]) => {
    const v = vals[a.id];
    const days = v.days ? Number(v.days.replace(",", ".")) : 0;
    const pct = v.pct ? Number(v.pct.replace(",", ".")) : 100;
    if (a.id === "in_days" && !(days > 0)) return setErr("Укажи, на сколько дней");
    if ((a.id === "hp_up" && !(pct > 100)) || (a.id === "reward" && !(pct > 100))) return setErr("Процент должен быть больше 100");
    if (a.id === "hp_down" && !(pct > 0 && pct < 100)) return setErr("Процент должен быть меньше 100");
    const tweak: BossTweak = a.id === "out" ? { visible: false } : a.id === "in" || a.id === "in_days" ? { visible: true } : a.id === "reward" ? { rewardPct: pct } : { hpPct: pct };
    const start = Date.now();
    const end = days > 0 ? start + days * 86_400_000 : FOREVER;
    const what = a.id === "out" ? "убран из игры" : a.id === "in" || a.id === "in_days" ? "в игре" : a.id === "reward" ? `награды ${pct}%` : `HP ${pct}%`;
    const title = `${b.name}: ${what}${days > 0 ? ` на ${days} дн.` : ""}`;
    setBusy(true); setErr(null);
    try {
      onSaved(await admin<Row[]>("event_save", { event: { title, description: "", startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), effects: { bosses: { [id]: tweak }, silent: true }, enabled: true } }));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const set = (k: string, f: "pct" | "days", v: string) => setVals((s) => ({ ...s, [k]: { ...s[k], [f]: v } }));
  return (
    <div className="adm-boss-menu" onClick={(e) => e.stopPropagation()}>
      <div className="row" style={{ justifyContent: "space-between" }}><b>{b.name}</b><button className="adm-btn ghost sm" onClick={onClose}>×</button></div>
      {BOSS_ACTS.map((a) => (
        <div key={a.id} className="adm-boss-act">
          <span className="grow">{a.name}</span>
          {a.pct !== undefined && <label className="row" style={{ gap: 4 }}><input className="adm-in sm" type="number" min={5} max={1000} step={5} value={vals[a.id].pct ?? ""} onChange={(e) => set(a.id, "pct", e.target.value)} />%</label>}
          {a.days !== undefined && <label className="row" style={{ gap: 4 }}><input className="adm-in sm" type="number" min={0} step={0.5} placeholder="∞" value={vals[a.id].days ?? ""} onChange={(e) => set(a.id, "days", e.target.value)} />дн.</label>}
          <button className="adm-btn sm" disabled={busy} onClick={() => run(a)}>OK</button>
        </div>
      ))}
      <span className="muted small">Дни пустые — навсегда.</span>
      <Err e={err} />
    </div>
  );
}

/* «Ивенты: боссы» — the event bosses (content/event-bosses.ts): put one in the game or take him out */
type EvBoss = { id: string; name: string; hp: number; portrait: string; on: boolean };
function EventBosses() {
  const { data, err, setData } = useLoad(() => admin<{ bosses: EvBoss[] }>("event_bosses"), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const flip = async (b: EvBoss) => {
    if (!confirm(b.on ? `Убрать ${b.name} из игры?` : `Включить ${b.name} в игре? Игроки увидят кнопку «Ивент» на главной.`)) return;
    setBusy(b.id); setSaveErr(null);
    try { setData(await admin("event_boss_set", { id: b.id, on: !b.on })); } catch (e) { setSaveErr((e as Error).message); }
    setBusy(null);
  };
  return (
    <Box title="🐸 Ивент-боссы">
      <p className="muted small" style={{ marginTop: 0 }}>Ивент-боссы вне обычной цепочки. Включённый босс появляется у всех игроков: кнопка «Ивент» справа на главной и его комната с дверью. Изменения доходят до игры в течение ~30 секунд.</p>
      <Err e={err} />
      <div className="adm-evb">
        {(data?.bosses ?? []).map((b) => (
          <div key={b.id} className={`adm-evb-row ${b.on ? "on" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.portrait} alt="" />
            <span className="grow"><b>{b.name}</b><br /><span className="muted small">здоровье {b.hp.toLocaleString("ru-RU")} · «Пацанский», награда за победу</span></span>
            <span className={b.on ? "adm-ok" : "muted"}>{b.on ? "в игре" : "выключен"}</span>
            <button className={`adm-btn ${b.on ? "danger" : ""} sm`} disabled={busy === b.id} onClick={() => flip(b)}>{b.on ? "Выключить" : "Включить"}</button>
          </div>
        ))}
      </div>
      <Err e={saveErr} />
    </Box>
  );
}

/* «Ивенты: Обменник» — when the exchanger works: a cycle of days (which day of it) and Moscow hours, or always / never */
type ExSched = { mode: "cycle" | "always" | "closed"; every: number; offset: number; from: number; to: number };
function ExchangeEvent() {
  const { data, err, setData } = useLoad(() => admin<{ schedule: ExSched; window: { open: boolean; until: number }; text: string }>("exchange_schedule"), []);
  const [f, setF] = useState<ExSched | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const cur = f ?? data?.schedule ?? null;
  const set = (k: keyof ExSched, v: string | number) => setF({ ...(cur as ExSched), [k]: typeof v === "string" && k !== "mode" ? Number(v) : v } as ExSched);
  const save = async () => {
    if (!cur) return;
    setBusy(true); setSaveErr(null);
    try { setData(await admin("exchange_schedule_save", { schedule: cur })); setF(null); } catch (e) { setSaveErr((e as Error).message); }
    setBusy(false);
  };
  const w = data?.window;
  useTick();
  return (
    <Box title="💱 Обменник" right={w && <span className={w.open ? "adm-ok" : "muted"}>{w.open ? `открыт · закроется через ${inTime(w.until)} (${when(w.until)})` : `закрыт · откроется через ${inTime(w.until)} (${when(w.until)})`}</span>}>
      <p className="muted small" style={{ marginTop: 0 }}>Когда работает обменник во дворе (ларёк с барыгой). Дни и часы — по Москве. Сейчас: <b>{data?.text ?? "…"}</b>. Изменения доходят до игры в течение ~30 секунд.</p>
      <Err e={err} />
      {cur && (
        <form className="adm-ev" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label>Режим
            <select className="adm-in" value={cur.mode} onChange={(e) => set("mode", e.target.value)}>
              <option value="cycle">По расписанию</option>
              <option value="always">Открыт всегда</option>
              <option value="closed">Закрыт</option>
            </select>
          </label>
          {cur.mode === "cycle" && (
            <div className="adm-ev-dates">
              <label>Раз в сколько дней<input className="adm-in" type="number" min={1} max={30} value={cur.every} onChange={(e) => set("every", e.target.value)} /></label>
              <label>Какой день цикла (0…{cur.every - 1})<input className="adm-in" type="number" min={0} max={cur.every - 1} value={cur.offset} onChange={(e) => set("offset", e.target.value)} /></label>
              <label>Открывается в (час МСК)<input className="adm-in" type="number" min={0} max={23} value={cur.from} onChange={(e) => set("from", e.target.value)} /></label>
              <label>Закрывается в (час МСК){cur.to > 24 ? " — следующего дня" : ""}<input className="adm-in" type="number" min={0} max={24} value={cur.to > 24 ? cur.to - 24 : cur.to} onChange={(e) => { const h = Number(e.target.value); set("to", h <= cur.from ? h + 24 : h); }} /></label>
            </div>
          )}
          <p className="muted small">«Раз в 1 день» — каждый день; 0–24 — весь день. Час закрытия меньше часа открытия — это следующий день (11 → 3: до 3 ночи). Сдвинуть открытие на завтра — поменяй «какой день цикла».</p>
          <Err e={saveErr} />
          <div className="row" style={{ gap: 8 }}>
            <button className="adm-btn" disabled={busy || !f}>Сохранить</button>
            {f && <button type="button" className="adm-btn ghost" onClick={() => setF(null)}>Отменить</button>}
          </div>
        </form>
      )}
    </Box>
  );
}
