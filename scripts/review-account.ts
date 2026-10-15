/**
 * A sign-in for Meta's App Review: a separate business ("Meta Review") whose Facebook connection is copied from
 * a business that works, with a low monthly budget so nothing a reviewer approves can spend real money beyond it.
 * The password is random and printed once, here in the shell; it is never stored in plain text.
 * Usage (Railway shell): npm run review-account -- mikee            copy the connection of the business "mikee"
 *                        npm run review-account -- mikee --reset    new password for the existing review user
 */
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { hashPassword } from "../src/lib/crypto";

const EMAIL = "meta-review@mikee.co.il";
const NAME = "Meta Review";
const BUDGET = 50; // a month, in the source account's currency: the hard ceiling for anything the reviewer approves

async function main() {
  const from = (process.argv[2] ?? "").trim();
  const reset = process.argv.includes("--reset");
  const d = await db();
  const password = randomBytes(12).toString("base64url");

  const existing = await d.query.users.findFirst({ where: eq(schema.users.email, EMAIL) });
  if (existing) {
    if (!reset) return console.log(`The review account already exists (${EMAIL}). Add --reset for a new password.`);
    await d.update(schema.users).set({ passwordHash: hashPassword(password), sessionVersion: existing.sessionVersion + 1 }).where(eq(schema.users.id, existing.id));
    return print(password);
  }
  if (!from) return console.log('Name the business whose Facebook connection the reviewers should use: npm run review-account -- mikee');

  const source = (await d.select().from(schema.workspaces)).find((w) => w.name === from) ?? (await d.select().from(schema.workspaces)).find((w) => w.name.includes(from));
  if (!source) return console.log(`No business named like "${from}".`);
  const conns = await d.select().from(schema.connections).where(eq(schema.connections.workspaceId, source.id));
  const meta = conns.find((c) => c.provider === "meta");
  if (!meta?.secret) return console.log(`${source.name} has no Facebook connection to copy.`);

  const [ws] = await d.insert(schema.workspaces).values({ name: NAME, stage: "active", timezone: source.timezone }).returning();
  for (const c of conns.filter((c) => c.provider === "meta" || c.provider === "website")) {
    await d.insert(schema.connections).values({ workspaceId: ws.id, provider: c.provider, config: c.config, secret: c.secret, status: c.status });
  }
  const currency = String((meta.config as { currency?: string }).currency ?? "ILS");
  await d.insert(schema.budgets).values({ workspaceId: ws.id, monthlyLimit: BUDGET, currency });
  await d.insert(schema.users).values({ workspaceId: ws.id, email: EMAIL, name: NAME, passwordHash: hashPassword(password) });
  console.log(`Created "${NAME}" with the Facebook connection of "${source.name}" and a monthly budget of ${BUDGET} ${currency}.`);
  print(password);
}

function print(password: string) {
  console.log(`\nSign in for the reviewers (paste into App Review, then clear this screen):\n  user: ${EMAIL}\n  password: ${password}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
