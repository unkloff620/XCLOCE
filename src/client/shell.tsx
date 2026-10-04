"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { liveEnergy, tasksReady, useGame, useNow } from "./store.tsx";
import { Icon, NAV_GLOW, NavIcon } from "./art/icons.tsx";
import { Avatar } from "./ui.tsx";
import { clock, full, moneyShort } from "./format.ts";
import { CURRENCIES } from "../content/currencies.ts";
import { LOADING_LINES } from "../content/phrases.ts";
import { loginWidget } from "./api.ts";
import { telegramBack } from "./telegram.ts";
import { ResultWindow } from "./screens/result.tsx";
import { LevelUpOverlay } from "./levelup.tsx";
import { Tutorial } from "./tutorial.tsx";
import { EnergyWindow } from "./screens/energy.tsx";
import { NAV_TABS } from "../content/nav.ts";
import { isLoaded, preload, sectionOfRoute, urlsFor, type LookLite } from "./preload.ts";

const TABS = NAV_TABS;

function activeTab(path: string): string {
  if (path.startsWith("/bosses")) return "bosses";
  if (["/yard", "/shop", "/exchange", "/locations"].some((p) => path.startsWith(p))) return "yard"; // places opened from the yard
  if (path.startsWith("/inventory")) return "inventory";
  if (path.startsWith("/clans")) return "clans";
  return "home";
}

function Hud() {
  const { state } = useGame();
  const now = useNow();
  const [energyOpen, setEnergyOpen] = useState(false);
  if (!state) return null;
  const p = state.player;
  const e = liveEnergy(state, now);
  return (
    <>
    <header className="hud">
      <div className="hud-top">
        <Link href="/profile" className="hud-me" aria-label="Профиль">
          <Avatar name={p.name} photo={p.photo} size={38} />
          <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div className="row" style={{ gap: 6 }}>
              <span className="lvl">LVL {p.level}</span>
              <span className="name ellipsis">{p.name}</span>
            </div>
            {/* progress to the next level; exact numbers are in the profile */}
            <div className="xpbar" title="Прогресс уровня"><i style={{ width: `${p.levelNeed ? (p.levelXp / p.levelNeed) * 100 : 100}%` }} /></div>
            <div className="row hud-xp" title="Авторитет">
              <Icon name="xp" size={16} />
              <b className="num">{full(p.xp)}</b>
            </div>
          </div>
        </Link>
        <button className={`energy-chip ${e.energy > p.energyMax ? "over" : ""}`} aria-label="Энергия" onClick={() => setEnergyOpen(true)}>
          <Icon name="energy" size={24} />
          <span>
            <b className="num">{e.energy}</b><span className="muted"> / {p.energyMax}</span>
            <small className="num">{e.nextIn > 0 ? `+1 через ${clock(e.nextIn)}` : e.energy > p.energyMax ? "сверх лимита" : "полная"}</small>
          </span>
        </button>
      </div>
      <div className="hud-money">
        {CURRENCIES.map((c) => (
          <Link key={c} href="/exchange" className="coin-chip" title={`${c} — обменник`}>
            <Icon name={c} size={20} />
            <b className="num">{moneyShort(c, state.wallet[c] ?? 0)}</b>
          </Link>
        ))}
      </div>
    </header>
    {energyOpen && <EnergyWindow onClose={() => setEnergyOpen(false)} />}
    </>
  );
}

function Nav() {
  const path = usePathname();
  const { state } = useGame();
  const on = activeTab(path);
  const now = useNow();
  const taskHint = tasksReady(state, now);
  return (
    <nav className="nav">
      {TABS.map((t) => (
        <Link key={t.id} href={t.href} className={on === t.id ? "on" : ""} style={{ ["--glow" as string]: NAV_GLOW[t.id] }} aria-label={t.label} title={t.label} onClick={() => window.scrollTo({ top: 0 })}>
          <NavIcon id={t.id} />
          {t.id === "yard" && !!state?.yard.count && <span className="badge">{state.yard.count}</span>}
          {t.id === "yard" && !state?.yard.count && taskHint && <span className="badge" style={{ background: "var(--gold)", color: "#2e1c00" }}>!</span>}
          {t.id === "bosses" && state?.fight && <span className="badge" style={{ background: "var(--gold)", color: "#2e1c00" }}>!</span>}
        </Link>
      ))}
    </nav>
  );
}

