"use client";
/*
 * XCLOSE admin panel (outside the game): /admin. Sign-in from the Telegram app (Mini App) or the Login Widget; the Telegram id must be in
 * ADMIN_TELEGRAM_IDS. Overview, players, a player's card (edit money, items, authority, energy, talents, name, ban),
 * the action log and the admins' own log. Views are in the URL hash, so a player's card can be linked: #player/42.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./admin.css";
import { ITEMS, itemById } from "../../content/items.ts";
import { CURRENCIES } from "../../content/currencies.ts";
import { TALENT_NODE_IDS, TALENT_WEAPONS, talentTree } from "../../content/talents.ts";
import { BOSSES, bossById, bossHasArt, keyId } from "../../content/bosses.ts";
import { offerById } from "../../content/shop.ts";
import { taskById } from "../../content/locations.ts";
import { EVENT_EFFECTS, FOREVER, effectLines, cleanEffects, type BossTweak } from "../../content/events.ts";

const TOKEN_KEY = "xcloce.admin";
const ACTION_TYPES = [
  "fight_start", "fight_claim", "fight_flee", "task", "location_claim", "yard_pick", "buy", "exchange", "use", "equip", "unequip",
  "clan_create", "clan_join", "clan_leave", "clan_kick", "clan_edit", "daily_claim", "sell", "rename", "slots_spin",
  "equipment_upgrade", "talent_up", "talent_reset", "room_buy", "room_set", "look_set", "decor_set", "decor_save", "piece_buy", "quest_claim", "quest_chest",
  "notify_set", "achievement_claim", "prize_claim", "game_start", "bj_move", "zonk_move", "upgrade", "up_sell", "up_take", "clan_cancel", "clan_accept", "clan_reject", "stash_collect",
];
const ACTION_NAMES: Record<string, string> = {
  fight_start: "начал бой", fight_claim: "забрал награду боя", fight_flee: "сбежал из боя", task: "задание", location_claim: "награда локации",
  yard_pick: "находка во дворе", buy: "покупка", exchange: "обмен", use: "использовал", equip: "надел", unequip: "снял",
  clan_create: "создал клан", clan_join: "заявка в клан", clan_leave: "вышел из клана", clan_kick: "исключил из клана", clan_edit: "изменил клан",
  daily_claim: "ежедневная награда", sell: "продажа", rename: "смена имени", slots_spin: "автомат 777", equipment_upgrade: "улучшение комнаты",
  talent_up: "талант", talent_reset: "сброс талантов", room_buy: "купил комнату", room_set: "сменил комнату", look_set: "внешность", decor_set: "декор", decor_save: "обставил комнату", piece_buy: "купил мебель",
  quest_claim: "задание дня", quest_chest: "сундук дня", notify_set: "уведомления", achievement_claim: "достижение", prize_claim: "приз недели",
  game_start: "мини-игра", bj_move: "блэкджек", zonk_move: "зонк", upgrade: "апгрейдер", up_sell: "продал улучшенное", up_take: "забрал улучшенное", clan_cancel: "отменил заявку", clan_accept: "принял в клан", clan_reject: "отклонил заявку", stash_collect: "собрал набор нычек",
};
const OP_NAMES: Record<string, string> = {
  set_money: "валюта", set_item: "предмет", add_item: "выдал", set_xp: "авторитет", set_energy: "энергия", set_talents: "свободные таланты",
  set_talent: "ветка таланта", set_name: "имя", ban: "бан", unban: "разбан", reset: "сброс прогресса",
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
  const d = new Date(String(v));
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
type ActionsQuery = { type?: string; failed?: boolean; sinceHours?: number; playerId?: string };
type View = { tab: "dash" | "log" | "events" } | { tab: "players" } | { tab: "actions"; q: ActionsQuery; key: string } | { tab: "player"; id: number };
function parseHash(): View {
  const h = typeof location === "undefined" ? "" : location.hash.slice(1);
  const [path, query = ""] = h.split("?");
  const m = /^player\/(\d+)$/.exec(path);
  if (m) return { tab: "player", id: Number(m[1]) };
  if (path === "actions") {
    const p = new URLSearchParams(query);
    return { tab: "actions", key: query, q: { type: p.get("type") ?? undefined, failed: p.get("failed") === "1", sinceHours: p.get("since") ? Number(p.get("since")) : undefined, playerId: p.get("player") ?? undefined } };
  }
  if (path === "players" || path === "log" || path === "events") return { tab: path };
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
const go = (h: string) => { location.hash = h; };

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
  return (
    <div className="adm">
      <header className="adm-top">
        <b className="adm-logo"><span>X</span>CLOSE <small>админка</small></b>
        <nav>
          {([["dash", "Обзор"], ["players", "Игроки"], ["actions", "Действия"], ["events", "События"], ["log", "Правки админов"]] as const).map(([k, t]) => (
            <a key={k} href={`#${k}`} className={view.tab === k || (k === "players" && view.tab === "player") ? "on" : ""}>{t}</a>
          ))}
        </nav>
        <span className="grow" />
        <span className="muted small">TG {me}</span>
        <button className="adm-btn ghost" onClick={out}>Выйти</button>
      </header>
      <main className="adm-main">
        {view.tab === "dash" && <Dashboard />}
        {view.tab === "players" && <Players />}
        {view.tab === "actions" && <Actions key={view.key} initial={view.q} />}
        {view.tab === "log" && <AdminLog />}
        {view.tab === "events" && <Events />}
        {view.tab === "player" && <Player key={view.id} id={view.id} />}
      </main>
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
function Box({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="adm-card">
      <div className="adm-card-h"><h3>{title}</h3><span className="grow" />{right}</div>
      {children}
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
function Dashboard() {
  const { data, err, reload } = useLoad(() => admin<{ counts: Row; byType: Row[]; top: Row[]; suspicious: Row[] }>("dashboard"), []);
  const feed = useLoad(() => admin<Row[]>("actions", { limit: 40 }), []);
  useEffect(() => {
    const t = setInterval(() => { reload(); feed.reload(); }, 30_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const c = data?.counts ?? {};
  const stats: [string, unknown, string?][] = [
    ["Игроков", c.players, `из них Telegram: ${fmt(c.telegram)}`], ["Онлайн (15 мин)", c.online], ["Активны за 24 ч", c.active24], ["Активны за 7 дн", c.active7],
    ["Новых за 24 ч", c.new24], ["Идёт боёв", c.fights], ["Ударов за 24 ч", c.hits24, `урон ${fmt(c.damage24)}`], ["Действий за 24 ч", c.actions24, `отказов ${fmt(c.failed24)} — открыть`], ["В бане", c.banned],
  ];
  return (
    <>
      <Err e={err} />
      <div className="adm-stats">
        {stats.map(([t, v, s]) => {
          const inner = <><span className="muted small">{t}</span><b>{data ? fmt(v) : "…"}</b>{s && <span className="muted tiny">{s}</span>}</>;
          // the actions tile opens the day's refusals
          return t === "Действий за 24 ч"
            ? <a key={t} className="adm-stat link" href={actionsHref({ failed: true, since: 24 })} title="Все отказы за 24 часа">{inner}</a>
            : <div key={t} className="adm-stat">{inner}</div>;
        })}
      </div>
      <div className="adm-grid2">
        <Box title="Действия за 24 ч">
          <p className="muted tiny">Нажмите на действие или на число отказов — откроется список за 24 часа.</p>
          <Table rows={data?.byType ?? []} cols={[
            ["Действие", (r) => <a href={actionsHref({ type: String(r.type), since: 24 })}><ActionName t={r.type} /></a>],
            ["Всего", (r) => <a href={actionsHref({ type: String(r.type), since: 24 })}>{fmt(r.total)}</a>, "r"],
            ["Отказов", (r) => (num(r.failed) ? <a className="bad" href={actionsHref({ type: String(r.type), failed: true, since: 24 })}>{fmt(r.failed)}</a> : "0"), "r"],
          ]} />
        </Box>
        <Box title="Топ по урону за всё время">
          <Table rows={data?.top ?? []} cols={[["#", (r) => (data!.top.indexOf(r) + 1)], ["Игрок", (r) => <PlayerLink r={r} />], ["Урон", (r) => fmt(r.total_damage), "r"]]} />
        </Box>
      </div>
      {!!data?.suspicious.length && (
        <Box title="Подозрительно много отказов за 24 ч">
          <p className="muted small">Сервер отклонил 20+ действий: так выглядит спам кнопок, скрипт или попытка обмануть сервер.</p>
          <Table rows={data.suspicious} cols={[["Игрок", (r) => <PlayerLink r={r} />], ["Действий", (r) => <a href={actionsHref({ player: String(r.id), since: 24 })}>{fmt(r.total)}</a>, "r"], ["Отказов", (r) => <a className="bad" href={actionsHref({ player: String(r.id), failed: true, since: 24 })}>{fmt(r.failed)}</a>, "r"]]} />
        </Box>
      )}
      <Box title="Последние действия" right={<a href="#actions" className="small">все →</a>}>
        <ActionRows rows={feed.data ?? []} withPlayer />
      </Box>
    </>
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
    <Box title={`Игроки${data ? ` · ${fmt(data.total)}` : ""}`}>
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
    <Box title={failed ? "Отказы" : "Действия игроков"} right={<button className="adm-btn ghost" onClick={() => load()}>Обновить</button>}>
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
    <Box title="Правки админов">
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
    op === "set_talent" ? `${itemById(String(i.weapon))?.name ?? i.weapon}: ${talentTree(String(i.weapon)).find((b) => b.id === i.branch)?.name ?? i.branch}` :
    op === "set_xp" ? "Авторитет" : op === "set_energy" ? "Энергия" : op === "set_talents" ? "Свободные таланты" : op === "set_name" ? "Имя" : "";
  if (op === "ban") return <span className="bad">заблокирован{i.reason ? `: ${i.reason}` : ""}</span>;
  if (op === "unban") return <span className="good">разблокирован</span>;
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

// ---------------- player card ----------------
type PlayerData = {
  player: Row; money: Record<string, number>; inventory: Row[]; stats: Row | null; talents: Row[]; clan: Row | null;
  fights: Row[]; actions: Row[]; ledger: Row[]; admin: Row[];
};

function Player({ id }: { id: number }) {
  const { data, err, reload } = useLoad(() => admin<PlayerData>("player", { id }), [id]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<"actions" | "fights" | "ledger" | "admin">("actions");
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
  return (
    <>
      <div className="adm-ph">
        <a href="#players" className="small">← игроки</a>
        <h2 className="adm-who-h"><Avatar r={p} size={40} />{String(p.display_name)} {p.banned_at ? <span className="tag bad">бан{p.ban_reason ? `: ${p.ban_reason}` : ""}</span> : null}</h2>
        <div className="muted small adm-meta">
          <span>ID {String(p.id)}</span>
          {p.telegram_id ? <span>TG <TgId r={p} /></span> : <span className="tag">гость</span>}
          {p.username ? <a href={`https://t.me/${p.username}`} target="_blank" rel="noreferrer">@{String(p.username)}</a> : null}
          <span>ур. {String(p.level)}</span>
          <span>создан {when(p.created_at)}</span>
          <span>был {ago(p.last_seen_at)}</span>
          <span>дней в игре {String(p.active_days)}</span>
          {data.clan && <span>клан [{String(data.clan.tag)}] {String(data.clan.name)}{data.clan.role === "leader" ? " (лидер)" : ""}</span>}
        </div>
      </div>
      {msg && <p className={msg.ok ? "adm-ok" : "adm-err"}>{msg.text}</p>}
      <div className="adm-grid2">
        <Box title="Валюта и параметры">
          <div className="adm-form">
            {CURRENCIES.map((c) => <EditNum key={c} label={c} value={data.money[c]} step="any" onSave={(v) => edit({ op: "set_money", currency: c, amount: v }, c)} />)}
            <EditNum label="Авторитет (XP)" value={num(p.xp)} onSave={(v) => edit({ op: "set_xp", value: v }, "Авторитет")} />
            <EditNum label="Энергия" value={num(p.energyNow)} onSave={(v) => edit({ op: "set_energy", value: v }, "Энергия")} />
            <EditNum label="Свободные таланты" value={num(p.talents)} onSave={(v) => edit({ op: "set_talents", value: v }, "Таланты")} />
            <EditText label="Имя" value={String(p.display_name)} onSave={(v) => edit({ op: "set_name", value: v }, "Имя")} />
          </div>
          <BanBox banned={!!p.banned_at} onBan={(reason) => edit({ op: "ban", reason }, "Бан")} onUnban={() => edit({ op: "unban" }, "Разбан")} />
          <ResetBox name={String(p.display_name)} onReset={() => edit({ op: "reset" }, "Сброс прогресса")} />
        </Box>
        <Box title="Статистика">
          {data.stats ? (
            <dl className="adm-dl">
              {([["Урон всего", "total_damage"], ["Побед", "fights_won"], ["Поражений", "fights_lost"], ["Заданий", "tasks_done"], ["Шагов заданий", "task_steps"], ["Локаций", "locations_done"], ["Находок во дворе", "yard_found"], ["Наград", "rewards_got"]] as const).map(([t, k]) => (
                <div key={k}><dt>{t}</dt><dd>{fmt(data.stats![k])}</dd></div>
              ))}
            </dl>
          ) : <p className="muted small">Нет статистики</p>}
          {!!data.stats?.weapons && Object.keys(data.stats.weapons as Row).length > 0 && (
            <p className="small muted">Удары по оружию: {Object.entries(data.stats.weapons as Row).map(([w, v]) => `${itemById(w)?.name ?? w} ${fmt(typeof v === "object" ? (v as Row).hits ?? JSON.stringify(v) : v)}`).join(" · ")}</p>
          )}
        </Box>
      </div>
      <Passes rows={data.inventory} edit={edit} />
      <Inventory rows={data.inventory} edit={edit} />
      <Talents rows={data.talents} edit={edit} />
      <section className="adm-card">
        <div className="adm-tabs">
          {([["actions", `Действия (${data.actions.length})`], ["fights", `Бои (${data.fights.length})`], ["ledger", `Движения (${data.ledger.length})`], ["admin", `Правки (${data.admin.length})`]] as const).map(([k, t]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t}</button>
          ))}
        </div>
        {tab === "actions" && <ActionRows rows={data.actions} />}
        {tab === "fights" && (
          <Table rows={data.fights} empty="Боёв нет" cols={[
            ["#", (r) => String(r.id)], ["Босс", (r) => bossById(String(r.boss_id))?.name ?? String(r.boss_id)], ["Статус", (r) => `${r.status}${r.solo ? " · соло" : ""}`],
            ["Урон", (r) => fmt(r.my_damage), "r"], ["Ударов", (r) => fmt(r.my_hits), "r"], ["Начат", (r) => when(r.started_at), "nowrap"],
            ["Награда", (r) => <code className="adm-code">{infoText(r.reward)}</code>],
          ]} />
        )}
        {tab === "ledger" && (
          <>
            <p className="muted small">Все изменения валют, предметов, энергии и талантов (последние 300).</p>
            <Table rows={data.ledger} cols={[
              ["Когда", (r) => when(r.created_at), "nowrap"], ["Что", (r) => (r.kind === "item" || r.kind === "use" ? itemById(String(r.key))?.name ?? String(r.key) : String(r.key))],
              ["Изм.", (r) => <span className={num(r.delta) < 0 ? "bad" : "good"}>{num(r.delta) > 0 ? "+" : ""}{fmt(r.delta)}</span>, "r"], ["Причина", (r) => <code className="adm-code">{String(r.reason)}</code>],
            ]} />
          </>
        )}
        {tab === "admin" && (
          <Table rows={data.admin} empty="Админ не правил этого игрока" cols={[
            ["Когда", (r) => when(r.at), "nowrap"], ["Админ", (r) => <AdminWho r={r} />], ["Что", (r) => OP_NAMES[String(r.op)] ?? String(r.op), "nowrap"], ["Изменение", (r) => <EditInfo op={String(r.op)} info={r.info} />],
          ]} />
        )}
      </section>
    </>
  );
}

type EditFn = (e: Row, label: string) => Promise<boolean>;

function EditNum({ label, value, onSave, step = "1" }: { label: string; value: number; onSave: (v: number) => Promise<boolean>; step?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const changed = v !== String(value) && v.trim() !== "" && Number.isFinite(Number(v));
  return (
    <form className="adm-field" onSubmit={(e) => { e.preventDefault(); if (changed) onSave(Number(v)); }}>
      <label>{label}</label>
      <input className="adm-in" type="number" step={step} min={0} value={v} onChange={(e) => setV(e.target.value)} />
      <button className="adm-btn" disabled={!changed}>Сохранить</button>
    </form>
  );
}
function EditText({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const changed = v.trim() !== value && v.trim() !== "";
  return (
    <form className="adm-field" onSubmit={(e) => { e.preventDefault(); if (changed) onSave(v.trim()); }}>
      <label>{label}</label>
      <input className="adm-in" maxLength={32} value={v} onChange={(e) => setV(e.target.value)} />
      <button className="adm-btn" disabled={!changed}>Сохранить</button>
    </form>
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

/** Boss passes: one row per boss card — how many the player has, how many open the next boss, quick buttons to add. */
function Passes({ rows, edit }: { rows: Row[]; edit: EditFn }) {
  const [n, setN] = useState<Record<string, string>>({});
  const have = (id: string) => num(rows.find((r) => r.item_id === id)?.qty);
  const add = (id: string, delta: number) => {
    if (!delta) return;
    const name = itemById(id)?.name ?? id;
    void edit({ op: "add_item", item: id, delta }, `${name} ${delta > 0 ? "+" : ""}${delta}`).then((ok) => ok && setN((x) => ({ ...x, [id]: "" })));
  };
  return (
    <Box title="Пропуски на боссов">
      <Table rows={BOSSES.filter((b) => !b.final).map((b) => ({ id: keyId(b.id), boss: b.id, order: b.order }))} empty="Нет боссов" cols={[
        ["Пропуск", (r) => {
          const b = bossById(String(r.boss))!;
          return <><b>{itemById(String(r.id))?.name ?? String(r.id)}</b> <span className="muted tiny">#{b.order}</span></>;
        }],
        ["Есть", (r) => <b>{fmt(have(String(r.id)))}</b>, "r"],
        ["Открывает", (r) => {
          const next = BOSSES.find((x) => x.order === Number(r.order) + 1);
          if (!next) return <span className="muted small">—</span>;
          const need = next.keysToUnlock ?? 3;
          const ok = have(String(r.id)) >= need;
          return <span className={`small ${ok ? "" : "muted"}`}>{next.name}: нужно {need}{ok ? " ✓" : ""}</span>;
        }],
        ["Выдать", (r) => {
          const id = String(r.id);
          const v = n[id] ?? "";
          return (
            <form className="adm-qty" onSubmit={(e) => { e.preventDefault(); add(id, Math.trunc(Number(v))); }}>
              <button type="button" className="adm-btn sm" onClick={() => add(id, 1)}>+1</button>
              <button type="button" className="adm-btn sm" onClick={() => add(id, 3)}>+3</button>
              <input className="adm-in sm" type="number" placeholder="±N" value={v} onChange={(e) => setN((x) => ({ ...x, [id]: e.target.value }))} />
              <button className="adm-btn sm" disabled={!v || !Number(v)}>✓</button>
            </form>
          );
        }],
      ]} />
      <p className="muted small">Пропуски тратятся при входе в бой со следующим боссом. Отрицательное число забирает пропуски.</p>
    </Box>
  );
}

