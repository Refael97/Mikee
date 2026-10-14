import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { metaContext } from "@/lib/meta/context";

export const dynamic = "force-dynamic";

/**
 * The business's profile picture for post and ad previews: Instagram's when connected, else the Facebook
 * page's. Meta's picture links expire, so the current one is looked up and the browser is sent to it.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  try {
    const meta = await metaContext(session.workspace.id);
    let url: string | undefined;
    if (meta.igUserId) url = (await meta.graph.get<{ profile_picture_url?: string }>(`/${meta.igUserId}`, { fields: "profile_picture_url" })).profile_picture_url;
    if (!url && meta.pageId) url = (await meta.graph.get<{ data?: { url?: string } }>(`/${meta.pageId}/picture`, { redirect: 0, type: "large" })).data?.url;
    if (!url || !/^https:\/\//.test(url)) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
