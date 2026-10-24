"use client";
import { APP_VERSION } from "../version.ts";
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
  /** achievement points (the sun) */
  achPoints?: number;
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
  home: { levels: Record<string, number>; pieces?: Record<string, number>; rooms: string[]; bonus: { critChance: number; critDamage: number; damage: number; energyMax?: number; fistDamage?: number }; decor: Record<string, number>; trophies: string[] };
  helpSeen: string[];
  /** things a boss drop opened in the shop */
  unlocks?: string[];
  yard: { count: number; max: number; nextAt: number | null };
  /** cheapest task step left in an open location; claimable = a location reward is waiting */
  tasks: { minEnergy: number | null; claimable: boolean };
  fight: { id: number; bossId: string; hp: number; hpMax: number; endsAt: number; myDamage: number; solo?: boolean } | null;
  pending: { fightId: number; bossId: string; status: string }[];
  clan: { id: number; name: string; tag: string; emblem: string; color: string } | null;
  /** my request to join a clan; waiting — requests to my clan (I am its leader) */
  clanRequests: { mine: { clanId: number; name: string; tag: string } | null; waiting: number };
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
  events?: import("../content/events.ts").GameEventView[];
  openBosses?: string[];
  /** yard mini games: free games left today, the price after that, the hand / game in progress */
  /** upgraded things from the upgrader: each one its own unit with its own price */
  upgraded: { uid: number; itemId: string; value: number }[];
  /** upgrader spins: free ones left today, then each costs `price` */
  upgradeSpins?: { freeLeft: number; freePerDay: number; price: { currency: Currency; amount: number } };
  /** poker: hands left today, the price, the poker experience and level (to: null at the top level) */
  poker?: PokerInfo;
  /** invitations to a blackjack table waiting for me */
  bjInvites?: number;
  /** how many times each set of stashes was collected (by set number) */
  stashSets: Record<number, number>;
  /** нычки I ask other players for, and who sent me what lately */
  stashWish?: string[];
  stashGifts?: { id: number; fromId: number; from: string; itemId: string; at: number }[];
  /** gifts waiting in «Сообщения» to be accepted */
  stashInbox?: { id: number; fromId: number; from: string; itemId: string; at: number }[];
  games: { zonk: ZonkInfo };
  rename: { price: { currency: Currency; amount: number }; nextAt: number | null; min: number; max: number };
  /** inventory sale prices in RUB */
  sell: Record<string, number>;
}
export interface BjCardV { r: number; s: number; n: number }
export interface BjHandV { cards: BjCardV[]; bet: number; doubled?: boolean; split?: boolean; done: boolean; outcome?: "blackjack" | "win" | "push" | "lose"; pay?: number; value: number; title: string | null }
export interface BjSeatV {
  pid: number; name: string; me: boolean; bet: number; pp: number; t3: number; free: boolean; ready: boolean; left: boolean;
  side: { pp: string | null; t3: string | null; pay: number } | null; won: number | null; staked: number | null; hands: BjHandV[];
}
export interface BjTableV {
  id: number; hostId: number; phase: "betting" | "playing"; round: number; settled: boolean; deadline: number | null; turn: { seat: number; hand: number } | null;
  dealer: BjCardV[]; dealerHidden: { n: number } | null; dealerValue: number; seats: (BjSeatV | null)[];
}
export interface BjView {
  table: BjTableV | null; seat: number | null; invites: { id: number; tableId: number; from: string }[];
  free: { left: number; perDay: number; bet: number }; clan: { id: number; name: string; busy: boolean; invited: boolean }[];
  moves?: { hit: boolean; stand: boolean; double: boolean; split: boolean }; now?: number;
}
export interface ZonkInfo {
  freeLeft: number; freePerDay: number; price: { currency: Currency; amount: number };
  levels: import("../content/games.ts").ZonkLevelDef[]; bankMin: number;
  /** zonk experience and level (100 xp a level) */
  xp: number; level: number; from: number; to: number;
  /** the best game of the day (all levels); yesterday's while nobody has played today */
  record: { points: number; playerId: number; name: string; photo: string | null; day: "today" | "yesterday" } | null;
  active: GameView | null;
}
export interface PokerDraw { id: number; cards: { r: number; s: number }[]; swapsLeft: number; swapped: number[]; hand: import("../content/games.ts").PokerHand; used: number[] }
export interface PokerInfo { left: number; played?: number; perDay: number; price: { currency: Currency; amount: number }; chips?: number; xp: number; level: number; from: number; to: number | null; cheats?: number; active?: PokerDraw | null }
export interface PokerPlay {
  kind: "poker"; phase: "draw" | "done"; cards: { r: number; s: number }[]; hand: import("../content/games.ts").PokerHand; used: number[];
  swapsLeft: number; swapped: number[];
  title?: string; reward?: Granted | null; gainedXp?: number; levelUp?: boolean; poker: PokerInfo;
}
export interface GameResult { outcome: string; title: string; reward: Granted | null; points?: number; won?: boolean; xp?: number }
export interface GameView {
  id: number; kind: "zonk"; paid: boolean; status: "active" | "done"; result: GameResult | null;
  /** zonk */
  roll?: number[]; turn?: number; left?: number; history?: { kept: number[]; points: number }[];
  round?: number; rounds?: number; total?: number; last?: { points: number; zonk: boolean; roll?: number[] } | null; scores?: { points: number; zonk: boolean }[];
  level?: number; target?: number;
}
export interface Hit { seq: number; playerId: number; name: string; weapon: string; damage: number; phrase: number; at: number; crit?: boolean; count?: number }
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

/** a newer release is out: the page stops sending anything and asks for a reload (src/client/update.tsx) */
export const UPDATE_EVENT = "xc-update";
let outdated = false;
export const isOutdated = () => outdated;
export function checkVersion(v: string | null) {
  if (outdated || !v || v === "dev" || APP_VERSION === "dev" || v === APP_VERSION) return;
  outdated = true;
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

async function raw<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (outdated) throw new ApiError("update", "Вышло обновление — обнови страницу", 409);
  const r = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", "x-app-version": APP_VERSION, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    cache: "no-store",
  });
  checkVersion(r.headers.get("x-app-version"));
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

/** window event fired after each successful action, detail = the action type */
export const ACTION_EVENT = "xc-action";
export const api = {
  get: <T>(path: string) => raw<T>(path),
  action: async <T>(type: string, body: Record<string, unknown> = {}) => {
    const r = await raw<{ result: T; state: GameState }>("/api/action", { method: "POST", body: JSON.stringify({ type, ...body }) });
    // every action that went through is announced (the newcomer's first steps listen for theirs)
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: type }));
    return r;
  },
};
