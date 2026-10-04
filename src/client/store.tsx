"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, authenticate, type AuthResult, type GameState } from "./api.ts";
import { haptic, initTelegram } from "./telegram.ts";

type Toast = { id: number; text: ReactNode; kind: "ok" | "err" | "info" };
interface Game {
  state: GameState | null;
  auth: "loading" | "ok" | "login" | "error";
  authInfo: AuthResult | null;
  error: string | null;
  /** server time offset: Date.now() + skew ≈ server now */
  skew: number;
  refresh: () => Promise<void>;
  act: <T = unknown>(type: string, body?: Record<string, unknown>, ok?: string | ((r: T) => string | null)) => Promise<T | null>;
  busy: string | null;
  toast: (text: ReactNode, kind?: Toast["kind"]) => void;
  setState: (s: GameState) => void;
  retryAuth: () => void;
}

const Ctx = createContext<Game | null>(null);
const NowCtx = createContext<number>(0);

export function useGame(): Game {
  const g = useContext(Ctx);
  if (!g) throw new Error("GameProvider missing");
  return g;
}
/** Current (server-aligned) time, ticking once a second. */
export function useNow(): number {
  return useContext(NowCtx);
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<GameState | null>(null);
  const [auth, setAuth] = useState<Game["auth"]>("loading");
  const [authInfo, setAuthInfo] = useState<AuthResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const tid = useRef(0);
  const [authTry, setAuthTry] = useState(0);

  const setState = useCallback((s: GameState) => {
    setStateRaw(s);
    setSkew(s.now - Date.now());
  }, []);

  const toast = useCallback((text: ReactNode, kind: Toast["kind"] = "info") => {
    const id = ++tid.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 3600 : 2400);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await api.get<GameState>("/api/state"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuth("login");
    }
  }, [setState]);

  const act = useCallback(
    async <T,>(type: string, body: Record<string, unknown> = {}, ok?: string | ((r: T) => string | null)): Promise<T | null> => {
      setBusy(type);
      try {
        const r = await api.action<T>(type, body);
        setState(r.state);
        const msg = typeof ok === "function" ? ok(r.result) : ok;
        if (msg) toast(msg, "ok");
        return r.result;
      } catch (e) {
        haptic.err();
        toast(e instanceof Error ? e.message : "Ошибка", "err");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [setState, toast],
  );

  // auth + first state
  useEffect(() => {
    initTelegram();
    let alive = true;
    (async () => {
      try {
        const a = await authenticate();
        if (!alive) return;
        setAuthInfo(a);
        if (!a.ok) return setAuth("login");
        setState(await api.get<GameState>("/api/state"));
        setAuth("ok");
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Не удалось подключиться");
        setAuth("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [authTry, setState]);

  // clock + background refresh (15 s while the tab is visible)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (auth !== "ok") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [auth, refresh]);

  const value = useMemo<Game>(
    () => ({ state, auth, authInfo, error, skew, refresh, act, busy, toast, setState, retryAuth: () => setAuthTry((n) => n + 1) }),
    [state, auth, authInfo, error, skew, refresh, act, busy, toast, setState],
  );
  return (
    <Ctx.Provider value={value}>
      <NowCtx.Provider value={now + skew}>
        {children}
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
          ))}
        </div>
      </NowCtx.Provider>
    </Ctx.Provider>
  );
}

/** Energy shown between server polls: regen is replayed locally from the last state. */
export function liveEnergy(s: GameState, now: number): { energy: number; nextIn: number } {
  const p = s.player;
  if (p.energy >= p.energyMax || p.energyNextIn <= 0) return { energy: p.energy, nextIn: 0 };
  const passed = now - s.now;
  if (passed < p.energyNextIn) return { energy: p.energy, nextIn: p.energyNextIn - passed };
  const extra = 1 + Math.floor((passed - p.energyNextIn) / p.energyPeriodMs);
  const e = Math.min(p.energyMax, p.energy + extra);
  if (e >= p.energyMax) return { energy: e, nextIn: 0 };
  return { energy: e, nextIn: p.energyPeriodMs - ((passed - p.energyNextIn) % p.energyPeriodMs) };
}

/** There is something to spend energy on right now (a task step is affordable) or a location reward waits. */
export function tasksReady(s: GameState | null, now: number): boolean {
  if (!s?.tasks) return false;
  if (s.tasks.claimable) return true;
  return s.tasks.minEnergy !== null && liveEnergy(s, now).energy >= s.tasks.minEnergy;
}

export function invQty(s: GameState | null, id: string): number {
  return s?.inventory.find((i) => i.id === id)?.qty ?? 0;
}
