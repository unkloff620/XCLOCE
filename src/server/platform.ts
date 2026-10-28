/**
 * Production or not. Render sets RENDER=true (and IS_PULL_REQUEST=true on preview copies); Vercel sets VERCEL_ENV.
 * APP_ENV=production works on any other host.
 */
export function isProduction(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    (process.env.RENDER === "true" && process.env.IS_PULL_REQUEST !== "true") ||
    process.env.APP_ENV === "production"
  );
}

/** A long-running Node server (Render, a VPS): nothing wakes it per request, so it runs background work itself. */
export function persistentServer(): boolean {
  return process.env.RENDER === "true" || process.env.PERSISTENT_SERVER === "1";
}

/** The public address of the game as players reach it, learned from their requests (fallback for APP_URL). */
let seenOrigin: string | null = null;
export function rememberOrigin(req: Request): void {
  if (seenOrigin) return;
  try {
    const u = new URL(req.url);
    if (u.protocol === "https:" && !u.hostname.endsWith(".internal")) seenOrigin = u.origin;
  } catch {
    /* ignore */
  }
}
export function knownOrigin(): string | null {
  return seenOrigin;
}