function Inventory({ rows, edit }: { rows: Row[]; edit: EditFn }) {
  const [add, setAdd] = useState("");
  const [qty, setQty] = useState("1");
  const [filter, setFilter] = useState("");
  const options = useMemo(() => ITEMS.filter((i) => i.maxStack > 0).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)), []);
  const shown = rows.filter((r) => !filter || String(r.name).toLowerCase().includes(filter.toLowerCase()) || String(r.item_id).includes(filter));
  const def = itemById(add);
  return (
    <Box title={`Инвентарь · ${rows.length}`} right={<input className="adm-in sm" placeholder="фильтр" value={filter} onChange={(e) => setFilter(e.target.value)} />}>
      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); if (def) edit({ op: "set_item", item: add, qty: Number(qty) }, def.name); }}>
        <select className="adm-in grow" value={add} onChange={(e) => setAdd(e.target.value)}>
          <option value="">выдать / задать предмет…</option>
          {options.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.category} · макс {i.maxStack}</option>)}
        </select>
        <input className="adm-in sm" type="number" min={0} max={def?.maxStack} value={qty} onChange={(e) => setQty(e.target.value)} />
        <button className="adm-btn" disabled={!def}>Задать количество</button>
      </form>
      <Table rows={shown} empty="Инвентарь пуст" cols={[
        ["Предмет", (r) => <><b>{String(r.name)}</b> <span className="muted tiny">{String(r.item_id)}</span></>],
        ["Тип", (r) => String(r.category)],
        ["Кол-во", (r) => <QtyCell r={r} edit={edit} />, "r"],
        ["Откуда", (r) => <span className="muted small">{String(r.source ?? "")}</span>],
      ]} />
    </Box>
  );
}
function QtyCell({ r, edit }: { r: Row; edit: EditFn }) {
  const [v, setV] = useState(String(r.qty));
  useEffect(() => setV(String(r.qty)), [r.qty]);
  const changed = v !== String(r.qty) && v !== "";
  return (
    <form className="adm-qty" onSubmit={(e) => { e.preventDefault(); if (changed) edit({ op: "set_item", item: r.item_id, qty: Number(v) }, String(r.name)); }}>
      <input className="adm-in sm" type="number" min={0} value={v} onChange={(e) => setV(e.target.value)} />
      {changed && <button className="adm-btn sm">✓</button>}
    </form>
  );
}