function Loading({ text, progress, overlay }: { text?: string; progress?: number; overlay?: boolean }) {
  // picked after mount: a random line during server rendering would not match the client (hydration error)
  const [line, setLine] = useState(LOADING_LINES[0]);
  useEffect(() => setLine(LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]), []);
  return (
    <div className={`loading ${overlay ? "overlay" : ""}`}>
      <div>
        <div className="logo display">XCLOCE</div>
        {progress === undefined ? (
          <div className="spinner" />
        ) : (
          <div className="load-bar" aria-label="Загрузка"><i style={{ width: `${Math.round(progress * 100)}%` }} /><b className="num">{Math.round(progress * 100)}%</b></div>
        )}
        <div className="muted">{text ?? line}</div>
      </div>
    </div>
  );
}

/** First entry: every picture of the game is downloaded before it shows (only the player's own hero variants). */
function useArtReady(look: LookLite | null, active: boolean) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    void preload(urlsFor("all", look), (n, total) => setProgress(total ? n / total : 1)).then(() => setReady(true));
  }, [active, look]);
  return { ready, progress };
}

/** A section (yard, shop, bosses…) opens only when its pictures are downloaded; until then a loading screen covers it. */
function SectionGate({ route, look, children }: { route: string; look: LookLite | null; children: ReactNode }) {
  const section = sectionOfRoute(route);
  const urls = section ? urlsFor([section], look) : []; // hero and icons (core) were loaded on entry
  const ok = isLoaded(urls);
  const [progress, setProgress] = useState(0);
  const [, setTick] = useState(0);
  const key = urls.join("|");
  useEffect(() => {
    if (ok) return;
    let alive = true;
    setProgress(0);
    void preload(urls, (n, total) => alive && setProgress(total ? n / total : 1)).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (ok) return <>{children}</>;
  return <Loading overlay progress={progress} text="Загружаем локацию…" />;
}

/** Desktop browser in production: Telegram Login Widget. */
function Login({ bot }: { bot: string | null }) {
  const { retryAuth } = useGame();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bot || !box.current) return;
    (window as unknown as { onTgAuth: (u: Record<string, unknown>) => void }).onTgAuth = async (u) => {
      await loginWidget(u);
      retryAuth();
    };
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "12");
    s.setAttribute("data-onauth", "onTgAuth(user)");
    s.setAttribute("data-request-access", "write");
    box.current.appendChild(s);
  }, [bot, retryAuth]);
  return (
    <div className="loading">
      <div className="panel" style={{ maxWidth: 360, padding: 22 }}>
        <div className="logo display" style={{ fontSize: 34 }}>XCLOCE</div>
        <p>Игра для сотрудников. Войди через Telegram — аккаунт тот же, что и в мини-приложении.</p>
        <div ref={box} style={{ display: "grid", placeItems: "center", minHeight: 50 }} />
        {!bot && <p className="muted small">Вход через браузер не настроен. Открой игру в Telegram.</p>}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { auth, authInfo, error, state, retryAuth } = useGame();
  const path = usePathname();
  const router = useRouter();
  const deep = path.split("/").filter(Boolean).length > 1 || ["/locations", "/shop", "/profile"].includes(path);
  useEffect(() => telegramBack(deep, () => router.back()), [deep, router]);
  const body = state?.look.body;
  const look = useMemo<LookLite | null>(() => (body ? { hair: body.hair, hairColor: body.hairColor, skin: body.skin } : null), [body?.hair, body?.hairColor, body?.skin]); // eslint-disable-line react-hooks/exhaustive-deps
  const art = useArtReady(look, auth === "ok" && !!state);

  return (
    <>
      <div className="backdrop" />
      <div className="shell">
        {auth === "loading" && <Loading />}
        {auth === "login" && <Login bot={authInfo && !authInfo.ok ? authInfo.bot : null} />}
        {auth === "error" && (
          <div className="loading">
            <div className="panel" style={{ maxWidth: 340 }}>
              <p>{error ?? "Не удалось подключиться"}</p>
              <button className="btn green block" onClick={retryAuth}>Ещё раз</button>
            </div>
          </div>
        )}
        {auth === "ok" && state && !art.ready && <Loading progress={art.progress} text="Загружаем картинки…" />}
        {auth === "ok" && state && art.ready && (
          <>
            <Hud />
            <main className="main"><SectionGate route={path} look={look}>{children}</SectionGate></main>
            <Nav />
            <ResultWindow />
            <Tutorial />
            <LevelUpOverlay />
          </>
        )}
      </div>
    </>
  );
}

