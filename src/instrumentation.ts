/**
 * Runs once when the server starts (Next.js instrumentation hook).
 * On a long-running server (Railway) Telegram reminders are sent from here every minute — there is no Vercel Cron or
 * Cloudflare cron trigger, and the after-request sender only runs while somebody plays. Sending is throttled and
 * claimed in the database, so a second instance (or Vercel running in parallel) never sends a reminder twice.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { persistentServer } = await import("./server/platform.ts");
  if (!persistentServer()) return;
  const [{ getDb }, { dispatchNotifications }, { log }] = await Promise.all([
    import("./server/db.ts"),
    import("./server/notify-send.ts"),
    import("./server/log.ts"),
  ]);
  const tick = () =>
    getDb()
      .then((db) => dispatchNotifications(db))
      .catch((e) => log.warn("notify.loop", { message: String(e?.message ?? e).slice(0, 200) }));
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  setTimeout(tick, 15_000).unref?.();
  log.info("notify.loop", { every: "60s" });
}
