import { MIGRATIONS } from "./migrations.ts";
import { log } from "./log.ts";

/** Minimal query interface shared by node-postgres (production) and PGlite (local dev / tests). */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Queryable {
  /** Runs fn inside BEGIN/COMMIT. Rolls back on throw. */
  tx<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  /** Executes a multi-statement script without parameters. */
  exec(sql: string): Promise<void>;
  kind: "postgres" | "pglite";
  close(): Promise<void>;
}

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

async function createPgDb(url: string): Promise<Db> {
  const { Pool, types } = await import("pg");
  // BIGINT (int8) -> number. Our ids stay far below 2^53.
  types.setTypeParser(20, (v: string) => Number(v));
  // NUMERIC -> number (aggregates such as SUM over float return float8 anyway)
  types.setTypeParser(1700, (v: string) => Number(v));
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
  });
  pool.on("error", (e: Error) => log.error("db.pool", { message: e.message }));
  return {
    kind: "postgres",
    async query(sql, params) {
      const r = await pool.query(sql, params as unknown[]);
      return r.rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          async query(sql, params) {
            const r = await client.query(sql, params as unknown[]);
            return r.rows;
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/** In-process Postgres (WASM). Used when DATABASE_URL is not set: local dev and tests. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite, types } = await import("@electric-sql/pglite");
  const parsers = { [types.INT8]: (v: string) => Number(v), [types.NUMERIC]: (v: string) => Number(v) };
  const pg = dataDir ? new PGlite(dataDir, { parsers }) : new PGlite({ parsers });
  // PGlite is a single connection: serialize transactions ourselves so that
  // concurrent callers behave like separate sessions waiting on locks.
  let chain: Promise<unknown> = Promise.resolve();
  const runExclusive = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };
  const q = async <T,>(sql: string, params?: unknown[]): Promise<T[]> => {
    const r = await pg.query<T>(sql, params as unknown[]);
    return r.rows;
  };
  return {
    kind: "pglite",
    query: (sql, params) => runExclusive(() => q(sql, params)),
    exec: (sql) => runExclusive(async () => { await pg.exec(sql); }),
    tx: (fn) =>
      runExclusive(async () => {
        await pg.exec("BEGIN");
        try {
          const result = await fn({ query: q });
          await pg.exec("COMMIT");
          return result;
        } catch (e) {
          await pg.exec("ROLLBACK").catch(() => undefined);
          throw e;
        }
      }),
    async close() {
      await pg.close();
    },
  };
}

export async function migrate(db: Db): Promise<void> {
  await db.tx(async (tx) => {
    // Serialize concurrent cold starts.
    await tx.query("SELECT pg_advisory_xact_lock(4242001)");
    await tx.query("CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const applied = new Set(
      (await tx.query<{ key: string }>("SELECT key FROM schema_meta WHERE key LIKE 'migration:%'")).map((r) => r.key),
    );
    for (const m of MIGRATIONS) {
      if (applied.has(`migration:${m.id}`)) continue;
      // Split on statement boundaries so it also works inside a parameterless transaction on both drivers.
      for (const stmt of splitSql(m.sql)) await tx.query(stmt);
      await tx.query("INSERT INTO schema_meta (key, value) VALUES ($1, now()::text) ON CONFLICT (key) DO NOTHING", [
        `migration:${m.id}`,
      ]);
      log.info("db.migrated", { id: m.id });
    }
  });
}

export function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter((s) => s.length > 0);
}

let dbPromise: Promise<Db> | null = null;

/** Lazily created singleton DB with schema applied. */
export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const url = databaseUrl();
      let db: Db;
      if (url) {
        db = await createPgDb(url);
      } else {
        if (process.env.VERCEL) throw new GameError("db_missing", "База данных не подключена", 503);
        db = await createPgliteDb(process.env.PGLITE_DIR || undefined);
        log.warn("db.pglite", { message: "DATABASE_URL not set, using in-process PGlite" });
      }
      await migrate(db);
      return db;
    })().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** Errors that are safe to show to the player. */
export class GameError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
