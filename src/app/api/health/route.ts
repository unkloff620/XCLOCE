export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { json } from "../../../server/http.ts";
import { getDb } from "../../../server/db.ts";

export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    const [g] = await db.query<{ damage_total: number }>("SELECT damage_total FROM global_state WHERE id = 1");
    return json({ ok: true, db: db.kind, globalTotal: g.damage_total, telegram: !!process.env.TELEGRAM_BOT_TOKEN, ms: Date.now() - started });
  } catch (e) {
    return json({ ok: false, error: (e as { code?: string }).code ?? "db_unavailable" }, 503);
  }
}
