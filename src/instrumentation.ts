/**
 * Runs once when the server starts (Next.js instrumentation hook).
 * On a long-running server (Render) Telegram reminders are sent from here — there is no external cron, and the
 * after-request sender only runs while somebody plays. Sending is throttled and
 * claimed in the database, so a second instance (or another host running in parallel) never sends a reminder twice.
 * Quiet hours (00:00–09:00 MSK) only hold live calls, and those are sent right after the request that creates them,
 * so the loop sleeps at night and lets the database (Neon) suspend.
 */
const EVERY_MS = 2 * 60_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { persistentServer } = await import("./server/platform.ts");
  if (!persistentServer()) return;
  const [{ getDb }, { dispatchNotifications }, { log }] = await Promise.all([
    import("./server/db.ts"),
    import("./server/notify-send.ts"),
    import("./server/log.ts"),
  ]);
  const tick = () => {
    if (new Date(Date.now() + 3 * 3600_000).getUTCHours() < 9) return; // night in Moscow
    getDb()
      .then((db) => dispatchNotifications(db))
      .catch((e) => log.warn("notify.loop", { message: String(e?.message ?? e).slice(0, 200) }));
  };
  setInterval(tick, EVERY_MS).unref?.();
  setTimeout(tick, 15_000).unref?.();
  log.info("notify.loop", { everyMs: EVERY_MS });
}
