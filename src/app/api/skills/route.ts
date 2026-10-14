import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertSameOrigin, guarded, limit, readJson } from "@/lib/guard";
import { deleteSkill, listSkills, parseSkillFile, saveSkill, setSkillEnabled, SKILL_LIMITS, type Skill, SkillProblem } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const view = (s: Skill) => ({ id: s.id, name: s.name, whenToUse: s.whenToUse, body: s.body, agents: s.agents, enabled: s.enabled, source: s.source, updatedAt: s.updatedAt });

/** The client's skills: list, save, switch, delete, and read an uploaded file into a draft she reviews. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  return Response.json({ skills: (await listSkills(session.workspace.id)).map(view) });
}

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.string().uuid().optional(),
    name: z.string().max(200),
    whenToUse: z.string().max(1000),
    body: z.string().max(SKILL_LIMITS.body * 2),
    agents: z.array(z.string().max(40)).max(10),
    source: z.enum(["written", "file"]).optional(),
  }),
  z.object({ action: z.literal("enabled"), id: z.string().uuid(), enabled: z.boolean() }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  // A file is only read into a draft; nothing is saved until she reviews it and presses save.
  z.object({ action: z.literal("parse"), filename: z.string().max(200), text: z.string().max(SKILL_LIMITS.fileBytes) }),
]);

export const POST = guarded(async (req: Request) => {
  assertSameOrigin(req);
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const ws = session.workspace.id;
  const body = await readJson(req, Action, 64 * 1024);
  await limit(`skills:${ws}`, 60, 3600);
  try {
    switch (body.action) {
      case "save": {
        const { action: _, id, ...input } = body;
        return Response.json({ ok: true, skill: view(await saveSkill(ws, session.user.id, { ...input, id })) });
      }
      case "enabled":
        return Response.json({ ok: await setSkillEnabled(ws, body.id, body.enabled) });
      case "delete":
        return Response.json({ ok: await deleteSkill(ws, body.id) });
      case "parse":
        return Response.json({ ok: true, draft: parseSkillFile(body.text, body.filename) });
    }
  } catch (e) {
    if (e instanceof SkillProblem) return Response.json({ ok: false, error: e.message }, { status: 400 });
    throw e;
  }
});
