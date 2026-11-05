import { GameError, type Db } from "./db.ts";

/*
 * «Расходы» in the admin panel: what the game costs a month.
 * Subscriptions (Vercel, Claude, OpenAI…) and the bank / card fee are typed in by the admin (config key "costs");
 * the database (Neon, plan Launch) is billed by use: read live from the Neon API when NEON_API_KEY is set,
 * otherwise only the database size is known (from Postgres itself).
 */

/** usd: the price; paid: what the card is actually charged (with the bank fee); times: payments made so far */
export interface CostLine { name: string; usd: number; paid?: number; times?: number; note?: string }
/** feePct: the fee on the database bill (Neon is paid through Vercel, so Vercel's own fee) */
export interface CostsConfig { v: 2; subs: CostLine[]; feePct: number }

/** Neon «Launch» prices (neon.com/pricing, Nov 2026) */
export const NEON_PRICE = { cuHour: 0.106, storageGbMonth: 0.35, transferFreeGb: 500, transferGb: 0.1 };

const DEFAULTS: CostsConfig = {
  v: 2,
  subs: [
    { name: "Vercel Pro", usd: 20, paid: 21.8, times: 2, note: "хостинг игры" },
    { name: "Claude Max", usd: 100, paid: 122.8, times: 2, note: "разработка и арт" },
    { name: "OpenAI", usd: 12, paid: 12, times: 4, note: "генерация картинок" },
  ],
  feePct: 9,
};

const GB = 1024 ** 3;
const r2 = (v: number) => Math.round(v * 100) / 100;

async function readCosts(db: Db): Promise<CostsConfig> {
  const [row] = await db.query<{ value: unknown }>("SELECT value FROM config WHERE key='costs'");
  const v = (typeof row?.value === "string" ? JSON.parse(row.value) : row?.value) as Partial<CostsConfig> | undefined;
  // the first version had no «paid» / «times»: start over from the real numbers
  if (!v || v.v !== 2 || !Array.isArray(v.subs)) return DEFAULTS;
  return { v: 2, subs: v.subs, feePct: Number(v.feePct) || 0 };
}

type NeonProject = {
  compute_time_seconds?: number; active_time_seconds?: number; data_transfer_bytes?: number; synthetic_storage_size?: number;
  consumption_period_start?: string; consumption_period_end?: string;
};

/** the current billing period's use from the Neon API (null: no key or the API did not answer) */
async function neonUsage(): Promise<{ p: NeonProject } | { error: string } | null> {
  const key = process.env.NEON_API_KEY;
  const id = process.env.NEON_PROJECT_ID;
  if (!key || !id) return null;
  try {
    const r = await fetch(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!r.ok) return { error: `Neon API ответил ${r.status}` };
    const j = (await r.json()) as { project?: NeonProject };
    return j.project ? { p: j.project } : { error: "Neon API: нет данных проекта" };
  } catch (e) {
    return { error: `Neon API недоступен: ${String((e as Error)?.message ?? e).slice(0, 80)}` };
  }
}

