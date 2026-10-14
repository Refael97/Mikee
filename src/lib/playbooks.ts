import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { SPECIALISTS } from "./agent/specialists";

/**
 * Each specialist has a working file per business: the "README" Mikee writes for it before it ever works for
 * this client, and keeps improving. The specialist reads it at the start of every task; only Mikee writes it.
 * Every change is a new version with its reason, so nothing learned is lost and any change can be traced.
 */
export const PLAYBOOK_MAX = 8000;
export const LESSONS = "## לקחים מהלקוח";

/** The shape Mikee writes each playbook in. */
export const PLAYBOOK_TEMPLATE = `# <התפקיד> בשביל <שם העסק>
## הלקוח בשבילך
מי העסק, למי הוא מוכר, מה חשוב לבעלים, הטון והמראה של המותג, מה אסור.
## הוראות עבודה
איך לעשות את העבודה הזאת בשביל העסק הזה: סגנון, אורך, מבנה, צבעים, מה תמיד ומה אף פעם.
## מה עובד
מה הלקוח אישר ואהב, ומה הביא תוצאות (עם מספרים כשיש).
${LESSONS}
- <תאריך>: <מה הלקוח לא אהב או ביקש אחרת, ומה עושים מעכשיו>`;

export const agentIds = () => SPECIALISTS.map((s) => s.id) as string[];

export class PlaybookProblem extends Error {}

export async function getPlaybook(workspaceId: string, agent: string) {
  const d = await db();
  return d.query.agentPlaybooks.findFirst({ where: and(eq(schema.agentPlaybooks.workspaceId, workspaceId), eq(schema.agentPlaybooks.agent, agent)) });
}

export async function listPlaybooks(workspaceId: string) {
  const d = await db();
  return d.select().from(schema.agentPlaybooks).where(eq(schema.agentPlaybooks.workspaceId, workspaceId));
}

export async function playbookHistory(workspaceId: string, agent: string, limit = 10) {
  const d = await db();
  return d
    .select({ version: schema.agentPlaybookHistory.version, reason: schema.agentPlaybookHistory.reason, createdAt: schema.agentPlaybookHistory.createdAt })
    .from(schema.agentPlaybookHistory)
    .where(and(eq(schema.agentPlaybookHistory.workspaceId, workspaceId), eq(schema.agentPlaybookHistory.agent, agent)))
    .orderBy(desc(schema.agentPlaybookHistory.version))
    .limit(limit);
}

/** Replaces the whole playbook (preparing it, or consolidating it). */
export async function writePlaybook(workspaceId: string, agent: string, content: string, reason: string) {
  if (!agentIds().includes(agent)) throw new PlaybookProblem(`Unknown team member "${agent}". Use one of: ${agentIds().join(", ")}.`);
  const text = content.replace(/\r\n/g, "\n").trim();
  if (text.length < 40) throw new PlaybookProblem("The playbook is too short to guide anyone. Write the sections of the template.");
  if (text.length > PLAYBOOK_MAX) throw new PlaybookProblem(`The playbook is ${text.length} characters; keep it under ${PLAYBOOK_MAX}. Merge lessons into the standing instructions and drop what no longer applies.`);
  const d = await db();
  return d.transaction(async (tx) => {
    const old = await tx.query.agentPlaybooks.findFirst({ where: and(eq(schema.agentPlaybooks.workspaceId, workspaceId), eq(schema.agentPlaybooks.agent, agent)) });
    const version = (old?.version ?? 0) + 1;
    if (old) {
      await tx
        .update(schema.agentPlaybooks)
        .set({ content: text, version, updatedAt: new Date() })
        .where(and(eq(schema.agentPlaybooks.workspaceId, workspaceId), eq(schema.agentPlaybooks.agent, agent)));
    } else {
      await tx.insert(schema.agentPlaybooks).values({ workspaceId, agent, content: text, version });
    }
    await tx.insert(schema.agentPlaybookHistory).values({ workspaceId, agent, version, content: text, reason: reason.slice(0, 300) });
    return { agent, version, length: text.length };
  });
}

/** Adds one dated lesson under the lessons section, keeping everything else as it is. */
export async function addLesson(workspaceId: string, agent: string, lesson: string, reason: string, tz = "Asia/Jerusalem") {
  const old = await getPlaybook(workspaceId, agent);
  if (!old) throw new PlaybookProblem(`There is no playbook for ${agent} yet. Write it first (action "write"), with this lesson in it.`);
  const date = new Intl.DateTimeFormat("he-IL", { timeZone: tz, day: "numeric", month: "numeric", year: "2-digit" }).format(new Date());
  const line = `- ${date}: ${lesson.replace(/\s+/g, " ").trim()}`;
  const content = old.content.includes(LESSONS) ? `${old.content.trimEnd()}\n${line}` : `${old.content.trimEnd()}\n\n${LESSONS}\n${line}`;
  return writePlaybook(workspaceId, agent, content, reason);
}

/** For Mikee's brief: whose file is ready, how fresh, and who still has none. */
export async function playbookStatus(workspaceId: string) {
  const rows = await listPlaybooks(workspaceId);
  const lines = SPECIALISTS.map((s) => {
    const r = rows.find((x) => x.agent === s.id);
    return r ? `- ${s.id}: version ${r.version}, updated ${r.updatedAt.toISOString().slice(0, 10)}` : `- ${s.id}: NO PLAYBOOK YET`;
  });
  return lines.join("\n");
}
