export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getDb } from "../../../server/db.ts";
import { advanceMarket, currentTick } from "../../../server/market.ts";
import { log } from "../../../server/log.ts";

/**
 * Realtime channel (Server-Sent Events). Pushes GLOBAL_DAMAGE_TOTAL changes, feed items and market ticks.
 * One lightweight query every 1.5 s per open connection; the connection closes after ~50 s and the
 * browser's EventSource reconnects automatically (serverless-friendly).
 */
export async function GET(req: Request) {
  const db = await getDb();
  const url = new URL(req.url);
  let lastFeedId = Number(url.searchParams.get("after") ?? 0) || 0;
  const encoder = new TextEncoder();
  const started = Date.now();
  let closed = false;
  req.signal.addEventListener("abort", () => { closed = true; });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      controller.enqueue(encoder.encode("retry: 1500\n\n"));
      let lastTotal = -1;
      let lastTick = 0;
      let lastPing = Date.now();
      try {
        if (!lastFeedId) {
          const [row] = await db.query<{ id: number }>("SELECT COALESCE(MAX(id), 0)::bigint AS id FROM feed");
          lastFeedId = Math.max(0, row.id - 15);
        }
        while (!closed && Date.now() - started < 50_000) {
          const tick = currentTick();
          if (tick !== lastTick) {
            await advanceMarket(db).catch((e) => log.warn("stream.market", { message: (e as Error).message }));
            if (lastTick) send("market", { tick });
            lastTick = tick;
          }
          const [g] = await db.query<{ damage_total: number }>("SELECT damage_total FROM global_state WHERE id = 1");
          if (g.damage_total !== lastTotal) {
            lastTotal = g.damage_total;
            send("global", { total: g.damage_total, t: Date.now() });
          }
          const items = await db.query<{ id: number }>(
            "SELECT id, kind, text, amount, token_id, created_at FROM feed WHERE id > $1 ORDER BY id ASC LIMIT 30", [lastFeedId]);
          if (items.length) {
            lastFeedId = items[items.length - 1].id;
            send("feed", items);
          }
          if (Date.now() - lastPing > 15_000) {
            controller.enqueue(encoder.encode(": ping\n\n"));
            lastPing = Date.now();
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        log.warn("stream.error", { message: (e as Error).message?.slice(0, 200) });
      } finally {
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
