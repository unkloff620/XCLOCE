export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute, num, oneOf, str } from "../../../server/http.ts";
import { withState } from "../../../server/routes.ts";
import * as G from "../../../server/game.ts";
import { CURRENCIES } from "../../../shared/economy.ts";
import { SLOTS } from "../../../shared/items.ts";

const TYPES = [
  "task", "attack", "unlock", "idle", "workplace", "theme", "buy", "equip", "unequip", "use", "exchange",
  "daily", "mission", "clan_create", "clan_disband", "clan_request", "clan_cancel", "clan_accept", "clan_reject", "clan_kick", "clan_leave",
] as const;

/** Single action endpoint: every game action is validated and executed server-side. */
export const POST = authedRoute("action", async ({ db, body, playerId: pid }) => {
  const type = oneOf(body.type, TYPES, "type");
  const idem = typeof body.idem === "string" ? body.idem.slice(0, 80) : undefined;
  return withState(db, pid, async (tx) => {
    switch (type) {
      case "task": return G.doTask(tx, pid, str(body.taskId, "taskId", 40));
      case "attack": return G.doAttack(tx, pid, num(body.boss, "boss"));
      case "unlock": return G.unlockBoss(tx, pid, num(body.boss, "boss"));
      case "idle": return G.claimIdle(tx, pid);
      case "workplace": return G.buyWorkplace(tx, pid, num(body.tier, "tier"));
      case "theme": return G.setTheme(tx, pid, str(body.itemId, "itemId", 40));
      case "buy": return G.shopBuy(tx, pid, str(body.itemId, "itemId", 40), idem);
      case "equip": return G.equip(tx, pid, str(body.itemId, "itemId", 40));
      case "unequip": return G.unequip(tx, pid, oneOf(body.slot, SLOTS, "slot"));
      case "use": return G.useItem(tx, pid, str(body.itemId, "itemId", 40));
      case "exchange": return G.exchange(tx, pid, oneOf(body.from, CURRENCIES, "from"), oneOf(body.to, CURRENCIES, "to"), num(body.amount, "amount"), idem);
      case "daily": return G.claimDaily(tx, pid);
      case "mission": return G.claimMission(tx, pid, str(body.missionId, "missionId", 40));
      case "clan_create": return G.createClan(tx, pid, str(body.name, "name", 40), str(body.tag, "tag", 8), typeof body.description === "string" ? body.description : "");
      case "clan_disband": return G.disbandClan(tx, pid);
      case "clan_request": return G.requestJoin(tx, pid, num(body.clanId, "clanId"));
      case "clan_cancel": return G.cancelRequest(tx, pid, num(body.clanId, "clanId"));
      case "clan_accept": return G.decideRequest(tx, pid, num(body.playerId, "playerId"), true);
      case "clan_reject": return G.decideRequest(tx, pid, num(body.playerId, "playerId"), false);
      case "clan_kick": return G.kickMember(tx, pid, num(body.playerId, "playerId"));
      case "clan_leave": return G.leaveClan(tx, pid);
    }
  });
});
