/**
 * Production or not. Vercel sets VERCEL_ENV; Railway names the environment (RAILWAY_ENVIRONMENT_NAME, "production" by
 * default); Render sets RENDER=true (and IS_PULL_REQUEST=true on preview copies); on Cloudflare the Worker sets APP_ENV=production (wrangler.jsonc). APP_ENV=production works anywhere.
 */
export function isProduction(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.RAILWAY_ENVIRONMENT_NAME === "production" ||
    (process.env.RENDER === "true" && process.env.IS_PULL_REQUEST !== "true") ||
    process.env.APP_ENV === "production"
  );
}

/** A long-running Node server (Render, Railway, a VPS): nothing wakes it per request, so it runs background work itself. */
export function persistentServer(): boolean {
  return process.env.RENDER === "true" || !!process.env.RAILWAY_ENVIRONMENT_NAME || process.env.PERSISTENT_SERVER === "1";
}

/** Cloudflare Workers runtime (workerd). */
export function onWorkers(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
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
