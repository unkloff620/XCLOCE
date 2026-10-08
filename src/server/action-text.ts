/*
 * Human-readable lines for the admin's action log: what the player did and what they got,
 * e.g. «нашёл «Ржавый ключ» · +120 RUB» or «Тройка BTC [BTC BTC BTC] · +0.0001 BTC».
 */
import type { Granted } from "./core.ts";
import { itemById } from "../content/items.ts";
import { bossById } from "../content/bosses.ts";
import { offerById } from "../content/shop.ts";
import { locationById, taskById } from "../content/locations.ts";
import { questById } from "../content/quests.ts";
import { achievementById } from "../content/achievements.ts";
import { equipmentById, roomById } from "../content/home.ts";
import { talentTree } from "../content/talents.ts";
import { SLOT_SYMBOL_NAMES } from "../content/slots.ts";

type Row = Record<string, unknown>;
const SYMBOLS: Record<string, string> = { ...SLOT_SYMBOL_NAMES, btc: "BTC", sol: "SOL", usd: "USD", keyboard: "клавиатура", candle: "свеча", rub: "RUB" };
const SLOT_NAMES: Record<string, string> = { PANTS: "штаны", SHIRT: "верх", SHOES: "обувь", HEAD: "голова", ACCESSORY: "аксессуар", SPECIAL: "особое" };

const n = (v: unknown) => Number(v ?? 0);
const fmt = (v: unknown) => n(v).toLocaleString("ru-RU", { maximumFractionDigits: 8 });
const item = (id: unknown) => String(id).startsWith("room:") ? `комната «${roomById(String(id).slice(5))?.name ?? id}»` : itemById(String(id))?.name ?? String(id);
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

/** «+300 RUB, +200 авторитета, Клавиатура ×3» */
export function grantedText(g: unknown): string {
  if (!g || typeof g !== "object") return "";
  const r = g as Partial<Granted>;
  const out: string[] = [];
  for (const [c, v] of Object.entries(r.currencies ?? {})) if (n(v)) out.push(`+${fmt(v)} ${c}`);
  if (n(r.xp)) out.push(`+${fmt(r.xp)} авторитета`);
  if (n(r.energy)) out.push(`+${fmt(r.energy)} энергии`);
  for (const it of r.items ?? []) if (it.qty) out.push(`${item(it.id)} ×${fmt(it.qty)}`);
  if (r.unlocks?.length) out.push(`открыто в магазине: ${r.unlocks.map(item).join(", ")}`);
  if (r.levelUp) out.push(`новый уровень ${r.levelUp.to}`);
  return out.join(", ");
}

