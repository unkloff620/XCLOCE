import { randomInt } from "node:crypto";
import { GameError, type Db, type Queryable } from "./db.ts";
import { loadConfig } from "./config.ts";
import { lockPlayer, type Ctx } from "./core.ts";
import { num, oneOf, str } from "./http.ts";
import * as combat from "./systems/combat.ts";
import * as locations from "./systems/locations.ts";
import * as swap from "./systems/swap.ts";
import * as yard from "./systems/yard.ts";
import * as shop from "./systems/shop.ts";
import * as counters from "./systems/counters.ts";
import { openAchBox } from "./systems/achbox.ts";
import * as clans from "./systems/clans.ts";
import * as daily from "./systems/daily.ts";
import * as extras from "./systems/extras.ts";
import * as games from "./systems/games.ts";
import * as bj from "./systems/blackjack.ts";
import * as home from "./systems/home.ts";
import * as quests from "./systems/quests.ts";
import * as notify from "./systems/notify.ts";
import * as rating from "./systems/rating.ts";
import * as extras2 from "./systems/minigame-extras.ts";
import * as clanBoss from "./systems/clan-boss.ts";
import * as duels from "./systems/duels.ts";
import * as social from "./systems/social.ts";
import * as achievements from "./systems/achievements.ts";
import { taskById } from "../content/locations.ts";
import { weaponById } from "../content/items.ts";
import { gameState } from "./systems/state.ts";
import { actionText, refusedText } from "./action-text.ts";
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
    const p = await lockPlayer(ctx);
    if (p.banned_at) throw new GameError("banned", `Аккаунт заблокирован${p.ban_reason ? `: ${p.ban_reason}` : ""}`, 403);
    const result = await fn(ctx);
    return { result, state: await gameState(ctx) };
  });
}

