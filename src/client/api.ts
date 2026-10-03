"use client";
import { tg } from "./telegram.ts";
import type { Currency } from "../content/currencies.ts";
import type { Reward } from "../content/rewards.ts";

/* ---------- types of what the server sends (kept loose on purpose: the server is the source of truth) ---------- */
export interface Granted {
  xp: number;
  currencies: Partial<Record<Currency, number>>;
  items: { id: string; qty: number; lost?: number }[];
  energy: number;
  levelUp?: { from: number; to: number };
}
export interface GameState {
  now: number;
  player: {
    id: number; name: string; username: string | null; photo: string | null; telegram: boolean;
    xp: number; level: number; levelXp: number; levelNeed: number;
    energy: number; energyMax: number; energyNextIn: number; energyPeriodMs: number;
  };
  wallet: Record<Currency, number>;
  inventory: { id: string; qty: number }[];
  cooldowns: Record<string, number>;
  look: { equipped: Record<string, string>; room: string };
  yard: { count: number; max: number; nextAt: number | null };
  fight: { id: number; bossId: string; hp: number; hpMax: number; endsAt: number } | null;
  pending: { fightId: number; bossId: string; status: string }[];
  clan: { id: number; name: string; tag: string; emblem: string; color: string } | null;
  daily: { available: boolean; day: number; streak: number; cycle: number; nextAt: number | null; rewards: Reward[] };
}
export interface Hit { seq: number; playerId: number; name: string; weapon: string; damage: number; phrase: number; at: number }
export interface FightView {
  fightId: number; bossId: string; hp: number; hpMax: number; status: "active" | "won" | "lost";
  startedAt: number; endsAt: number; myDamage: number; myHits: number; killer: string | null; killerIsMe: boolean;
  reward: Granted | null; claimed: boolean; lastSeq: number; hits: Hit[];
  top: { playerId: number; name: string; damage: number; hits: number }[]; fightingNow: number;
}
export interface Tray { id: string; qty: number; readyAt: number | null }

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const TOKEN_KEY = "xc2_token";
const GUEST_KEY = "xc2_guest";
let token: string | null = null;

function store(k: string, v?: string | null): string | null {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage can be blocked */
  }
  return null;
}

async function raw<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { error?: { code: string; message: string } };
  if (!r.ok) throw new ApiError(j.error?.code ?? "http", j.error?.message ?? `Ошибка ${r.status}`, r.status);
  return j as T;
}

export type AuthResult = { ok: true; mode: string } | { ok: false; needLogin: true; bot: string | null };

/** Telegram Mini App → initData; desktop browser in production → Telegram Login Widget; elsewhere → guest. */
export async function authenticate(): Promise<AuthResult> {
  const w = tg();
  if (w) {
    const r = await raw<{ token: string; mode: string }>("/api/auth", { method: "POST", body: JSON.stringify({ initData: w.initData }) });
    token = r.token;
    store(TOKEN_KEY, r.token);
    return { ok: true, mode: r.mode };
  }
  const saved = store(TOKEN_KEY);
  if (saved) {
    token = saved;
    try {
      await raw("/api/state");
      return { ok: true, mode: "saved" };
    } catch {
      token = null;
      store(TOKEN_KEY, null);
    }
  }
  const cfg = await raw<{ guest: boolean; bot: string | null }>("/api/config");
  if (!cfg.guest) return { ok: false, needLogin: true, bot: cfg.bot };
  let gid = store(GUEST_KEY);
  if (!gid) {
    gid = crypto.randomUUID();
    store(GUEST_KEY, gid);
  }
  const r = await raw<{ token: string; mode: string }>("/api/auth", { method: "POST", body: JSON.stringify({ guestId: gid }) });
  token = r.token;
  store(TOKEN_KEY, r.token);
  return { ok: true, mode: r.mode };
}

export async function loginWidget(data: Record<string, unknown>) {
  const r = await raw<{ token: string }>("/api/auth", { method: "POST", body: JSON.stringify({ widget: data }) });
  token = r.token;
  store(TOKEN_KEY, r.token);
}

export const api = {
  get: <T>(path: string) => raw<T>(path),
  action: <T>(type: string, body: Record<string, unknown> = {}) =>
    raw<{ result: T; state: GameState }>("/api/action", { method: "POST", body: JSON.stringify({ type, ...body }) }),
};
