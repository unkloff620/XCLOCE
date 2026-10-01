export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { publicRoute } from "../../../server/http.ts";

export const GET = publicRoute("feed", async ({ db, req }) => {
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  const rows = await db.query("SELECT id, kind, text, amount, token_id, created_at FROM feed WHERE id > $1 ORDER BY id DESC LIMIT 40", [after]);
  const [g] = await db.query<{ damage_total: number }>("SELECT damage_total FROM global_state WHERE id = 1");
  return { items: rows.reverse(), globalTotal: g.damage_total };
});
