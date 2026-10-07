"use client";
import { tg } from "./telegram.ts";
import type { Currency } from "../content/currencies.ts";
import type { Reward } from "../content/rewards.ts";
import type { Look } from "../content/home.ts";
import type { WeaponTalents } from "../content/talents.ts";

/* ---------- types of what the server sends (kept loose on purpose: the server is the source of truth) ---------- */
export interface Granted {
  xp: number;
  currencies: Partial<Record<Currency, number>>;
  items: { id: string; qty: number; lost?: number }[];
  energy: number;
  levelUp?: { from: number; to: number };
  /** things a boss drop opened in the shop (to be bought there) */
  unlocks?: string[];
}
export interface GameState {
  now: number;
  player: {
    id: number; name: string; username: string | null; photo: string | null; telegram: boolean;
    xp: number; level: number; levelXp: number; levelNeed: number;
    energy: number; energyMax: number; energyNextIn: number; energyPeriodMs: number;
    talents: number;
    talentDamage: number;
  };
  weaponTalents: WeaponTalents;
  wallet: Record<Currency, number>;
  inventory: { id: string; qty: number }[];
  cooldowns: Record<string, number>;
  look: { equipped: Record<string, string>; room: string; body: Look };
  home: { levels: Record<string, number>; rooms: string[]; bonus: { critChance: number; critDamage: number; damage: number }; decor: Record<string, number>; trophies: string[] };
  helpSeen: string[];
  /** things a boss drop opened in the shop */
  unlocks?: string[];
  yard: { count: number; max: number; nextAt: number | null };
  /** cheapest task step left in an open location; claimable = a location reward is waiting */
  tasks: { minEnergy: number | null; claimable: boolean };
  fight: { id: number; bossId: string; hp: number; hpMax: number; endsAt: number; myDamage: number; solo?: boolean } | null;
  pending: { fightId: number; bossId: string; status: string }[];
  clan: { id: number; name: string; tag: string; emblem: string; color: string } | null;
  daily: { available: boolean; day: number; streak: number; cycle: number; nextAt: number | null; rewards: Reward[] };
  quests: {
    list: { id: string; progress: number; target: number; done: boolean; claimed: boolean }[];
    chest: { ready: boolean; opened: boolean; reward: Granted | null };
    claimable: boolean;
    resetAt: number;
  };
  /** Telegram reminders: on — the player's switch; blocked — the bot may not write to them yet */
  notify: { on: boolean; blocked: boolean; available: boolean };
  /** weekly rating prizes waiting to be collected */
  prizes: { id: number; title: string; reward: Reward }[];
  /** badges reached but not collected */
  achievementsReady: number;
  slots: { left: number; max: number; nextAt: number | null };
  rename: { price: { currency: Currency; amount: number }; nextAt: number | null; min: number; max: number };
  /** inventory sale prices in RUB */
  sell: Record<string, number>;
}
export interface Hit { seq: number; playerId: number; name: string; weapon: string; damage: number; phrase: number; at: number; crit?: boolean }
export interface FightView {
  fightId: number; bossId: string; hp: number; hpMax: number; status: "active" | "won" | "lost";
  startedAt: number; endsAt: number; myDamage: number; myHits: number; killer: string | null; killerIsMe: boolean;
  reward: Granted | null; claimed: boolean; lastSeq: number; hits: Hit[];
  top: { playerId: number; name: string; damage: number; hits: number }[]; fightingNow: number;
  /** «Соло»: only my own hits take this fight's HP */
  solo?: boolean;
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
