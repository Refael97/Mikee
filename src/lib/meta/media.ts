import "server-only";
import { describeError } from "./actions";
import { type MetaContext, metaContext } from "./context";

/**
 * What the business already has in Meta: ad images and videos in the ad account, the creatives of existing
 * ads, and the page's instant lead forms. Separate from the content library (files uploaded to Mikee).
 *
 * Every answer says which of three things happened, so the model never mistakes a failure for "nothing
 * there": ok (with items), empty (the request worked and there is nothing), or error (with the reason).
 * Only the ad account and page the client chose for this business are read.
 */
export type MetaMediaKind = "images" | "videos" | "ads" | "lead_forms";

export type MetaMediaResult = {
  status: "ok" | "empty" | "error";
  kind: MetaMediaKind;
  source?: { adAccountId?: string; adAccountName?: string; pageId?: string; pageName?: string };
  count?: number;
  items?: unknown[];
  error?: string;
};

const FIELDS: Record<Exclude<MetaMediaKind, "lead_forms">, { edge: string; fields: string }> = {
  images: { edge: "adimages", fields: "id,name,hash,url,permalink_url,width,height,created_time,status" },
  videos: { edge: "advideos", fields: "id,title,description,created_time,length,picture,source,permalink_url" },
  ads: {
    edge: "ads",
    fields: "id,name,effective_status,created_time,creative{id,name,title,body,image_hash,image_url,thumbnail_url,video_id,object_story_spec,asset_feed_spec}",
  },
};

export async function metaMedia(workspaceId: string, kind: MetaMediaKind, limit = 50): Promise<MetaMediaResult> {
  let meta: MetaContext;
  try {
    meta = await metaContext(workspaceId);
  } catch (err) {
    return { status: "error", kind, error: (err as Error).message };
  }
  const source = { adAccountId: meta.adAccountId, adAccountName: meta.adAccountName, pageId: meta.pageId, pageName: meta.pageName };
  try {
    let items: Record<string, unknown>[];
    if (kind === "lead_forms") {
      if (!meta.pageId) return { status: "error", kind, source, error: "No Facebook page is chosen for this business. The client picks one in Settings." };
      // Lead forms belong to the page and are read with the page's own token.
      const page = await meta.graph.forPage(meta.pageId);
      items = await page.all(`/${meta.pageId}/leadgen_forms`, { fields: "id,name,status,locale,created_time,questions{key,label,type}" }, limit);
    } else {
      if (!meta.adAccountId) return { status: "error", kind, source, error: "No ad account is chosen for this business. The client picks one in Settings." };
      const { edge, fields } = FIELDS[kind];
      items = await meta.graph.all(`/${meta.adAccountId}/${edge}`, { fields }, limit);
      if (kind === "images") items = items.filter((i) => i.status !== "DELETED");
    }
    return items.length ? { status: "ok", kind, source, count: items.length, items } : { status: "empty", kind, source, count: 0 };
  } catch (err) {
    return { status: "error", kind, source, error: describeError(err) };
  }
}
