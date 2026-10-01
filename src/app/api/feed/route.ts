export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { publicRoute } from "../../../server/http.ts";

export const GET = publicRoute("feed", async ({ db }) => {
  const rows = await db.query("SELECT id, kind, text, created_at FROM feed WHERE kind IN ('boss','clan','system') ORDER BY id DESC LIMIT 30");
  const top = await db.query(
    `SELECT p.id, COALESCE(p.username, p.first_name) AS name, p.photo_url, p.level, p.power_cached AS power, c.tag
       FROM players p LEFT JOIN clans c ON c.id = p.clan_id WHERE p.v2_initialized ORDER BY p.power_cached DESC, p.id LIMIT 20`);
  return { items: rows, top };
});
