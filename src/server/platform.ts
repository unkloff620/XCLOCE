/** Where the server runs. Vercel sets VERCEL_ENV; on Cloudflare the production Worker sets APP_ENV=production (wrangler.jsonc). */
export function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.APP_ENV === "production";
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
