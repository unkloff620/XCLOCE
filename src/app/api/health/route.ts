export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { json } from "../../../server/http.ts";
import { getDb } from "../../../server/db.ts";

export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    const [p] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM players");
    return json({ ok: true, version: 2, db: db.kind, players: p.n, telegram: !!process.env.TELEGRAM_BOT_TOKEN, ms: Date.now() - started });
  } catch (e) {
    return json({ ok: false, error: (e as { code?: string }).code ?? "db_unavailable" }, 503);
  }
}
