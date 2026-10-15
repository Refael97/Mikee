/**
 * The intro meetings booked from the site (mikee.co.il/meeting), soonest first.
 * Usage: npm run meetings                  (list)
 *        npm run meetings -- confirm 12    (mark as confirmed)
 *        npm run meetings -- cancel 12     (cancel; the hour opens again on the site)
 */
import { INIT_SQL } from "../src/lib/db/init-sql";
import { slotLabel } from "../src/lib/meetings";

async function main() {
  const [action, idArg] = process.argv.slice(2);
  if (action && !["confirm", "cancel"].includes(action)) {
    console.error("Usage: npm run meetings [-- confirm|cancel <id>]");
    process.exit(1);
  }
  const run = async (q: (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>) => {
    if (action) {
      const id = Number(idArg);
      if (!Number.isInteger(id)) throw new Error("Usage: npm run meetings -- confirm|cancel <id>");
      const rows = await q("UPDATE meeting_requests SET status = $2 WHERE id = $1 RETURNING id", [id, action === "confirm" ? "confirmed" : "cancelled"]);
      console.log(rows.length ? `#${id}: ${action === "confirm" ? "confirmed" : "cancelled"}` : `No meeting #${id}`);
      return;
    }
    const rows = await q("SELECT * FROM meeting_requests ORDER BY slot", []);
    if (!rows.length) return console.log("No meetings yet.");
    for (const r of rows) {
      console.log(`#${r.id} [${r.status}] ${slotLabel(String(r.slot))} · ${r.name}, ${r.business} · ${r.plan} · ${r.phone} · ${r.email}${r.link ? ` · ${r.link}` : ""}${r.notes ? `\n    ${r.notes}` : ""}`);
    }
  };

  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL, { prepare: false, onnotice: () => {} });
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
