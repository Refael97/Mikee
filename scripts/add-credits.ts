/**
 * Adds credits a business bought (or was given), after it asked. Nothing is ever bought automatically.
 * Usage: npm run add-credits -- owner@example.com 500 "קנתה חבילת תוספת"
 * They are used after the cycle's included quota and stay valid MIKEE_PURCHASED_CREDITS_MONTHS months
 * (default 12; 0 = no expiry), across cycles.
 */
import { INIT_SQL } from "../src/lib/db/init-sql";

async function main() {
  const [email, amountText, reason = "added by admin"] = process.argv.slice(2);
  const amount = Number(amountText);
  if (!email || !Number.isFinite(amount) || amount <= 0) {
    console.error('Usage: npm run add-credits -- owner@example.com 500 "reason"');
    process.exit(1);
  }
  const run = async (q: (sql: string, params: unknown[]) => Promise<Record<string, string>[]>) => {
    const [ws] = await q("SELECT w.id, w.name FROM workspaces w JOIN users u ON u.workspace_id = w.id WHERE lower(u.email) = $1 LIMIT 1", [email.toLowerCase()]);
    if (!ws) throw new Error(`No business with a user ${email}`);
    const months = Number(process.env.MIKEE_PURCHASED_CREDITS_MONTHS ?? 12);
    const expires = months > 0 ? new Date(Date.now() + months * 30.44 * 86_400_000).toISOString() : null;
    await q("INSERT INTO credit_purchases (workspace_id, amount, reason, expires_at) VALUES ($1, $2, $3, $4) RETURNING id", [ws.id, amount, reason, expires]);
    console.log(`Added ${amount} credits to "${ws.name}"${expires ? `, valid until ${expires.slice(0, 10)}` : ""}`);
  };

  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL, { prepare: false });
    await sql.unsafe(INIT_SQL);
    await run((q, p) => sql.unsafe(q, p as never[]) as unknown as Promise<Record<string, string>[]>);
    await sql.end();
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite("./.data/pglite");
    await pg.exec(INIT_SQL);
    await run(async (q, p) => (await pg.query<Record<string, string>>(q, p)).rows);
    await pg.close();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
