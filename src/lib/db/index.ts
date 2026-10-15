import "server-only";
import * as schema from "./schema";
import { INIT_SQL } from "./init-sql";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { mikeeDb?: Promise<DB> };

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // "already exists, skipping" notices from the idempotent schema setup are not worth a log line each.
    const client = postgres(url, { prepare: false, max: 5, onnotice: () => {} });
    await client.unsafe(INIT_SQL);
    return drizzle(client, { schema }) as unknown as DB;
  }
  // In production a missing DATABASE_URL is a setup mistake: never fall back to a throwaway local database.
  if (process.env.NODE_ENV === "production" && process.env.MIKEE_DB !== "pglite") {
    throw new Error("DATABASE_URL is not set. On Railway: Mikee service → Variables → add DATABASE_URL = ${{Postgres.DATABASE_URL}}");
  }
  // Local development and tests: embedded Postgres, persisted under ./.data (or in memory for tests)
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  let client;
  if (process.env.MIKEE_DB === "memory") {
    client = new PGlite();
  } else {
    const { mkdirSync } = await import("fs");
    mkdirSync("./.data", { recursive: true });
    client = new PGlite("./.data/pglite");
  }
  await client.exec(INIT_SQL);
  return drizzle(client, { schema }) as unknown as DB;
}

export function db(): Promise<DB> {
  globalForDb.mikeeDb ??= connect();
  return globalForDb.mikeeDb;
}

/** Tests only: start from an empty database. */
export function resetDbForTests() {
  globalForDb.mikeeDb = undefined;
}

export { schema };
