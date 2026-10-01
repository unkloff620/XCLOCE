"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, login, type ActionResponse, type GameState } from "./api.ts";
import { haptic, initTelegram } from "./telegram.ts";

export type Tab = "boss" | "market" | "home" | "inventory" | "social";
export type SheetName = "shop" | "daily" | "missions" | "events" | "upgrade" | "exchange" | "rooms" | "profile" | null;
export interface Toast { id: number; kind: "ok" | "err" | "info"; text: string }

interface Ctx {
  status: "loading" | "ready" | "error";
  error: string | null;
  mode: "telegram" | "guest" | null;
  game: GameState | null;
  tab: Tab;
  setTab: (t: Tab) => void;
  sheet: SheetName;
  openSheet: (s: SheetName) => void;
  itemSheet: string | null;
  openItem: (id: string | null) => void;
  fight: number | null;
  setFight: (bossIndex: number | null) => void;
  toasts: Toast[];
  toast: (kind: Toast["kind"], text: string) => void;
  applyState: (s: GameState) => void;
  refresh: () => Promise<void>;
  busy: string | null;
  act: <R>(type: string, payload?: Record<string, unknown>, okText?: string | ((r: R) => string)) => Promise<R | null>;
  energyNow: number;
  nextEnergyIn: number;
  now: number;
  retry: () => void;
}

const GameCtx = createContext<Ctx | null>(null);
export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error("useGame outside provider");
  return c;
}
let seq = 1;

export function GameProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Ctx["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Ctx["mode"]>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [tab, setTabState] = useState<Tab>("home");
  const [sheet, setSheet] = useState<SheetName>(null);
  const [itemSheet, setItemSheet] = useState<string | null>(null);
  const [fight, setFight] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [retryN, setRetryN] = useState(0);
  const offset = useRef(0); // server - client clock

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = seq++;
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 3800 : 2600);
  }, []);

  const apply = useCallback((s: GameState) => {
    offset.current = s.serverTime - Date.now();
    setGame(s);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        initTelegram();
        setStatus("loading");
        const m = await login();
        const me = await api.me();
        if (cancelled) return;
        setMode(m);
        apply(me.state);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Не удалось загрузить игру");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, retryN]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // periodic refresh (idle income, energy, daily resets)
  useEffect(() => {
    if (status !== "ready") return;
    const t = setInterval(() => api.me().then((r) => apply(r.state)).catch(() => undefined), 60_000);
    const onVis = () => document.visibilityState === "visible" && api.me().then((r) => apply(r.state)).catch(() => undefined);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status, apply]);

  const setTab = useCallback((t: Tab) => {
    haptic.select();
    setTabState(t);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  const act = useCallback(
    async <R,>(type: string, payload: Record<string, unknown> = {}, okText?: string | ((r: R) => string)): Promise<R | null> => {
      setBusy(type);
      try {
        const r: ActionResponse<R> = await api.action<R>(type, payload);
        apply(r.state);
        if (okText) {
          haptic.ok();
          toast("ok", typeof okText === "function" ? okText(r.result) : okText);
        }
        return r.result;
      } catch (e) {
        haptic.err();
        toast("err", e instanceof ApiError ? e.message : "Не получилось. Попробуйте ещё раз");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [apply, toast],
  );

  const { energyNow, nextEnergyIn } = useMemo(() => {
    if (!game) return { energyNow: 0, nextEnergyIn: 0 };
    const p = game.player;
    const serverNow = now + offset.current;
    if (p.energy >= p.maxEnergy) return { energyNow: p.energy, nextEnergyIn: 0 };
    const elapsed = Math.max(0, serverNow - p.energyUpdatedAt);
    const gained = Math.floor(elapsed / p.energyRegenMs);
    const e = Math.min(p.maxEnergy, p.energy + gained);
    return { energyNow: e, nextEnergyIn: e >= p.maxEnergy ? 0 : p.energyRegenMs - (elapsed % p.energyRegenMs) };
  }, [game, now]);

  const value: Ctx = {
    status, error, mode, game, tab, setTab, sheet, openSheet: setSheet, itemSheet, openItem: setItemSheet, fight, setFight,
    toasts, toast, applyState: apply, refresh: () => api.me().then((r) => apply(r.state)).catch(() => undefined), busy, act, energyNow, nextEnergyIn, now: now + offset.current, retry: () => setRetryN((n) => n + 1),
  };
  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}
