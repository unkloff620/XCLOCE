/**
 * «Донат»: the currencies for Telegram Stars (content/donate.ts). The game makes an invoice link (Bot API
 * createInvoiceLink, currency XTR), the Mini App opens it; Telegram asks the bot's webhook (app/api/telegram) to confirm
 * the order (pre_checkout_query) and then reports the payment (successful_payment): the currency is credited once per
 * charge id (donate_payments). The webhook is set on the first invoice, unless the bot already sends its updates elsewhere.
 */
import { createHash } from "node:crypto";
import { GameError, type Db } from "../db.ts";
import { addMoney } from "../core.ts";
import { donatePack } from "../../content/donate.ts";
import { CURRENCY_DEFS } from "../../content/currencies.ts";
import { makeCtx } from "../game.ts";
import { knownOrigin } from "../platform.ts";
import { log } from "../log.ts";

const botToken = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
/** the secret Telegram sends back with every webhook call (derived from the bot token, never shown) */
export const webhookSecret = () => createHash("sha256").update(`xcloce-webhook:${botToken()}`).digest("hex").slice(0, 48);

async function bot<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = botToken();
  if (!token) throw new GameError("no_bot", "Оплата сейчас недоступна", 503);
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`${method}: ${j.description ?? r.status}`);
  return j.result as T;
}

function publicOrigin(): string | null {
  const env = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return env || knownOrigin();
}

let webhookReady = false;
/** point the bot's updates at /api/telegram — only if they go nowhere yet or already here (never steal another service's webhook) */
async function ensureWebhook() {
  if (webhookReady) return;
  const origin = publicOrigin();
  if (!origin) return;
  const url = `${origin}/api/telegram`;
  const info = await bot<{ url?: string }>("getWebhookInfo", {});
  if (info.url && info.url !== url) {
    log.warn("donate.webhook_elsewhere", { url: info.url });
    webhookReady = true;
    return;
  }
  if (info.url !== url) await bot("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message", "pre_checkout_query"] });
  webhookReady = true;
}

/** the invoice link of a pack for the player (opened by Telegram.WebApp.openInvoice) */
export async function donateInvoice(pid: number, packId: string): Promise<{ url: string }> {
  const p = donatePack(packId);
  if (!p) throw new GameError("bad_pack", "Нет такого набора");
  await ensureWebhook().catch((e) => log.warn("donate.webhook_fail", { message: String(e?.message ?? e).slice(0, 200) }));
  const name = CURRENCY_DEFS[p.cur].name;
  const url = await bot<string>("createInvoiceLink", {
    title: `${name}: ${p.amount.toLocaleString("ru-RU")}`,
    description: `${p.amount.toLocaleString("ru-RU")} — ${name.toLowerCase()} в XCLOSE`,
    payload: `don:${pid}:${p.id}`,
    currency: "XTR",
    prices: [{ label: name, amount: p.stars }],
  });
  return { url };
}

type Update = {
  pre_checkout_query?: { id: string; from: { id: number }; currency: string; total_amount: number; invoice_payload: string };
  message?: { from?: { id: number }; successful_payment?: { currency: string; total_amount: number; invoice_payload: string; telegram_payment_charge_id: string } };
};
const parsePayload = (s: string) => {
  const m = /^don:(\d+):([A-Z]+-\d)$/.exec(s);
  const pack = m ? donatePack(m[2]) : undefined;
  return m && pack ? { pid: Number(m[1]), pack } : null;
};

/** one update from Telegram (the webhook) */
export async function donateUpdate(db: Db, u: Update) {
  const q = u.pre_checkout_query;
  if (q) {
    const pay = parsePayload(q.invoice_payload);
    const [pl] = pay ? await db.query<{ telegram_id: string; banned_at: Date | null }>("SELECT telegram_id, banned_at FROM players WHERE id=$1", [pay.pid]) : [];
    const ok = !!pay && !!pl && !pl.banned_at && Number(pl.telegram_id) === q.from.id && q.currency === "XTR" && q.total_amount === pay.pack.stars;
    await bot("answerPreCheckoutQuery", ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: "Набор недоступен, попробуй ещё раз из игры" });
    return;
  }
  const sp = u.message?.successful_payment;
  if (!sp) return;
  const pay = parsePayload(sp.invoice_payload);
  if (!pay || sp.currency !== "XTR") {
    log.warn("donate.bad_payment", { payload: sp.invoice_payload, charge: sp.telegram_payment_charge_id });
    return;
  }
  // credited even if the player got banned since: the stars are paid already (refunds go by hand)
  await db.tx(async (q) => {
    const ctx = await makeCtx(q, pay.pid);
    const fresh = await ctx.q.query(
      "INSERT INTO donate_payments (charge_id, player_id, pack, stars, currency, amount) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (charge_id) DO NOTHING RETURNING 1",
      [sp.telegram_payment_charge_id, pay.pid, pay.pack.id, sp.total_amount, pay.pack.cur, pay.pack.amount],
    );
    if (fresh.length) await addMoney(ctx, pay.pack.cur, pay.pack.amount, `donate:${pay.pack.id}`);
  });
  log.info("donate.paid", { pid: pay.pid, pack: pay.pack.id, stars: sp.total_amount });
}