/** What the player did, from the request and the server's result. */
export function actionText(type: string, body: Row, result: unknown): string | null {
  const r = (result ?? {}) as Row;
  switch (type) {
    case "yard_pick": return join(r.name ? `нашёл «${r.name}»` : null, grantedText(r.reward));
    case "slots_spin": {
      const reels = Array.isArray(r.reels) ? `[${(r.reels as string[]).map((s) => SYMBOLS[s] ?? s).join(" ")}]` : "";
      return join(`${r.title ?? r.outcome ?? "?"} ${reels}`.trim(), grantedText(r.reward) || "без выигрыша");
    }
    case "buy": {
      const o = offerById(String(body.offerId));
      const paid = r.paid as { currency?: string; amount?: number } | undefined;
      return join(`«${o?.title ?? body.offerId}»${n(r.qty) > 1 ? ` ×${fmt(r.qty)}` : ""}`, paid ? `за ${fmt(paid.amount)} ${paid.currency}` : null);
    }
    case "exchange": return `${fmt(r.paid)} ${r.from} → ${fmt(r.got)} ${r.to}`;
    case "sell": return join(`${item(r.itemId)} ×${fmt(r.qty)}`, grantedText(r.got) || (typeof r.got === "number" ? `+${fmt(r.got)} RUB` : null));
    case "use": return join(item(r.itemId), n(r.energy) ? `энергия ${fmt(r.energy)}` : null);
    case "equip": return item(r.itemId ?? body.itemId);
    case "unequip": return SLOT_NAMES[String(r.slot ?? body.slot)] ?? String(r.slot ?? body.slot);
    case "task": {
      const t = taskById(String(body.taskId));
      return join(t ? `${t.loc.name}: «${t.task.title}»` : String(body.taskId), r.steps !== undefined ? `шаг ${r.steps}/${r.need}` : null, grantedText(r.step), r.done ? `задание выполнено: ${grantedText(r.done)}` : null, r.locationComplete ? "локация пройдена" : null);
    }
    case "location_claim": return join(locationById(String(body.locationId))?.name ?? String(body.locationId), r.first ? "первое прохождение" : "повтор", grantedText(r.reward));
    case "fight_start": return join(bossById(String(body.boss))?.name ?? String(body.boss), body.solo === true ? "соло" : null, r.fightId ? `бой #${r.fightId}` : null);
    case "fight_claim": return join(`бой #${body.fightId}`, r.status === "won" ? "победа" : r.status === "lost" ? "босс ушёл" : String(r.status ?? ""), grantedText(r.reward), r.key ? "пропуск получен" : null);
    case "fight_flee": return r.fightId ? `бой #${r.fightId}` : null;
    case "daily_claim": return join(`день ${r.day}`, `серия ${r.streak}`, grantedText(r.reward));
    case "rename": return `новое имя «${r.name ?? body.name}»`;
    case "talent_up": return `${item(r.weapon ?? body.weapon)}: ${talentTree(String(r.weapon ?? body.weapon)).find((n) => n.id === (r.branch ?? body.branch))?.name ?? body.branch} → ${r.level}/${r.max}`;
    case "talent_reset": return `сброс талантов за ${r.price ? `${(r.price as { amount: number }).amount} USD` : "5 USD"} · вернулось ${fmt(r.returned)}`;
    case "equipment_upgrade": return `${equipmentById(String(r.id ?? body.id))?.name ?? body.id} → уровень ${r.level}`;
    case "room_buy":
    case "room_set": return roomById(String(r.room ?? body.id))?.name ?? String(body.id);
    case "piece_buy": return `${equipmentById(String(body.id))?.pieces?.[Number(body.piece) - 1]?.name ?? body.id}`;
    case "decor_save": return "обстановка";
    case "decor_set": return `${equipmentById(String(body.id))?.name ?? body.id}, стадия ${body.stage}`;
    case "quest_claim": return join(questById(String(body.id))?.title ?? String(body.id), grantedText(r.reward));
    case "quest_chest": return join("сундук дня", grantedText(r.reward));
    case "achievement_claim": return join(achievementById(String(body.id))?.name ?? String(body.id), grantedText(r.reward));
    case "prize_claim": return join(r.title ? String(r.title) : `приз #${body.id}`, grantedText(r.reward));
    case "clan_create": return `[${body.tag}] ${body.name}`;
    case "clan_join": return `заявка в «${r.name ?? `клан #${body.clanId}`}»`;
    case "clan_cancel": return `отменил заявку в клан #${r.clanId}`;
    case "clan_accept": return `принял игрока #${body.playerId}`;
    case "clan_reject": return `отклонил заявку игрока #${body.playerId}`;
    case "game_start":
    case "bj_move":
    case "zonk_move": {
      const g = r as { kind?: string; paid?: boolean; status?: string; result?: { title?: string; reward?: unknown } | null; playerValue?: number; dealerValue?: number; turn?: number };
      const name = g.kind === "zonk" ? "Зонк" : "Блэкджек";
      if (g.status !== "done") return join(name, g.paid ? "платная" : "бесплатная", g.kind === "blackjack" ? `${g.playerValue} очков` : `${g.turn ?? 0} очков`);
      return join(name, g.paid ? "платная" : "бесплатная", g.result?.title, grantedText(g.result?.reward) || "без выигрыша");
    }
    case "upgrade": return join(`${item(r.from ?? body.stake)}${body.uid !== undefined ? " ★" : body.qty && n(body.qty) > 1 ? ` ×${fmt(body.qty)}` : ""} (${fmt(r.stakeValue)} ₽) → ${item(r.target)} ★ ${fmt(r.value)} ₽`, `шанс ${fmt(Math.round(n(r.chance) * 10000) / 100)}%`, r.won ? "получилось!" : "сгорело");
    case "stash_collect": return join(`собрал набор нычек #${r.count ?? ""} (${String(body.set)})`, grantedText(r.reward));
    case "up_sell": return `продал ${item(r.itemId)} ★ · +${fmt(r.got)} RUB`;
    case "up_take": return `${item(r.itemId)} ★ → ${r.used ? "использовал" : "в обычный инвентарь"}`;
    case "clan_kick": return `исключил игрока #${body.playerId}`;
    case "clan_edit": return `«${body.name}»`;
    case "notify_set": return body.on === true ? "включил" : "выключил";
    case "look_set": return "сменил внешность";
    default: {
      const { type: _t, idem: _i, ...rest } = body;
      void _t; void _i;
      const s = JSON.stringify(rest);
      return s === "{}" ? null : s;
    }
  }
}

/** A refused action: the server's reason plus what was asked for. */
export function refusedText(type: string, body: Row, message: string): string {
  const asked = (() => {
    switch (type) {
      case "buy": return offerById(String(body.offerId))?.title ?? String(body.offerId ?? "");
      case "task": return taskById(String(body.taskId))?.task.title ?? String(body.taskId ?? "");
      case "fight_start": return bossById(String(body.boss))?.name ?? String(body.boss ?? "");
      case "use": case "equip": case "sell": return item(body.itemId);
      case "exchange": return `${fmt(body.amount)} ${body.from} → ${body.to}`;
      default: return "";
    }
  })();
  return join(asked && `«${asked}»`, `отказ: ${message}`);
}
