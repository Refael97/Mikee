/**
 * Shows, for every business connected to Facebook, what its stored token really carries: its type, when Meta
 * issued it, every permission with the assets it covers, and what each asset read answers. Two businesses
 * side by side (one that works, one that does not) show where they differ. The token itself is never printed.
 * Usage (Railway shell of the Mikee service): npm run meta-diagnose            every business
 *                                             npm run meta-diagnose -- רחל    businesses whose name has "רחל"
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { getConnection, type MetaConfig } from "../src/lib/connections";
import { connectDiagnosis } from "../src/lib/meta/diagnose";
import { inspectToken } from "../src/lib/meta/graph";

async function main() {
  const filter = (process.argv[2] ?? "").trim();
  const d = await db();
  const rows = await d.select({ id: schema.workspaces.id, name: schema.workspaces.name }).from(schema.workspaces);
  const businesses = rows.filter((w) => !filter || w.name.includes(filter));
  if (!businesses.length) return console.log(filter ? `No business named like "${filter}".` : "No businesses.");
  for (const w of businesses) {
    const meta = await getConnection<MetaConfig>(w.id, "meta");
    if (!meta?.secret) {
      console.log(`\n=== ${w.name}: no Facebook connection`);
      continue;
    }
    const c = meta.config as MetaConfig & { tokenType?: string; clientBusinessId?: string };
    const info = await inspectToken(meta.secret).catch((e: Error) => {
      console.log(`  could not inspect the token: ${e.message}`);
      return null;
    });
    const report = await connectDiagnosis(meta.secret, info, c.clientBusinessId ?? null);
    console.log(`\n=== ${w.name}`);
    console.log(
      JSON.stringify(
        {
          saved: { connectedAs: c.userName, tokenType: c.tokenType, clientBusinessId: c.clientBusinessId, adAccountId: c.adAccountId, pageId: c.pageId, igUserId: c.igUserId },
          ...report,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
