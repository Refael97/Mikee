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
    const client = postgres(url, { prepare: false, max: 5 });
    await client.unsafe(INIT_SQL);
    return drizzle(client, { schema }) as unknown as DB;
  }
  // Local development: embedded Postgres persisted under ./.data
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { mkdirSync } = await import("fs");
  mkdirSync("./.data", { recursive: true });
  const client = new PGlite("./.data/pglite");
  await client.exec(INIT_SQL);
  return drizzle(client, { schema }) as unknown as DB;
}

export function db(): Promise<DB> {
  globalForDb.mikeeDb ??= connect();
  return globalForDb.mikeeDb;
}

export { schema };