export async function costs(db: Db, now = Date.now()) {
  const cfg = await readCosts(db);
  const [size] = await db.query<{ bytes: string }>("SELECT pg_database_size(current_database())::text AS bytes");
  const dbBytes = Number(size?.bytes ?? 0);
  const u = await neonUsage();
  const p = u && "p" in u ? u.p : null;

  // the billing period: Neon's own, else the calendar month
  const d = new Date(now);
  const start = p?.consumption_period_start ? Date.parse(p.consumption_period_start) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = p?.consumption_period_end && Date.parse(p.consumption_period_end) > start ? Date.parse(p.consumption_period_end) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const share = Math.min(1, Math.max(0.02, (now - start) / (end - start)));

  const storageGb = (p?.synthetic_storage_size ?? dbBytes) / GB;
  const neon = p
    ? (() => {
        const cuHours = (p.compute_time_seconds ?? 0) / 3600;
        const activeHours = (p.active_time_seconds ?? 0) / 3600;
        const transferGb = (p.data_transfer_bytes ?? 0) / GB;
        const soFar = cuHours * NEON_PRICE.cuHour + storageGb * NEON_PRICE.storageGbMonth * share + Math.max(0, transferGb - NEON_PRICE.transferFreeGb) * NEON_PRICE.transferGb;
        const cuMonth = cuHours / share;
        const trMonth = transferGb / share;
        const month = cuMonth * NEON_PRICE.cuHour + storageGb * NEON_PRICE.storageGbMonth + Math.max(0, trMonth - NEON_PRICE.transferFreeGb) * NEON_PRICE.transferGb;
        return {
          live: true as const, cuHours: r2(cuHours), activeHours: r2(activeHours), transferGb: r2(transferGb), storageGb: r2(storageGb),
          awakeShare: r2(activeHours / Math.max(1 / 60, (now - start) / 3_600_000)),
          soFar: r2(soFar), month: r2(month), cuMonth: r2(cuMonth), transferMonth: r2(trMonth),
        };
      })()
    : { live: false as const, storageGb: r2(storageGb), error: u && "error" in u ? u.error : null,
        // without the API: the base awake around the clock at 0.25 CU (the worst case at the minimum size)
        month: r2(0.25 * 24 * 30 * NEON_PRICE.cuHour + storageGb * NEON_PRICE.storageGbMonth) };

  const subs = cfg.subs.map((s) => {
    const paid = r2(s.paid ?? s.usd);
    const times = Math.max(0, Math.round(s.times ?? 0));
    return { ...s, usd: r2(s.usd), paid, times, spent: r2(paid * times) };
  });
  const k = 1 + cfg.feePct / 100;
  const neonPaid = r2(neon.month * k);
  const neonSpent = r2(("soFar" in neon ? neon.soFar : 0) * k);
  const price = r2(subs.reduce((a, s) => a + s.usd, 0) + neon.month);
  const month = r2(subs.reduce((a, s) => a + s.paid, 0) + neonPaid);
  return {
    period: { start: new Date(start).toISOString(), end: new Date(end).toISOString(), share: r2(share) },
    prices: NEON_PRICE,
    neon: { ...neon, paid: neonPaid, spent: neonSpent },
    subs,
    feePct: cfg.feePct,
    total: { price, month, fee: r2(month - price), spent: r2(subs.reduce((a, s) => a + s.spent, 0) + neonSpent) },
  };
}

export async function costsSave(db: Db, input: unknown) {
  const v = (input ?? {}) as { subs?: unknown; feePct?: unknown };
  if (!Array.isArray(v.subs) || v.subs.length > 20) throw new GameError("bad_costs", "Список расходов: до 20 строк", 400);
  const subs: CostLine[] = v.subs.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 40);
    const usd = Number(o.usd);
    if (!name) throw new GameError("bad_costs", "У каждой строки нужно название", 400);
    if (!Number.isFinite(usd) || usd < 0 || usd > 100_000) throw new GameError("bad_costs", `${name}: сумма от 0 до 100 000 $`, 400);
    const note = String(o.note ?? "").trim().slice(0, 80);
    const paid = o.paid === undefined || o.paid === null || o.paid === "" ? usd : Number(o.paid);
    const times = Math.round(Number(o.times ?? 0));
    if (!Number.isFinite(paid) || paid < 0 || paid > 100_000) throw new GameError("bad_costs", `${name}: «плачу» от 0 до 100 000 $`, 400);
    if (!Number.isFinite(times) || times < 0 || times > 1000) throw new GameError("bad_costs", `${name}: число оплат от 0 до 1000`, 400);
    return { name, usd: r2(usd), paid: r2(paid), times, ...(note ? { note } : {}) };
  });
  const feePct = Number(v.feePct ?? 0);
  if (!Number.isFinite(feePct) || feePct < 0 || feePct > 50) throw new GameError("bad_costs", "Комиссия: от 0 до 50 %", 400);
  await db.query("INSERT INTO config (key, value) VALUES ('costs', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()", [JSON.stringify({ v: 2, subs, feePct: r2(feePct) })]);
  return costs(db);
}