export const ACTIONS = [
  "fight_start", "attack", "fight_claim", "fight_flee",
  "task", "location_claim", "business_up", "business_claim",
  "yard_pick",
  "buy", "exchange", "use", "equip", "unequip",
  "clan_create", "clan_join", "clan_leave", "clan_kick", "clan_transfer",
  "daily_claim", "sell", "rename", "slots_spin",
  "equipment_upgrade", "talent_up", "talent_reset", "talent_auto", "room_buy", "room_set", "look_set", "decor_set", "decor_save", "piece_buy", "help_seen", "starter_gift",
  "quest_claim", "quest_chest", "notify_set", "achievement_claim", "achievement_claim_all", "ach_box_open", "prize_claim", "clan_edit",
  "game_start", "zonk_move", "zonk_give_up", "zonk_hints", "zonk_choice", "roach_squash", "poker_play", "poker_swap", "poker_stand", "bj_open", "bj_invite", "bj_join", "bj_decline", "bj_leave", "bj_bet", "bj_unbet", "bj_insure", "bj_move", "upgrade", "up_sell", "up_take",
  "clan_cancel", "clan_accept", "clan_reject", "clan_boss_hit", "duel_create", "duel_answer", "duel_play", "stash_collect", "stash_wish", "stash_gift", "stash_accept", "social_pump", "social_fight", "social_spit", "notes_read",
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
      await rating.addWeeklyDamage(ctx, Number(r.damage) || 0);
      await quests.questTick(ctx, "hits", Number(r.count) || 1);
      // a free weapon (fist, mouse, candle) rests 5 hours: remind when it is ready again
      if (typeof r.readyAt === "number" && weaponById(String(r.weapon))?.weapon.kind === "permanent") {
        await notify.schedule(ctx.q, ctx.pid, "fist_ready", r.readyAt, { fightId: r.fightId, weapon: r.weapon });
      }
      return;
    }
    case "task": {
      await quests.questTick(ctx, "steps", 1);
      await quests.questTick(ctx, "energy", taskById(String(r.taskId))?.task.energy ?? 0);
      return;
    }
    case "yard_pick": return quests.questTick(ctx, "yard", 1);
    case "buy": {
      // the achievements «Шопоголик»: money spent in the shop
      const paid = r.paid as { currency?: string; amount?: number } | undefined;
      if (paid && (paid.currency === "RUB" || paid.currency === "USD")) await counters.bump(ctx.q, ctx.pid, `spent${paid.currency}`, Number(paid.amount) || 0);
      return quests.questTick(ctx, "buy", 1);
    }
    case "exchange": {
      await counters.bump(ctx.q, ctx.pid, "exchanges", 1);
      return quests.questTick(ctx, "exchange", 1);
    }
    case "upgrade": {
      // «Апгрейдер», «Рисковый» (15% and less), «Везунчик» (wins in a row)
      if (r.won) {
        await counters.bump(ctx.q, ctx.pid, "upgWins", 1);
        if (Number(r.chance) <= 0.1501) await counters.bump(ctx.q, ctx.pid, "upgLowWins", 1);
        await counters.bump(ctx.q, ctx.pid, "upgRun", 1);
        const run = (await counters.countersOf(ctx.q, ctx.pid)).upgRun ?? 0;
        await counters.setMax(ctx.q, ctx.pid, "upgStreak", run);
      } else await counters.setTo(ctx.q, ctx.pid, "upgRun", 0);
      return quests.questTick(ctx, "upgrader", 1);
    }
    case "social_pump":
    case "social_fight":
    case "social_spit": return quests.questTick(ctx, "social", 1);
    case "clan_create": return counters.setMax(ctx.q, ctx.pid, "clanCreated", 1);
    case "slots_spin": return quests.questTick(ctx, "slots", 1);
    case "equipment_upgrade":
    case "piece_buy":
    case "talent_up": return quests.questTick(ctx, "upgrade", 1);
    case "daily_claim": return notify.scheduleStreak(ctx, Number(r.streak) || 1);
    // the mini-game quests: a counted poker hand, a finished zonk game, a squashed roach (blackjack rounds: blackjack.ts)
    case "poker_play":
    case "poker_swap":
    case "poker_stand": return r.phase === "done" ? quests.questTick(ctx, "poker", 1) : undefined;
    case "game_start":
    case "zonk_move":
    case "zonk_choice":
    case "zonk_give_up": return r.status === "done" ? quests.questTick(ctx, "zonk", 1) : undefined;
    case "roach_squash": return r.reward ? quests.questTick(ctx, "roach", 1) : undefined;
    case "clan_boss_hit": {
      await quests.questTick(ctx, "damage", Number(r.damage) || 0);
      await quests.questTick(ctx, "hits", Number(r.count) || 1);
      return;
    }
    default: return;
  }
}

