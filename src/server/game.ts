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
import * as extras from "./systems/extras.ts";
import * as home from "./systems/home.ts";
import * as quests from "./systems/quests.ts";
import * as notify from "./systems/notify.ts";
import { taskById } from "../content/locations.ts";
import { weaponById } from "../content/items.ts";
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
  "daily_claim", "sell", "rename", "slots_spin",
  "equipment_upgrade", "pc_upgrade", "room_buy", "room_set", "look_set", "decor_set", "help_seen",
  "quest_claim", "quest_chest", "notify_set",
] as const;
export type ActionType = (typeof ACTIONS)[number];

/** Runs the action, then feeds daily quests and reminders from what it did. */
export async function dispatch(ctx: Ctx, type: ActionType, body: Record<string, unknown>): Promise<unknown> {
  const result = await perform(ctx, type, body);
  await afterAction(ctx, type, result);
  return result;
}

async function afterAction(ctx: Ctx, type: ActionType, result: unknown) {
  const r = (result ?? {}) as Record<string, unknown>;
  switch (type) {
    case "attack": {
      await quests.questTick(ctx, "damage", Number(r.damage) || 0);
      await quests.questTick(ctx, "hits", 1);
      // the fist rests an hour: remind when it is ready again
      if (typeof r.readyAt === "number" && weaponById(String(r.weapon))?.weapon.kind === "permanent") {
        await notify.schedule(ctx.q, ctx.pid, "fist_ready", r.readyAt, { fightId: r.fightId });
      }
      return;
    }
    case "task": {
      await quests.questTick(ctx, "steps", 1);
      await quests.questTick(ctx, "energy", taskById(String(r.taskId))?.task.energy ?? 0);
      return;
    }
    case "yard_pick": return quests.questTick(ctx, "yard", 1);
    case "buy": return quests.questTick(ctx, "buy", 1);
    case "exchange": return quests.questTick(ctx, "exchange", 1);
    case "slots_spin": return quests.questTick(ctx, "slots", 1);
    case "equipment_upgrade":
    case "pc_upgrade": return quests.questTick(ctx, "upgrade", 1);
    case "daily_claim": return notify.scheduleStreak(ctx, Number(r.streak) || 1);
    default: return;
  }
}

function perform(ctx: Ctx, type: ActionType, body: Record<string, unknown>): Promise<unknown> {
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
    case "sell": return extras.sellItem(ctx, str(body.itemId, "itemId", 40), body.qty === undefined ? 1 : num(body.qty, "qty"));
    case "rename": return extras.rename(ctx, str(body.name, "name", 60));
    case "slots_spin": return extras.spinSlots(ctx);
    case "equipment_upgrade": return home.upgradeEquipment(ctx, str(body.id, "id", 40));
    case "pc_upgrade": return home.upgradePcPart(ctx, str(body.id, "id", 40));
    case "room_buy": return home.buyRoom(ctx, str(body.id, "id", 40));
    case "room_set": return home.setRoom(ctx, str(body.id, "id", 40));
    case "look_set": return home.setLook(ctx, body);
    case "decor_set": return home.setDecor(ctx, str(body.id, "id", 40), num(body.stage, "stage"));
    case "help_seen": return home.helpSeen(ctx, str(body.topic, "topic", 40));
    case "clan_kick": return clans.kickMember(ctx, num(body.playerId, "playerId"));
    case "quest_claim": return quests.claimQuest(ctx, str(body.id, "id", 40));
    case "quest_chest": return quests.openQuestChest(ctx);
    case "notify_set": return notify.setNotify(ctx, body.on === true, body.granted === true);
    default: throw new GameError("bad_action", "Неизвестное действие");
  }
}

export async function runAction(db: Db, pid: number, type: ActionType, body: Record<string, unknown>, opts: { now?: number; rng?: () => number } = {}) {
  return inPlayerTx(db, pid, (ctx) => dispatch(ctx, type, body), opts);
}
