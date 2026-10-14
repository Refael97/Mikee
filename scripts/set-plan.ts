/**
 * Sets a business's AI plan, its human guidance add-on and the day its billing cycle starts.
 * Usage: npm run set-plan -- owner@example.com ai_499 [monthly|weekly|none] [YYYY-MM-DD]
 * The included credits come from the plan (src/lib/plans.ts, MIKEE_PLAN_CREDITS); guidance does not change them.
 */
import { INIT_SQL } from "../src/lib/db/init-sql";

async function main() {
  const [email, plan, guidance = "none", anchor] = process.argv.slice(2);
  if (!email || !["ai_299", "ai_499"].includes(plan) || !["monthly", "weekly", "none"].includes(guidance) || (anchor && !/^\d{4}-\d{2}-\d{2}$/.test(anchor))) {
    console.error("Usage: npm run set-plan -- owner@example.com ai_299|ai_499 [monthly|weekly|none] [YYYY-MM-DD]");
    process.exit(1);
  }
  const run = async (q: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>) => {
    const [ws] = await q("SELECT w.id, w.name, w.settings FROM workspaces w JOIN users u ON u.workspace_id = w.id WHERE lower(u.email) = $1 LIMIT 1", [email.toLowerCase()]);
    if (!ws) throw new Error(`No business with a user ${email}`);
    const settings: Record<string, unknown> = { ...((ws.settings as Record<string, unknown>) ?? {}), plan, ...(anchor ? { billingAnchor: anchor } : {}) };
    if (guidance === "none") delete settings.guidance;
    else settings.guidance = guidance;
    await q("UPDATE workspaces SET settings = $2 WHERE id = $1 RETURNING id", [ws.id, JSON.stringify(settings)]);
    console.log(`"${ws.name}": ${plan}, guidance ${guidance}${anchor ? `, cycle from the ${anchor.slice(8)} of each month` : ""}`);
  };

  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL, { prepare: false });
    await sql.unsafe(INIT_SQL);
    await run((q, p) => sql.unsafe(q, p as never[]) as unknown as Promise<Record<string, unknown>[]>);
    await sql.end();
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite("./.data/pglite");
    await pg.exec(INIT_SQL);
    await run(async (q, p) => (await pg.query<Record<string, unknown>>(q, p)).rows);
    await pg.close();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