function Talents({ rows, edit }: { rows: Row[]; edit: EditFn }) {
  const level = (w: string, b: string) => num(rows.find((r) => r.weapon_id === w && r.branch === b)?.level);
  return (
    <Box title="Ветки талантов">
      <Table rows={TALENT_WEAPONS.map((w) => ({ id: w }))} cols={[
        ["Оружие", (r) => itemById(String(r.id))?.name ?? String(r.id)],
        ...TALENT_NODE_IDS.map((id, k) => [talentTree("fist")[k].name, (r: Row) => {
          const b = talentTree(String(r.id))[k];
          return (
            <select className="adm-in sm" value={level(String(r.id), id)} onChange={(e) => edit({ op: "set_talent", weapon: r.id, branch: id, level: Number(e.target.value) }, `${itemById(String(r.id))?.name}: ${b.name}`)}>
              {Array.from({ length: b.max + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
            </select>
          );
        }, "r"] as [string, (r: Row) => ReactNode, string]),
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
      <Box title="События" right={<span className="row" style={{ gap: 8 }}><button className="adm-btn ghost sm" onClick={reload}>Обновить</button><button className="adm-btn" onClick={() => { setSaveErr(null); setForm(emptyEvent()); }}>+ Новое событие</button></span>}>
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
      <BossControls rows={data ?? []} onSaved={setData} />
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
    <Box title="Боссы">
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
