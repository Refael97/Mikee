import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { metaContext } from "@/lib/meta/context";

export const dynamic = "force-dynamic";

/**
 * Previews of media that live in the business's ad account. Meta's file links expire, so the card keeps
 * the image hash or video id and this looks up a fresh link each time: ?image=<hash>, ?video=<id>, and
 * ?video=<id>&poster=1 for the frame Meta shows before playing. Only this business's account is read.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const q = new URL(req.url).searchParams;
  const image = q.get("image");
  const video = q.get("video");
  try {
    const meta = await metaContext(session.workspace.id);
    let url: string | undefined;
    if (image && /^[A-Za-z0-9]{8,64}$/.test(image) && meta.adAccountId) {
      const r = await meta.graph.get<{ data?: { url?: string; permalink_url?: string }[] }>(`/${meta.adAccountId}/adimages`, { hashes: JSON.stringify([image]), fields: "url,permalink_url" });
      url = r.data?.[0]?.url ?? r.data?.[0]?.permalink_url;
    } else if (video && /^\d{5,25}$/.test(video) && meta.adAccountId) {
      // Read with this business's own connection only.
      const v = await meta.graph.get<{ source?: string; picture?: string }>(`/${video}`, { fields: "source,picture" });
      url = q.get("poster") ? v.picture : (v.source ?? v.picture);
    }
    if (!url || !/^https:\/\//.test(url)) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