function perform(ctx: Ctx, type: ActionType, body: Record<string, unknown>): Promise<unknown> {
  const idem = typeof body.idem === "string" ? body.idem.slice(0, 80) : undefined;
  switch (type) {
    case "fight_start": return combat.startFight(ctx, str(body.boss, "boss", 40), body.solo === true, body.mode === undefined ? "pacan" : oneOf(body.mode, ["pacan", "blat", "avtor"] as const, "mode"));
    case "attack": return combat.attack(ctx, str(body.weapon, "weapon", 40), idem, body.count === undefined ? 1 : num(body.count, "count"));
    case "fight_claim": return combat.claimFight(ctx, num(body.fightId, "fightId"));
    case "fight_flee": return combat.fleeFight(ctx);
    case "task": return locations.doTask(ctx, str(body.taskId, "taskId", 40));
    case "location_claim": return locations.claimLocation(ctx, str(body.locationId, "locationId", 40), body.mode === "night" ? "night" : "day");
    case "business_up": return locations.businessUp(ctx, str(body.locationId, "locationId", 40), body.line === "rep" ? "rep" : "rub");
    case "business_claim": return locations.businessClaim(ctx);
    case "yard_pick": return yard.yardPick(ctx, num(body.itemId, "itemId"));
    case "buy": return shop.buy(ctx, str(body.offerId, "offerId", 40), idem, body.qty === undefined ? 1 : num(body.qty, "qty"));
    case "exchange": return shop.exchange(ctx, oneOf(body.from, CURRENCIES, "from"), oneOf(body.to, CURRENCIES, "to"), num(body.amount, "amount"), idem);
    case "use": return shop.useItem(ctx, str(body.itemId, "itemId", 40));
    case "equip": return shop.equip(ctx, str(body.itemId, "itemId", 40));
    case "unequip": return shop.unequip(ctx, oneOf(body.slot, WEARABLE_SLOTS, "slot"));
    case "ach_box_open": return openAchBox(ctx, body.all === true);
    case "clan_create": return clans.createClan(ctx, str(body.name, "name", 40), str(body.tag, "tag", 8), str(body.emblem, "emblem", 20), str(body.color, "color", 10));
    case "clan_join": return clans.joinClan(ctx, num(body.clanId, "clanId"));
    case "clan_leave": return clans.leaveClan(ctx);
    case "daily_claim": return daily.claimDaily(ctx);
    case "sell": return extras.sellItem(ctx, str(body.itemId, "itemId", 40), body.qty === undefined ? 1 : num(body.qty, "qty"));
    case "rename": return extras.rename(ctx, str(body.name, "name", 60));
    case "slots_spin": return extras.spinSlots(ctx);
    case "equipment_upgrade": return home.upgradeEquipment(ctx, str(body.id, "id", 40));
    case "talent_up": return home.upgradeTalent(ctx, str(body.weapon, "weapon", 40), str(body.branch, "branch", 10));
    case "talent_reset": return home.resetTalents(ctx);
    case "talent_auto": return home.setTalentAuto(ctx, body.on === true);
    case "room_buy": return home.buyRoom(ctx, str(body.id, "id", 40));
    case "room_set": return home.setRoom(ctx, str(body.id, "id", 40));
    case "look_set": return home.setLook(ctx, body);
    case "decor_set": return home.setDecor(ctx, str(body.id, "id", 40), num(body.stage, "stage"));
    case "decor_save": return home.saveDecor(ctx, (body.decor && typeof body.decor === "object" ? body.decor : {}) as Record<string, unknown>);
    case "piece_buy": return home.buyPiece(ctx, str(body.id, "id", 40), num(body.piece, "piece"));
    case "starter_gift": return home.starterGift(ctx);
    case "help_seen": return home.helpSeen(ctx, str(body.topic, "topic", 40));
    case "clan_kick": return clans.kickMember(ctx, num(body.playerId, "playerId"));
    case "clan_transfer": return clans.transferLeader(ctx, num(body.playerId, "playerId"));
    case "quest_claim": return quests.claimQuest(ctx, str(body.id, "id", 40));
    case "quest_chest": return quests.openQuestChest(ctx);
    case "notify_set": return notify.setNotify(ctx, body.on === true, body.granted === true);
    case "achievement_claim": return achievements.claimAchievement(ctx, str(body.id, "id", 40));
    case "achievement_claim_all": return achievements.claimAllAchievements(ctx);
    case "prize_claim": return rating.claimPrize(ctx, num(body.id, "id"));
    case "clan_edit": return clans.editClan(ctx, str(body.name, "name", 40), str(body.emblem, "emblem", 20), str(body.color, "color", 10), typeof body.description === "string" ? body.description.slice(0, 400) : "");
    case "game_start": return games.startGame(ctx, oneOf(body.game, ["zonk"] as const, "game"), body.level === undefined ? 1 : num(body.level, "level"));
    case "zonk_give_up": return games.zonkGiveUp(ctx);
    case "zonk_hints": return games.zonkHints(ctx, body.on === true);
    case "zonk_choice": return games.zonkChoice(ctx, oneOf(body.go, ["end", "continue"] as const, "go"));
    case "bj_open": return bj.bjOpen(ctx);
    case "bj_invite": return bj.bjInvite(ctx, num(body.playerId, "playerId"));
    case "bj_join": return bj.bjJoin(ctx, num(body.inviteId, "inviteId"));
    case "bj_decline": return bj.bjDecline(ctx, num(body.inviteId, "inviteId"));
    case "bj_leave": return bj.bjLeave(ctx);
    case "bj_bet": return bj.bjBet(ctx, body.free === true ? 0 : num(body.bet, "bet"), body.pp === undefined ? 0 : num(body.pp, "pp"), body.t3 === undefined ? 0 : num(body.t3, "t3"), body.free === true);
    case "bj_unbet": return bj.bjUnbet(ctx);
    case "bj_insure": return bj.bjInsure(ctx, body.take === true);
    case "bj_move": return bj.bjMove(ctx, oneOf(body.move, ["hit", "stand", "double", "split"] as const, "move"));
    case "zonk_move": return games.zonkMove(ctx, Array.isArray(body.pick) ? body.pick.slice(0, 6).map((x) => Number(x)) : [], oneOf(body.then, ["roll", "bank"] as const, "then"));
    case "poker_play": return games.playPoker(ctx, body.chip === true);
    case "roach_squash": return extras2.squashRoach(ctx);
    case "duel_create": return duels.createDuel(ctx, num(body.to, "to"), num(body.stake, "stake"));
    case "duel_answer": return duels.answerDuel(ctx, num(body.id, "id"), oneOf(body.answer, ["accept", "decline", "cancel"] as const, "answer"));
    case "duel_play": return duels.playDuel(ctx, num(body.id, "id"));
    case "clan_boss_hit": return clanBoss.hitClanBoss(ctx, str(body.weapon, "weapon", 40), body.count === undefined ? 1 : num(body.count, "count"));
    case "poker_swap": return games.pokerSwap(ctx, num(body.index, "index"));
    case "poker_stand": return games.pokerStand(ctx);
    case "upgrade": return games.upgrade(
      ctx,
      body.uid !== undefined ? { uid: num(body.uid, "uid") } : { item: str(body.stake, "stake", 40), qty: body.qty === undefined ? 1 : num(body.qty, "qty") },
      str(body.mode, "mode", 8),
    );
    case "up_sell": return games.sellUpgraded(ctx, num(body.uid, "uid"));
    case "up_take": return games.takeUpgradedOut(ctx, num(body.uid, "uid"), body.use === true);
    case "stash_collect": return locations.collectStashSet(ctx, str(body.set, "set", 30));
    case "stash_wish": return swap.setStashWish(ctx, body.items);
    case "stash_gift": return swap.giftStash(ctx, num(body.to, "to"), str(body.itemId, "itemId", 40));
    case "social_pump": return social.pump(ctx, num(body.to, "to"));
    case "social_fight": return social.fight(ctx, num(body.to, "to"));
    case "social_spit": return social.spit(ctx, num(body.to, "to"));
    case "notes_read": return social.readNotes(ctx);
    case "stash_accept": return swap.acceptGifts(ctx, body.id === undefined || body.id === null ? null : num(body.id, "id"));
    case "clan_cancel": return clans.cancelRequest(ctx);
    case "clan_accept": return clans.answerRequest(ctx, num(body.playerId, "playerId"), true);
    case "clan_reject": return clans.answerRequest(ctx, num(body.playerId, "playerId"), false);
    default: throw new GameError("bad_action", "Неизвестное действие");
  }
}

