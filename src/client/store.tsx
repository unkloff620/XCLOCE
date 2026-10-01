"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, login, type ActionResponse, type FeedItem, type GameState, type TokenPublic } from "./api.ts";
import { haptic, initTelegram } from "./telegram.ts";
import { bossMarketCap } from "../shared/economy.ts";

export type Tab = "home" | "market" | "boss" | "bag" | "top";
export interface Toast { id: number; kind: "ok" | "err" | "info" | "dmg"; text: string }
export interface Celebration { index: number; name: string; rewardUsd: number; rewardXp: number; rewardItem: string | null; personalDamage: number }
export interface DamagePop { id: number; amount: number; crit: boolean; mine: boolean }

interface Ctx {
  status: "loading" | "ready" | "error";
  error: string | null;
  mode: "telegram" | "guest" | null;
  game: GameState | null;
  market: TokenPublic[];
  feed: FeedItem[];
  globalLive: number;
  live: boolean;
  tab: Tab;
  setTab: (t: Tab) => void;
  tokenId: string | null;
  openToken: (id: string | null) => void;
  sheet: "exchange" | "bosses" | null;
  openSheet: (s: "exchange" | "bosses" | null) => void;
  toasts: Toast[];
  toast: (kind: Toast["kind"], text: string) => void;
  celebrations: Celebration[];
  dismissCelebration: () => void;
  pops: DamagePop[];
  busy: string | null;
  run: <R>(key: string, fn: () => Promise<ActionResponse<R>>, onOk?: (r: R) => void) => Promise<R | null>;
  refresh: () => Promise<void>;
  refreshMarket: () => Promise<void>;
  predictedBoss: { index: number; remaining: number; marketCap: number; incoming: number } | null;
  energyNow: number;
  retry: () => void;
}

const GameCtx = createContext<Ctx | null>(null);
export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error("useGame outside provider");
  return c;
}

let toastSeq = 1;

