"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { isMusicOn, isMuted, onSoundChange, setMuted, setMusic, sfx } from "./sound.ts";
import { liveEnergy, tasksReady, useGame, useNow } from "./store.tsx";
import { Icon, NAV_GLOW, NavIcon } from "./art/icons.tsx";
import { Avatar } from "./ui.tsx";
import { clock, full, moneyShort } from "./format.ts";
import { CURRENCIES } from "../content/currencies.ts";
import { TIPS, resourceLine } from "../content/loading.ts";
import { loginWidget } from "./api.ts";
import { telegramBack } from "./telegram.ts";
import { ResultWindow } from "./screens/result.tsx";
import { LevelUpOverlay } from "./levelup.tsx";
import { Tutorial } from "./tutorial.tsx";
import { RouteLoader, startRouteLoad } from "./route-loader.tsx";
import { PrizeWindow } from "./prizes.tsx";
import { TapTips } from "./tap-tips.tsx";
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

/** Two small switches under the energy: game sounds and the music. Remembered on this device. */
function SoundToggles() {
  const muted = useSyncExternalStore(onSoundChange, isMuted, () => false);
  const music = useSyncExternalStore(onSoundChange, isMusicOn, () => true);
  return (
    <div className="hud-toggles">
      <button type="button" data-nosfx className={`hud-tog ${muted ? "off" : ""}`} aria-pressed={!muted} aria-label={muted ? "Включить звуки" : "Выключить звуки"} title={muted ? "Звуки выключены" : "Звуки"}
        onClick={() => {
          setMuted(!muted);
          if (muted) sfx("coin");
        }}>
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {muted ? <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />}
        </svg>
      </button>
      <button type="button" data-nosfx className={`hud-tog ${music ? "" : "off"}`} aria-pressed={music} aria-label={music ? "Выключить музыку" : "Включить музыку"} title={music ? "Музыка" : "Музыка выключена"}
        onClick={() => setMusic(!music)}>
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d="M9 17.5V6l11-2.5v11.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
          <ellipse cx="6.5" cy="17.5" rx="3" ry="2.4" fill="currentColor" />
          <ellipse cx="17.5" cy="15" rx="3" ry="2.4" fill="currentColor" />
          {!music && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
        </svg>
      </button>
    </div>
  );
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
          {state.achievementsReady > 0 && <i className="side-dot hud-dot" title="Есть награда за достижение" />}
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
        <div className="hud-right">
          <button className={`energy-chip ${e.energy > p.energyMax ? "over" : ""}`} aria-label="Энергия" onClick={() => setEnergyOpen(true)}>
            <Icon name="energy" size={24} />
            <span>
              <b className="num">{e.energy}</b><span className="muted"> / {p.energyMax}</span>
              <small className="num">{e.nextIn > 0 ? `+1 через ${clock(e.nextIn)}` : e.energy > p.energyMax ? "сверх лимита" : "полная"}</small>
            </span>
          </button>
          <SoundToggles />
        </div>
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

/**
 * One step up inside a section (null = already at its start): the bottom tab of the open section works as "back",
 * e.g. Двор → Локации → Опенспейс, then the Двор tab: → Локации → Двор.
 */
export function parentOf(path: string, search: string, myClan: number | null): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "locations") return parts.length > 1 ? "/locations" : "/yard";
  if (parts[0] === "shop" || parts[0] === "exchange") return "/yard";
  if (parts[0] === "bosses" && parts.length > 1) return "/bosses";
  if (parts[0] === "profile" || parts[0] === "rating") return "/";
  if (parts[0] === "clans") {
    if (parts.length > 1) return Number(parts[1]) === myClan ? null : myClan ? "/clans?all=1" : "/clans";
    return myClan && search.includes("all") ? `/clans/${myClan}` : null;
  }
  return null;
}

function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { state } = useGame();
  const on = activeTab(path);
  const now = useNow();
  const taskHint = tasksReady(state, now);
  const myClan = state?.clan?.id ?? null;
  return (
    <nav className="nav">
      {TABS.map((t) => (
        // a member's Clans tab leads straight to the own clan (no flash of the clan list)
        <Link key={t.id} href={t.id === "clans" && myClan ? `/clans/${myClan}` : t.href} className={on === t.id ? "on" : ""} style={{ ["--glow" as string]: NAV_GLOW[t.id] }} aria-label={t.label} title={t.label}
          onClick={(e) => {
            window.scrollTo({ top: 0 });
            if (on !== t.id) return;
            // the tab of the open section: one step back inside it
            const up = parentOf(path, window.location.search, myClan);
            e.preventDefault();
            if (up) {
              startRouteLoad();
              router.push(up);
            }
          }}>
          <NavIcon id={t.id} />
          {t.id === "yard" && !!state?.yard.count && <span className="badge">{state.yard.count}</span>}
          {t.id === "yard" && !state?.yard.count && taskHint && <span className="badge" style={{ background: "var(--gold)", color: "#2e1c00" }}>!</span>}
          {t.id === "bosses" && state?.fight && <span className="badge" style={{ background: "var(--gold)", color: "#2e1c00" }}>!</span>}
        </Link>
      ))}
    </nav>
  );
}

