"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { liveEnergy, useGame, useNow } from "./store.tsx";
import { Icon, NAV_GLOW, NavIcon } from "./art/icons.tsx";
import { Avatar } from "./ui.tsx";
import { clock, moneyShort } from "./format.ts";
import { CURRENCIES } from "../content/currencies.ts";
import { LOADING_LINES } from "../content/phrases.ts";
import { loginWidget } from "./api.ts";
import { telegramBack } from "./telegram.ts";
import { ResultWindow } from "./screens/result.tsx";

const TABS = [
  { id: "home", href: "/", label: "Дом" },
  { id: "bosses", href: "/bosses", label: "Боссы" },
  { id: "yard", href: "/yard", label: "Двор" },
  { id: "inventory", href: "/inventory", label: "Инвентарь" },
  { id: "clans", href: "/clans", label: "Кланы" },
] as const;

function activeTab(path: string): string {
  if (path.startsWith("/bosses")) return "bosses";
  if (path.startsWith("/yard")) return "yard";
  if (path.startsWith("/inventory")) return "inventory";
  if (path.startsWith("/clans")) return "clans";
  return "home";
}

function Hud() {
  const { state } = useGame();
  const now = useNow();
  if (!state) return null;
  const p = state.player;
  const e = liveEnergy(state, now);
  return (
    <header className="hud">
      <div className="hud-top">
        <Link href="/profile" className="hud-me" aria-label="Профиль">
          <Avatar name={p.name} photo={p.photo} size={38} />
          <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div className="row" style={{ gap: 6 }}>
              <span className="lvl">LVL {p.level}</span>
              <span className="name ellipsis">{p.name}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <div className="xpbar grow"><i style={{ width: `${p.levelNeed ? (p.levelXp / p.levelNeed) * 100 : 100}%` }} /></div>
              <span className="tiny muted num">{p.levelXp} / {p.levelNeed} XP</span>
            </div>
          </div>
        </Link>
        <Link href="/locations" className={`energy-chip ${e.energy > p.energyMax ? "over" : ""}`} aria-label="Энергия">
          <Icon name="energy" size={24} />
          <span>
            <b className="num">{e.energy}</b><span className="muted"> / {p.energyMax}</span>
            <small className="num">{e.nextIn > 0 ? `+1 через ${clock(e.nextIn)}` : e.energy > p.energyMax ? "сверх лимита" : "полная"}</small>
          </span>
        </Link>
      </div>
      <div className="hud-money">
        {CURRENCIES.map((c) => (
          <Link key={c} href="/shop?tab=exchange" className="coin-chip" title={c}>
            <Icon name={c} size={20} />
            <b className="num">{moneyShort(c, state.wallet[c] ?? 0)}</b>
          </Link>
        ))}
      </div>
    </header>
  );
}

function Nav() {
  const path = usePathname();
  const { state } = useGame();
  const on = activeTab(path);
  return (
    <nav className="nav">
      {TABS.map((t) => (
        <Link key={t.id} href={t.href} className={on === t.id ? "on" : ""} style={{ ["--glow" as string]: NAV_GLOW[t.id] }} onClick={() => window.scrollTo({ top: 0 })}>
          <NavIcon id={t.id} />
          {t.label}
          {t.id === "yard" && !!state?.yard.count && <span className="badge">{state.yard.count}</span>}
          {t.id === "bosses" && state?.fight && <span className="badge" style={{ background: "var(--gold)", color: "#2e1c00" }}>!</span>}
        </Link>
      ))}
    </nav>
  );
}

function Loading({ text }: { text?: string }) {
  // picked after mount: a random line during server rendering would not match the client (hydration error)
  const [line, setLine] = useState(LOADING_LINES[0]);
  useEffect(() => setLine(LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]), []);
  return (
    <div className="loading">
      <div>
        <div className="logo display">XCLOCE</div>
        <div className="spinner" />
        <div className="muted">{text ?? line}</div>
      </div>
    </div>
  );
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
        {auth === "ok" && state && (
          <>
            <Hud />
            <main className="main">{children}</main>
            <Nav />
            <ResultWindow />
          </>
        )}
      </div>
    </>
  );
}

