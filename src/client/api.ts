import type { GameState } from "../server/game.ts";
import type { TokenPublic } from "../server/market.ts";
import { tg } from "./telegram.ts";

export type { GameState, TokenPublic };

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

function safeStorage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function guestId(): string {
  const ls = safeStorage("local");
  let id = ls?.getItem("xcloce_guest") ?? null;
  if (!id) {
    id = crypto.randomUUID();
    ls?.setItem("xcloce_guest", id);
  }
  return id;
}

export function authMode() {
  return mode;
}

export async function login(): Promise<"telegram" | "guest"> {
  const app = tg();
  const body = app ? { initData: app.initData } : { guestId: guestId() };
  const res = await raw<{ token: string; mode: "telegram" | "guest" }>("/api/auth", { method: "POST", body: JSON.stringify(body) }, false);
  token = res.token;
  mode = res.mode;
  return res.mode;
}

async function raw<T>(url: string, init: RequestInit = {}, withAuth = true, retry = true): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (withAuth && token) headers.authorization = `Bearer ${token}`;
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
    /* non-JSON */
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    if (res.status === 401 && withAuth && retry && err?.code === "auth_required") {
      await login();
      return raw<T>(url, init, withAuth, false);
    }
    throw new ApiError(err?.code ?? "http_" + res.status, err?.message ?? "Сервер недоступен, попробуйте позже", res.status);
  }
  return data as T;
}

export const idem = () => crypto.randomUUID();

export interface ActionResponse<R> {
  result: R;
  state: GameState;
  sync: { defeats: GameState["unseenDefeats"] };
}

export type SellResult = {
  ticker: string;
  saleUsd: number;
  pnlUsd: number;
  roi: number;
  proceedsSol: number;
  damage: { amount: number; crit: boolean; critMult: number; toolMult: number; comboMult: number; equipMult: number; combo: number };
  replay?: boolean;
};
export type BuyResult = { ticker: string; amount: number; usd: number; spentSol: number; feeUsd: number };
export type ExchangeResult = { spent: number; received: number; from: string; to: string; feeUsd: number };
export type WorkResult = { earned: number };

export const api = {
  me: () => raw<ActionResponse<null>>("/api/me"),
  market: () => raw<{ tokens: TokenPublic[]; serverTime: number }>("/api/market", {}, false),
  token: (id: string) => raw<{ token: TokenPublic }>(`/api/token?id=${encodeURIComponent(id)}`, {}, false),
  work: () => raw<ActionResponse<WorkResult>>("/api/work", { method: "POST", body: "{}" }),
  exchange: (from: string, to: string, amount: number) =>
    raw<ActionResponse<ExchangeResult>>("/api/exchange", { method: "POST", body: JSON.stringify({ from, to, amount, idem: idem() }) }),
  buy: (tokenId: string, sol: number) =>
    raw<ActionResponse<BuyResult>>("/api/trade", { method: "POST", body: JSON.stringify({ side: "buy", tokenId, sol, idem: idem() }) }),
  sell: (tokenId: string, fraction: number) =>
    raw<ActionResponse<SellResult>>("/api/trade", { method: "POST", body: JSON.stringify({ side: "sell", tokenId, fraction, idem: idem() }) }),
  buyEquipment: (tier: number) => raw<ActionResponse<unknown>>("/api/shop", { method: "POST", body: JSON.stringify({ kind: "equipment", tier, idem: idem() }) }),
  buyTool: (toolId: string) => raw<ActionResponse<unknown>>("/api/shop", { method: "POST", body: JSON.stringify({ kind: "tool", toolId, idem: idem() }) }),
  equip: (toolId: string) => raw<ActionResponse<unknown>>("/api/equip", { method: "POST", body: JSON.stringify({ toolId }) }),
  tutorial: (action: "boss_opened" | "skip") => raw<ActionResponse<unknown>>("/api/tutorial", { method: "POST", body: JSON.stringify({ action }) }),
  bosses: () => raw<{ current: number; bosses: BossListItem[] }>("/api/bosses"),
  leaderboard: (type: string) => raw<{ title: string; money: boolean; rows: LeaderRow[] }>(`/api/leaderboard?type=${type}`, {}, false),
  feed: () => raw<{ items: FeedItem[]; globalTotal: number }>("/api/feed", {}, false),
};

export interface FeedItem { id: number; kind: string; text: string; amount: number | null; token_id: string | null; created_at: string }
export interface LeaderRow { rank: number; id: number; name: string; username: string | null; photo_url: string | null; level: number; value: number }
export interface BossListItem {
  index: number; name: string; title: string; image: string; hueShift: number; marketCap: number; rewardUsdFull: number;
  rewardXp: number; dropToolId: string | null; status: "defeated" | "current" | "locked"; personalDamage: number | null; rewardPaid: number | null;
}
