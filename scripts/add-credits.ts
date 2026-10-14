/**
 * Adds Mikee credits to a business for the current month (a purchase, or a goodwill gesture).
 * Usage: npm run add-credits -- owner@example.com 500 "קנתה חבילת תוספת"
 * The business is found by its owner's email; the credits are recorded in `usage` with the reason.
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
    const [ws] = await q("SELECT w.id, w.name, w.timezone FROM workspaces w JOIN users u ON u.workspace_id = w.id WHERE lower(u.email) = $1 LIMIT 1", [email.toLowerCase()]);
    if (!ws) throw new Error(`No business with a user ${email}`);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ws.timezone || "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    const month = `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
    await q("INSERT INTO usage (workspace_id, kind, month, amount, detail) VALUES ($1, 'topup', $2, $3, $4) RETURNING id", [ws.id, month, amount, JSON.stringify({ reason })]);
    console.log(`Added ${amount} credits to "${ws.name}" for ${month}`);
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
