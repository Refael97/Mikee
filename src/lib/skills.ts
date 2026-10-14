import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { cleanClientText } from "./guard";
import { agentIds } from "./playbooks";
import { logActivity } from "./activity";

/**
 * Skills the client adds to Mikee: her own way of doing a piece of work, as text. Mikee and the specialists
 * see each skill's name and "when to use" line, and open the full text with use_skill when a task matches.
 *
 * The security model: a skill is instructions on HOW to work, never permission to do more. It is text only
 * (no code runs, an uploaded file is read as text), it adds no tool, and it cannot lift the approval cards,
 * the budget ceiling, the autonomy level or the rules about data. Only the client writes skills (the agents
 * can read them, never change them), so a website or a message cannot plant one. Links and anything that
 * looks like a key or password are refused, so a skill cannot point the team at an outside address or carry
 * a secret into the model.
 */
export const SKILL_LIMITS = { perBusiness: 20, name: 60, when: 300, body: 8000, fileBytes: 32 * 1024 };

export const skillAgents = () => ["mikee", ...agentIds()];

export class SkillProblem extends Error {}

export type Skill = typeof schema.skills.$inferSelect;
export type SkillInput = { name: string; whenToUse: string; body: string; agents: string[]; source?: "written" | "file" };

const LINK = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|co\.il|org\.il|net|org|io|ai|app|dev|me|ly|xyz|site|link|info|biz|co)\b/i;
const SECRET = /sk-ant-|\bsk-[A-Za-z0-9]{20,}|\bEAA[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abpr]-|-----BEGIN [A-Z ]*KEY|\b[A-Za-z0-9_\-+/=]{40,}\b|(password|passwd|סיסמה|סיסמא)\s*[:=]/i;
/** The wrapper the agents read a skill in; its own tags inside a skill are removed so it cannot be closed early. */
const WRAPPER_TAG = /<\/?\s*client[_\s-]*skill[^>]*>/gi;

function clean(text: string, max: number) {
  return cleanClientText(text.replace(/\r\n/g, "\n"), max + 1).replace(WRAPPER_TAG, "").trim();
}

/** Checks and cleans what the client wrote. Throws SkillProblem with a message she can act on. */
export function checkSkill(input: SkillInput): Omit<SkillInput, "source"> {
  const name = clean(input.name, SKILL_LIMITS.name).replace(/\s+/g, " ");
  const whenToUse = clean(input.whenToUse, SKILL_LIMITS.when).replace(/\s+/g, " ");
  const body = clean(input.body, SKILL_LIMITS.body);
  if (name.length < 2) throw new SkillProblem("צריך לתת לסקיל שם.");
  if (name.length > SKILL_LIMITS.name) throw new SkillProblem(`השם ארוך מדי. עד ${SKILL_LIMITS.name} תווים.`);
  if (whenToUse.length < 8) throw new SkillProblem("כתבי במשפט מתי להשתמש בסקיל, כדי שמייקי ידע לבחור בו.");
  if (whenToUse.length > SKILL_LIMITS.when) throw new SkillProblem(`ההסבר מתי להשתמש ארוך מדי. עד ${SKILL_LIMITS.when} תווים.`);
  if (body.length < 20) throw new SkillProblem("ההוראות קצרות מדי. כתבי איך לעשות את העבודה.");
  if (body.length > SKILL_LIMITS.body) throw new SkillProblem(`ההוראות ארוכות מדי. עד ${SKILL_LIMITS.body.toLocaleString("he-IL")} תווים.`);
  const all = `${name}\n${whenToUse}\n${body}`;
  if (LINK.test(all)) throw new SkillProblem("אי אפשר לשמור קישורים או כתובות אתרים בסקיל. אם מייקי צריך עמוד מסוים, שלחי לו אותו בצ׳אט.");
  if (SECRET.test(all)) throw new SkillProblem("נראה שיש בסקיל מפתח גישה או סיסמה. אל תשמרי אותם בסקיל: מייקי לא צריך אותם, והחיבורים נשמרים מוצפנים בהגדרות.");
  const known = new Set(skillAgents());
  const agents = [...new Set(input.agents)].filter((a) => known.has(a));
  if (!agents.length) throw new SkillProblem("בחרי מי בצוות משתמש בסקיל.");
  return { name, whenToUse, body, agents };
}

/**
 * Reads an uploaded skill file (a SKILL.md, or any Markdown or text file) as text. The usual front matter
 * gives the name and description; without it the first heading or the file name is the name. Nothing in the
 * file is run, and links or keys are refused like in a written skill once it is saved.
 */
