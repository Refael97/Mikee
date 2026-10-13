/**
 * Creates the pilot workspace and its first user.
 * Usage: npm run create-user -- "Business name" "Owner name" email@example.com "password"
 */
import { scryptSync, randomBytes } from "crypto";
import { INIT_SQL } from "../src/lib/db/init-sql";

async function main() {
  const [business, name, email, password] = process.argv.slice(2);
  if (!business || !name || !email || !password) {
    console.error('Usage: npm run create-user -- "Business" "Owner" email "password"');
    process.exit(1);
  }
  const salt = randomBytes(16);
  const hash = `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;

  const run = async (q: (sql: string, params: unknown[]) => Promise<{ id: string }[]>) => {
    const [ws] = await q("INSERT INTO workspaces (name) VALUES ($1) RETURNING id", [business]);
    await q("INSERT INTO users (workspace_id, email, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id", [
      ws.id,
      email.toLowerCase(),
      name,
      hash,
    ]);
    console.log(`Created workspace "${business}" and user ${email}`);
  };

  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL, { prepare: false });
    await sql.unsafe(INIT_SQL);
    await run((q, p) => sql.unsafe(q, p as never[]) as unknown as Promise<{ id: string }[]>);
    await sql.end();
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("fs");
    mkdirSync("./.data", { recursive: true });
    const pg = new PGlite("./.data/pglite");
    await pg.exec(INIT_SQL);
    await run(async (q, p) => (await pg.query<{ id: string }>(q, p)).rows);
    await pg.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
