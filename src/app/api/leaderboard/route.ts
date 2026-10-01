export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { publicRoute, oneOf } from "../../../server/http.ts";

const BOARDS = {
  damage_today: { col: "CASE WHEN s.damage_day = CURRENT_DATE THEN s.damage_today ELSE 0 END", title: "Урон сегодня", money: true },
  damage_all: { col: "s.lifetime_damage", title: "Урон за всё время", money: true },
  bosses: { col: "s.bosses_defeated", title: "Побеждено боссов", money: false },
  biggest_dump: { col: "s.biggest_dump", title: "Самый большой слив", money: true },
  profit: { col: "s.realized_profit_usd", title: "Прибыль", money: true },
  level: { col: "p.level", title: "Уровень", money: false },
} as const;

export const GET = publicRoute("leaderboard", async ({ db, req }) => {
  const type = oneOf(new URL(req.url).searchParams.get("type") ?? "damage_today", Object.keys(BOARDS) as (keyof typeof BOARDS)[], "type");
  const b = BOARDS[type];
  const rows = await db.query<{ id: number; name: string; username: string | null; photo_url: string | null; level: number; value: number }>(
    `SELECT p.id, p.first_name AS name, p.username, p.photo_url, p.level, (${b.col})::float8 AS value
       FROM players p JOIN player_stats s ON s.player_id = p.id
      ORDER BY value DESC, p.id ASC LIMIT 50`);
  return { type, title: b.title, money: b.money, rows: rows.map((r, i) => ({ rank: i + 1, ...r })) };
});