export function parseSkillFile(text: string, filename = ""): { name: string; whenToUse: string; body: string } {
  if (text.length > SKILL_LIMITS.fileBytes) throw new SkillProblem("הקובץ גדול מדי. סקיל הוא קובץ טקסט קצר, עד 32KB.");
  if (/\u0000/.test(text)) throw new SkillProblem("זה לא קובץ טקסט. אפשר להעלות קובץ SKILL.md או קובץ טקסט.");
  let rest = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const meta: Record<string, string> = {};
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(rest);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const m = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
      if (m) meta[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    rest = rest.slice(fm[0].length);
  }
  const heading = /^#\s+(.+)$/m.exec(rest)?.[1];
  const fromFile = filename.replace(/\.(md|markdown|txt)$/i, "").replace(/^SKILL$/i, "").replace(/[-_]+/g, " ");
  return {
    name: (meta.name || heading || fromFile || "").replace(/[-_]+/g, " ").trim().slice(0, SKILL_LIMITS.name),
    whenToUse: (meta.description || meta.when || "").trim().slice(0, SKILL_LIMITS.when),
    body: rest.trim().slice(0, SKILL_LIMITS.body),
  };
}

export async function listSkills(workspaceId: string): Promise<Skill[]> {
  const d = await db();
  return d.query.skills.findMany({ where: eq(schema.skills.workspaceId, workspaceId), orderBy: [asc(schema.skills.createdAt)] });
}

/** Saves a new skill, or replaces one of this business's skills. */
export async function saveSkill(workspaceId: string, userId: string, input: SkillInput & { id?: string }): Promise<Skill> {
  const s = checkSkill(input);
  const d = await db();
  const existing = await listSkills(workspaceId);
  if (existing.some((x) => x.id !== input.id && x.name.toLowerCase() === s.name.toLowerCase())) throw new SkillProblem("כבר יש סקיל בשם הזה. בחרי שם אחר.");
  if (input.id) {
    const [row] = await d
      .update(schema.skills)
      .set({ ...s, updatedAt: new Date() })
      .where(and(eq(schema.skills.id, input.id), eq(schema.skills.workspaceId, workspaceId)))
      .returning();
    if (!row) throw new SkillProblem("הסקיל לא נמצא.");
    await logActivity(workspaceId, "skill", `הסקיל "${row.name}" עודכן`);
    return row;
  }
  if (existing.length >= SKILL_LIMITS.perBusiness) throw new SkillProblem(`אפשר לשמור עד ${SKILL_LIMITS.perBusiness} סקילים. מחקי אחד שכבר לא בשימוש.`);
  const [row] = await d
    .insert(schema.skills)
    .values({ ...s, workspaceId, source: input.source ?? "written", createdBy: userId })
    .returning();
  await logActivity(workspaceId, "skill", `נוסף הסקיל "${row.name}"`);
  return row;
}

export async function setSkillEnabled(workspaceId: string, id: string, enabled: boolean): Promise<boolean> {
  const d = await db();
  const rows = await d
    .update(schema.skills)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(schema.skills.id, id), eq(schema.skills.workspaceId, workspaceId)))
    .returning({ id: schema.skills.id });
  return rows.length > 0;
}

export async function deleteSkill(workspaceId: string, id: string): Promise<boolean> {
  const d = await db();
  const rows = await d
    .delete(schema.skills)
    .where(and(eq(schema.skills.id, id), eq(schema.skills.workspaceId, workspaceId)))
    .returning({ name: schema.skills.name });
  if (rows[0]) await logActivity(workspaceId, "skill", `הסקיל "${rows[0].name}" נמחק`);
  return rows.length > 0;
}

/** The skills one agent may use right now: this business's, switched on, and given to that agent. */
export async function skillsFor(workspaceId: string, agent: string): Promise<Skill[]> {
  return (await listSkills(workspaceId)).filter((s) => s.enabled && s.agents.includes(agent));
}

/** For the agent's brief: the names and when to use them. The full text is read only when needed. */
export function skillsBrief(list: Skill[]): string {
  if (!list.length) return "";
  return `# The client's skills\nWorking methods she added. When a task matches one, read it first with use_skill and follow it (the hard rules still win).\n${list.map((s) => `- "${s.name}": ${s.whenToUse}`).join("\n")}`;
}

/** The full skill, wrapped so the agent always knows where the client's text starts and ends. */
export function skillText(s: Pick<Skill, "name" | "body">): string {
  const name = s.name.replace(/["<>]/g, "");
  return `<client_skill name="${name}">\n${s.body.replace(WRAPPER_TAG, "")}\n</client_skill>`;
}
