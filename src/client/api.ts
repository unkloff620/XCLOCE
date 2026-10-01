import type { BossFight, GameState } from "../server/game.ts";
import { tg } from "./telegram.ts";

export type { BossFight, GameState };

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let token: string | null = null;
let mode: "telegram" | "guest" | null = null;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function guestId(): string {
  const ls = storage();
  let id = ls?.getItem("xcloce_guest") ?? null;
  if (!id) {
    id = crypto.randomUUID();
    ls?.setItem("xcloce_guest", id);
  }
  return id;
}
export const authMode = () => mode;

export async function login(): Promise<"telegram" | "guest"> {
  const app = tg();
  const body = app ? { initData: app.initData } : { guestId: guestId() };
  const r = await raw<{ token: string; mode: "telegram" | "guest" }>("/api/auth", { method: "POST", body: JSON.stringify(body) }, false);
  token = r.token;
  mode = r.mode;
  return r.mode;
}

async function raw<T>(url: string, init: RequestInit = {}, auth = true, retry = true): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth && token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError("network", "Нет соединения. Проверьте интернет", 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    if (res.status === 401 && auth && retry && err?.code === "auth_required") {
      await login();
      return raw<T>(url, init, auth, false);
    }
    throw new ApiError(err?.code ?? `http_${res.status}`, err?.message ?? "Сервер недоступен, попробуйте позже", res.status);
  }
  return data as T;
}

export interface ActionResponse<R = unknown> { result: R; state: GameState }

export const api = {
  me: () => raw<ActionResponse<null>>("/api/me"),
  action: <R = unknown>(type: string, payload: Record<string, unknown> = {}) =>
    raw<ActionResponse<R>>("/api/action", { method: "POST", body: JSON.stringify({ type, idem: crypto.randomUUID(), ...payload }) }),
  clans: (search = "") => raw<{ clans: ClanRow[] }>(`/api/clans?search=${encodeURIComponent(search)}`),
  clan: (id: number) => raw<{ clan: ClanDetails | null }>(`/api/clans?id=${id}`),
  boss: (index: number) => raw<{ fight: BossFight; state: GameState | null }>(`/api/boss?index=${index}`),
  feed: () => raw<{ items: FeedItem[]; top: TopRow[] }>("/api/feed", {}, false),
};

export interface ClanRow { id: number; name: string; tag: string; description: string; members: number; power: number; owner: string }
export interface ClanMember { id: number; name: string; photo_url: string | null; level: number; power: number; role?: string }
export interface ClanDetails { id: number; name: string; tag: string; description: string; owner_id: number; members: ClanMember[]; requests: ClanMember[]; power: number; isLeader: boolean }
export interface FeedItem { id: number; kind: string; text: string; created_at: string }
export interface TopRow { id: number; name: string; photo_url: string | null; level: number; power: number; tag: string | null }

export interface KillReward {
  bossIndex: number; bossName: string; currency: string; amount: number; key: boolean; killer: boolean;
  damage: number; share: number; xp: number; power: number; items: string[];
}
export interface HitResult {
  bossIndex: number; weapon: string; power: number; dmg: number; crit: boolean; hp: number; hpMax: number;
  killed: boolean; xp: number; attemptsLeft: number; kill: KillReward | null;
}