let entryTip: string | undefined;

export interface LoadProgress { n: number; total: number; url: string | null }

/**
 * Loading screen: the XClose logo, a ring with [loaded/total] in the middle, a joke about what is downloading now
 * and one game tip (picked at random each time the game opens).
 * Without `prog` (connecting to the server) the ring just spins.
 */
function Loading({ prog, overlay }: { prog?: LoadProgress; overlay?: boolean }) {
  // random picks happen after mount: a random value during server rendering would not match the client (hydration error)
  const [tip, setTip] = useState<string | null>(null);
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    // one tip per game entry: the connecting screen, the art download and section loads all show the same one
    entryTip ??= TIPS[Math.floor(Math.random() * TIPS.length)];
    setTip(entryTip);
    setSeed(Math.floor(Math.random() * 1000));
  }, []);
  // the joke changes at most every 0.9 s, otherwise it flickers faster than anyone can read
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const lastSwap = useRef(0);
  const url = prog?.url ?? null;
  useEffect(() => {
    if (!url || url === shownUrl) return;
    const wait = Math.max(0, 900 - (Date.now() - lastSwap.current));
    const t = setTimeout(() => {
      lastSwap.current = Date.now();
      setShownUrl(url);
    }, wait);
    return () => clearTimeout(t);
  }, [url, shownUrl]);
  const frac = prog ? (prog.total ? prog.n / prog.total : 1) : null;
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className={`loading boot ${overlay ? "overlay" : ""}`}>
      <div className="boot-box">
        <div className="boot-logo display" aria-label="XClose"><span className="x">X</span>Close</div>
        <div className={`boot-ring${frac === null ? " spin" : ""}`} role="progressbar" aria-label="Загрузка" aria-valuemin={0} aria-valuemax={prog?.total ?? 100} aria-valuenow={prog?.n}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="track" cx="60" cy="60" r={R} />
            <circle className="arc" cx="60" cy="60" r={R} strokeDasharray={C} strokeDashoffset={frac === null ? C * 0.72 : C * (1 - frac)} />
          </svg>
          <b className="num">{prog ? `[${prog.n}/${prog.total}]` : "[…]"}</b>
        </div>
        <div className="boot-what">{prog ? resourceLine(shownUrl, seed + (shownUrl?.length ?? 0)) : "Стучимся на сервер…"}</div>
        {tip && (
          <div className="boot-tip">
            <b>Подсказка</b>
            <span>{tip}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** First entry: every picture of the game is downloaded before it shows (only the player's own hero variants). */
function useArtReady(look: LookLite | null, active: boolean) {
  const [prog, setProg] = useState<LoadProgress>({ n: 0, total: 0, url: null });
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    void preload(urlsFor("all", look), (n, total, url) => setProg((p) => ({ n, total, url: url ?? p.url }))).then(() => setReady(true));
  }, [active, look]);
  return { ready, prog };
}

/** A section (yard, shop, bosses…) opens only when its pictures are downloaded; until then a loading screen covers it. */
function SectionGate({ route, look, children }: { route: string; look: LookLite | null; children: ReactNode }) {
  const section = sectionOfRoute(route);
  const urls = section ? urlsFor([section], look) : []; // hero and icons (core) were loaded on entry
  const ok = isLoaded(urls);
  const [prog, setProg] = useState<LoadProgress>({ n: 0, total: 0, url: null });
  const [, setTick] = useState(0);
  const key = urls.join("|");
  useEffect(() => {
    if (ok) return;
    let alive = true;
    setProg({ n: 0, total: urls.length, url: null });
    void preload(urls, (n, total, url) => alive && setProg((p) => ({ n, total, url: url ?? p.url }))).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (ok) return <>{children}</>;
  return <Loading overlay prog={prog} />;
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
        <div className="logo display" style={{ fontSize: 34 }}>XCLOSE</div>
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
  const deep = path.split("/").filter(Boolean).length > 1 || ["/locations", "/shop", "/profile", "/rating"].includes(path);
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
        {auth === "ok" && state && !art.ready && <Loading prog={art.prog} />}
        {auth === "ok" && state && art.ready && (
          <>
            <Hud />
            <main className="main"><SectionGate route={path} look={look}>{children}</SectionGate></main>
            <Nav />
            <ResultWindow />
            <Tutorial />
            <PrizeWindow />
            <LevelUpOverlay />
            <RouteLoader />
            <TapTips />
          </>
        )}
      </div>
    </>
  );
}

