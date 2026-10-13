import { getSession } from "@/lib/auth";
import { driveAccessToken } from "@/lib/google";
import { guarded, limit } from "@/lib/guard";

/** What Google's file picker needs in the browser: a one-hour token limited to the files the client picks. */
export const GET = guarded(async () => {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  await limit(`drive-token:${session.workspace.id}`, 30, 3600);
  const token = await driveAccessToken(session.workspace.id);
  if (!token) return Response.json({ error: "Google Drive is not connected" }, { status: 409 });
  return Response.json({ token, apiKey: process.env.GOOGLE_API_KEY ?? "", appId: process.env.GOOGLE_APP_ID ?? "", clientId: process.env.GOOGLE_CLIENT_ID ?? "" });
});
