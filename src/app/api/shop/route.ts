export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { loadConfig } from "../../../server/config.ts";
import { shopView } from "../../../server/systems/shop.ts";
import { exchangeWindow } from "../../../content/currencies.ts";

export const GET = authedRoute("shop", async ({ db }) => {
  const cfg = await loadConfig(db);
  return { offers: shopView(cfg), exchange: { rub: cfg.exchange.rub, fee: cfg.exchange.fee, ...exchangeWindow(Date.now()) } };
});
