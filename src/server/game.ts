import { randomInt } from "node:crypto";
import { GameError, type Db, type Queryable } from "./db.ts";
import { loadConfig } from "./config.ts";
import { lockPlayer, type Ctx } from "./core.ts";
import { num, oneOf, str } from "./http.ts";
import * as combat from "./systems/combat.ts";
import * as locations from "./systems/locations.ts";
import * as yard from "./systems/yard.ts";
import * as shop from "./systems/shop.ts";
import * as clans from "./systems/clans.ts";
import * as daily from "./systems/daily.ts";
import { gameState } from "./systems/state.ts";
import { CURRENCIES } from "../content/currencies.ts";
import { WEARABLE_SLOTS } from "../content/items.ts";

/** Server-side randomness: crypto-grade, never from the client. */
export const secureRng = () => randomInt(0, 2 ** 31) / 2 ** 31;

export async function makeCtx(q: Queryable, pid: number, opts: { now?: number; rng?: () => number } = {}): Promise<Ctx> {
  const now = opts.now ?? Date.now();
  return { q, pid, now, cfg: await loadConfig(q, now), rng: opts.rng ?? secureRng };
}

/** Runs fn in one transaction with the player row locked (regen applied), then returns its result plus fresh state. */
export async function inPlayerTx<T>(db: Db, pid: number, fn: (ctx: Ctx) => Promise<T>, opts: { now?: number; rng?: () => number } = {}) {
  return db.tx(async (q) => {
    const ctx = await makeCtx(q, pid, opts);
    await lockPlayer(ctx);
    const result = await fn(ctx);
    return { result, state: await gameState(ctx) };
  });
}

export const ACTIONS = [
  "fight_start", "attack", "fight_claim", "fight_flee",
  "task", "location_claim",
  "yard_pick",
  "buy", "exchange", "use", "equip", "unequip",
  "clan_create", "clan_join", "clan_leave", "clan_kick",
  "daily_claim",
] as const;
export type ActionType = (typeof ACTIONS)[number];

export function dispatch(ctx: Ctx, type: ActionType, body: Record<string, unknown>): Promise<unknown> {
  const idem = typeof body.idem === "string" ? body.idem.slice(0, 80) : undefined;
  switch (type) {
    case "fight_start": return combat.startFight(ctx, str(body.boss, "boss", 40));
    case "attack": return combat.attack(ctx, str(body.weapon, "weapon", 40), idem);
    case "fight_claim": return combat.claimFight(ctx, num(body.fightId, "fightId"));
    case "fight_flee": return combat.fleeFight(ctx);
    case "task": return locations.doTask(ctx, str(body.taskId, "taskId", 40));
    case "location_claim": return locations.claimLocation(ctx, str(body.locationId, "locationId", 40));
    case "yard_pick": return yard.yardPick(ctx, num(body.itemId, "itemId"));
    case "buy": return shop.buy(ctx, str(body.offerId, "offerId", 40), idem);
    case "exchange": return shop.exchange(ctx, oneOf(body.from, CURRENCIES, "from"), oneOf(body.to, CURRENCIES, "to"), num(body.amount, "amount"), idem);
    case "use": return shop.useItem(ctx, str(body.itemId, "itemId", 40));
    case "equip": return shop.equip(ctx, str(body.itemId, "itemId", 40));
    case "unequip": return shop.unequip(ctx, oneOf(body.slot, WEARABLE_SLOTS, "slot"));
    case "clan_create": return clans.createClan(ctx, str(body.name, "name", 40), str(body.tag, "tag", 8), str(body.emblem, "emblem", 20), str(body.color, "color", 10));
    case "clan_join": return clans.joinClan(ctx, num(body.clanId, "clanId"));
    case "clan_leave": return clans.leaveClan(ctx);
    case "daily_claim": return daily.claimDaily(ctx);
    case "clan_kick": return clans.kickMember(ctx, num(body.playerId, "playerId"));
    default: throw new GameError("bad_action", "Неизвестное действие");
  }
}

export async function runAction(db: Db, pid: number, type: ActionType, body: Record<string, unknown>, opts: { now?: number; rng?: () => number } = {}) {
  return inPlayerTx(db, pid, (ctx) => dispatch(ctx, type, body), opts);
}
