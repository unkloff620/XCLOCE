/*
 * Per server instance (one serverless function copy): short caches and throttles for the global work the player's state
 * used to do on every poll — the week settlements, the stale duels, the zonk record of the day. With thousands of
 * players polling, these were the same global queries over and over; now each instance does them at most every few
 * seconds. All of them are catch-ups or shared views, so a little lateness changes nothing.
 */
const lastRun = new Map<string, number>();
/** true at most once every `ms` per key on this instance (the caller then does the work) */
export function every(key: string, ms: number, now = Date.now()): boolean {
  const t = lastRun.get(key) ?? 0;
  if (now - t < ms) return false;
  lastRun.set(key, now);
  return true;
}

const cache = new Map<string, { at: number; v: unknown }>();
/** the value for `key`, computed again only when older than `ms` */
export async function cached<T>(key: string, ms: number, f: () => Promise<T>, now = Date.now()): Promise<T> {
  const c = cache.get(key);
  if (c && now - c.at < ms) return c.v as T;
  const v = await f();
  cache.set(key, { at: now, v });
  if (cache.size > 500) for (const [k, x] of cache) if (now - x.at > 60_000) cache.delete(k);
  return v;
}

/** the tests run many games in one process at fake times: no throttling there */
export const MEMO_OFF = !!process.env.VITEST;
