/**
 * How much of the prompt was read from cache, per day and per agent: read / (read + written + uncached).
 * Compare the days before and after a change to see whether the cache holds.
 * Usage (Railway shell): npm run cache-report          the last 7 days
 *                        npm run cache-report -- 14    the last 14 days
 */
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

async function main() {
  const days = Math.max(1, Math.min(90, Number(process.argv[2] ?? 7) || 7));
  const d = await db();
  const rows = (await d.execute(sql`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, agent, model,
           count(*)::int AS calls,
           sum(input_tokens)::bigint AS uncached, sum(cache_read_tokens)::bigint AS read, sum(cache_write_tokens)::bigint AS written,
           round(sum(cost_usd)::numeric, 2) AS usd
    FROM model_calls
    WHERE created_at > now() - make_interval(days => ${days})
    GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`)) as unknown as { rows?: any[] } | any[];
  const list: any[] = Array.isArray(rows) ? rows : (rows.rows ?? []);
  if (!list.length) return console.log(`No model calls in the last ${days} days.`);
  console.log("day         agent            model              calls   hit%   read      written   uncached  $");
  for (const r of list) {
    const read = Number(r.read), written = Number(r.written), uncached = Number(r.uncached);
    const hit = read + written + uncached ? Math.round((100 * read) / (read + written + uncached)) : 0;
    console.log(
      `${r.day}  ${String(r.agent).padEnd(16)} ${String(r.model).padEnd(18)} ${String(r.calls).padStart(5)}  ${String(hit).padStart(4)}%  ${String(read).padStart(9)} ${String(written).padStart(9)} ${String(uncached).padStart(9)}  ${r.usd}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