/** Actions not written to the action log: hits are already in boss_hits, help_seen is noise. */
const NOT_LOGGED = new Set<ActionType>(["attack", "help_seen"]);

export async function logAction(q: Queryable, pid: number, type: string, ok: boolean, info: string | null, now: number) {
  await q.query("INSERT INTO action_log (player_id, type, ok, info, at) VALUES ($1,$2,$3,$4,$5)", [pid, type, ok, info, new Date(now)]);
}

export async function runAction(db: Db, pid: number, type: ActionType, body: Record<string, unknown>, opts: { now?: number; rng?: () => number } = {}) {
  try {
    return await inPlayerTx(db, pid, async (ctx) => {
      const r = await dispatch(ctx, type, body);
      if (!NOT_LOGGED.has(type)) await logAction(ctx.q, pid, type, true, actionText(type, body, r)?.slice(0, 500) ?? null, ctx.now);
      return r;
    }, opts);
  } catch (e) {
    // refused actions are logged too (outside the rolled-back transaction): spam and cheating attempts show up here
    if (e instanceof GameError && e.status < 500 && e.code !== "banned" && !NOT_LOGGED.has(type)) {
      await logAction(db, pid, type, false, refusedText(type, body, e.message).slice(0, 500), opts.now ?? Date.now()).catch(() => {});
    }
    throw e;
  }
}
