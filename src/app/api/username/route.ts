import { clientIp, guarded, limit } from "@/lib/guard";
import { usernameProblem, usernameTaken } from "@/lib/username";

export const runtime = "nodejs";

/** Live check while typing a username at sign-up: free or taken. Limited per network. */
export const GET = guarded(async (req: Request) => {
  await limit(`uname:${clientIp(req)}`, 60, 600);
  const u = new URL(req.url).searchParams.get("u") ?? "";
  const problem = usernameProblem(u);
  if (problem) return Response.json({ available: false, problem });
  const taken = await usernameTaken(u);
  return Response.json({ available: !taken, problem: taken ? "שם המשתמש תפוס. אפשר לנסות אחר." : null });
});