export function GameProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Ctx["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Ctx["mode"]>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [market, setMarket] = useState<TokenPublic[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [globalLive, setGlobalLive] = useState(0);
  const [live, setLive] = useState(false);
  const [tab, setTabState] = useState<Tab>("home");
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Ctx["sheet"]>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const [pops, setPops] = useState<DamagePop[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const gameRef = useRef<GameState | null>(null);
  const lastGlobal = useRef(0);
  const ownDamage = useRef<number[]>([]);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabRef = useRef<Tab>("home");
  const tokenRef = useRef<string | null>(null);
  const [retryN, setRetryN] = useState(0);
  const dismissed = useRef<Set<number>>(new Set());

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 4200 : 2800);
  }, []);

  const applyState = useCallback((s: GameState) => {
    gameRef.current = s;
    setGame(s);
    setGlobalLive((g) => Math.max(g, s.globalTotal));
    if (s.unseenDefeats.length) {
      setCelebrations((c) => {
        const known = new Set(c.map((x) => x.index));
        return [...c, ...s.unseenDefeats.filter((d) => !known.has(d.index) && !dismissed.current.has(d.index))];
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    const r = await api.me();
    applyState(r.state);
  }, [applyState]);

  const refreshMarket = useCallback(async () => {
    try {
      const r = await api.market();
      setMarket(r.tokens);
    } catch {
      /* keep stale market */
    }
  }, []);

  // ---- boot ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        initTelegram();
        setStatus("loading");
        const m = await login();
        if (cancelled) return;
        setMode(m);
        const [me] = await Promise.all([api.me(), refreshMarket()]);
        if (cancelled) return;
        applyState(me.state);
        lastGlobal.current = me.state.globalTotal;
        setStatus("ready");
        api.feed().then((f) => setFeed(f.items.slice(-40))).catch(() => undefined);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Не удалось загрузить игру");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyState, refreshMarket, retryN]);

  // ---- clock for energy / timers ----
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- realtime (SSE) ----
  const scheduleSync = useCallback(
    (delay = 1200) => {
      if (syncTimer.current) return;
      syncTimer.current = setTimeout(() => {
        syncTimer.current = null;
        refresh().catch(() => undefined);
      }, delay);
    },
    [refresh],
  );

  useEffect(() => {
    if (status !== "ready") return;
    let es: EventSource | null = null;
    let fails = 0;
    let poll: ReturnType<typeof setInterval> | null = null;
    let lastFeedId = 0;
    let lastMarketRefresh = 0;

    const onGlobal = (total: number) => {
      const prev = lastGlobal.current;
      lastGlobal.current = Math.max(prev, total);
      setGlobalLive((g) => Math.max(g, total));
      const delta = total - prev;
      if (prev > 0 && delta > 0.009) {
        // Distinguish our own sell (already shown) from other players' global damage.
        const idx = ownDamage.current.findIndex((d) => Math.abs(d - delta) < 0.02);
        const mine = idx >= 0;
        if (mine) ownDamage.current.splice(idx, 1);
        if (!mine) {
          const id = toastSeq++;
          setPops((p) => [...p.slice(-6), { id, amount: delta, crit: false, mine: false }]);
          setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1600);
        }
        const g = gameRef.current;
        if (g && g.boss.remaining - (lastGlobal.current - g.globalTotal) <= 0) scheduleSync(600);
      }
    };
    const onFeed = (items: FeedItem[]) => {
      if (!items.length) return;
      lastFeedId = Math.max(lastFeedId, items[items.length - 1].id);
      setFeed((f) => {
        const known = new Set(f.map((x) => x.id));
        return [...f, ...items.filter((x) => !known.has(x.id))].slice(-60);
      });
    };
    const onMarket = () => {
      if (Date.now() - lastMarketRefresh < 9_000) return;
      if (tabRef.current === "market" || tokenRef.current || tabRef.current === "home") {
        lastMarketRefresh = Date.now();
        refreshMarket();
      }
    };

    const startPolling = () => {
      if (poll) return;
      setLive(false);
      poll = setInterval(async () => {
        try {
          const f = await api.feed();
          onGlobal(f.globalTotal);
          onFeed(f.items.filter((x) => x.id > lastFeedId));
          onMarket();
        } catch {
          /* offline */
        }
      }, 8_000);
    };

    const connect = () => {
      if (typeof EventSource === "undefined") return startPolling();
      es = new EventSource(`/api/stream${lastFeedId ? `?after=${lastFeedId}` : ""}`);
      es.addEventListener("open", () => {
        fails = 0;
        setLive(true);
      });
      es.addEventListener("global", (ev) => onGlobal(JSON.parse((ev as MessageEvent).data).total));
      es.addEventListener("feed", (ev) => onFeed(JSON.parse((ev as MessageEvent).data)));
      es.addEventListener("market", onMarket);
      es.addEventListener("error", () => {
        fails += 1;
        setLive(false);
        if (fails >= 4) {
          es?.close();
          startPolling();
        }
      });
    };
    connect();
    const meTimer = setInterval(() => refresh().catch(() => undefined), 60_000);
    return () => {
      es?.close();
      if (poll) clearInterval(poll);
      clearInterval(meTimer);
    };
  }, [status, refresh, refreshMarket, scheduleSync]);

  const setTab = useCallback((t: Tab) => {
    haptic.select();
    tabRef.current = t;
    tokenRef.current = null;
    setTokenId(null);
    setTabState(t);
    if (t === "market") refreshMarket();
    if (t === "boss" && gameRef.current && gameRef.current.player.tutorialStep === 5) {
      api.tutorial("boss_opened").then((r) => applyState(r.state)).catch(() => undefined);
    }
  }, [refreshMarket, applyState]);

  const openToken = useCallback((id: string | null) => {
    tokenRef.current = id;
    setTokenId(id);
    if (id) haptic.tap();
  }, []);

  const run = useCallback(
    async <R,>(key: string, fn: () => Promise<ActionResponse<R>>, onOk?: (r: R) => void): Promise<R | null> => {
      setBusy(key);
      try {
        const r = await fn();
        applyState(r.state);
        const res = r.result as unknown as { damage?: { amount: number; crit: boolean } };
        if (res?.damage?.amount) {
          ownDamage.current.push(res.damage.amount);
          const id = toastSeq++;
          setPops((p) => [...p.slice(-6), { id, amount: res.damage!.amount, crit: res.damage!.crit, mine: true }]);
          setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1800);
          if (res.damage.crit) haptic.hit();
          lastGlobal.current = Math.max(lastGlobal.current, r.state.globalTotal);
        }
        onOk?.(r.result);
        return r.result;
      } catch (e) {
        haptic.err();
        toast("err", e instanceof ApiError ? e.message : "Не получилось. Попробуйте ещё раз");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [applyState, toast],
  );

  const dismissCelebration = useCallback(() => {
    setCelebrations((c) => {
      if (c[0]) dismissed.current.add(c[0].index);
      const rest = c.slice(1);
      if (!rest.length) api.tutorial("boss_opened").then((r) => applyState(r.state)).catch(() => undefined);
      return rest;
    });
  }, [applyState]);

  const predictedBoss = useMemo(() => {
    if (!game) return null;
    let incoming = Math.max(0, globalLive - game.globalTotal);
    let index = game.boss.index;
    let remaining = game.boss.remaining;
    let marketCap = game.boss.marketCap;
    // Walk the chain client-side for display; the server confirms on the next sync.
    let guard = 0;
    let left = incoming;
    while (left > 0 && guard++ < 50) {
      if (left < remaining) {
        remaining -= left;
        left = 0;
      } else {
        left -= remaining;
        index += 1;
        marketCap = bossMarketCap(index);
        remaining = marketCap;
      }
    }
    return { index, remaining, marketCap, incoming };
  }, [game, globalLive]);

  const energyNow = useMemo(() => {
    if (!game) return 0;
    const p = game.player;
    return Math.min(p.maxEnergy, p.energy + Math.max(0, now - game.serverTime) / p.energyRegenMs);
  }, [game, now]);

  const value: Ctx = {
    status, error, mode, game, market, feed, globalLive, live, tab, setTab, tokenId, openToken, sheet, openSheet: setSheet,
    toasts, toast, celebrations, dismissCelebration, pops, busy, run, refresh,
    refreshMarket, predictedBoss, energyNow, retry: () => setRetryN((n) => n + 1),
  };
  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}
