export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Empties this browser's HTTP cache for the game (once per device, client/shell.tsx): the boss pages used to be cached
 * for a day by mistake, an old release of them made the game say «Вышло обновление» and reload on every visit.
 */
export function GET() {
  return new Response(null, { status: 204, headers: { "clear-site-data": "\"cache\"", "cache-control": "no-store" } });
}
