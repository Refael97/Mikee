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
  /** Pass back as `after` for the next page; absent on the last page. */
  next?: string;
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

const first = <T>(list: T[] | undefined, n = 5) => (list?.length ? list.slice(0, n) : undefined);

/** An existing ad, reduced to what reusing it needs: its texts, link, button and media (hashes, ids, URLs). */
function compactAd(ad: any) {
  const c = ad.creative ?? {};
  const story = c.object_story_spec ?? {};
  const link = story.link_data ?? {};
  const video = story.video_data ?? {};
  const feed = c.asset_feed_spec ?? {};
  return {
    id: ad.id,
    name: ad.name,
    status: ad.effective_status,
    created: ad.created_time,
    creativeId: c.id,
    text: c.body ?? link.message ?? video.message ?? first(feed.bodies?.map((b: any) => b.text), 3),
    headline: c.title ?? link.name ?? video.title ?? first(feed.titles?.map((t: any) => t.text), 3),
    link: link.link ?? video.call_to_action?.value?.link ?? first(feed.link_urls?.map((l: any) => l.website_url), 2),
    cta: link.call_to_action?.type ?? video.call_to_action?.type ?? first(feed.call_to_action_types, 2),
    imageHash: c.image_hash ?? link.image_hash ?? video.image_hash,
    imageUrl: c.image_url ?? c.thumbnail_url ?? link.picture ?? video.image_url,
    videoId: c.video_id ?? video.video_id,
    feedImages: first(feed.images?.map((i: any) => i.hash)),
    feedVideos: first(feed.videos?.map((v: any) => v.video_id)),
  };
}

export async function metaMedia(workspaceId: string, kind: MetaMediaKind, limit = 25, after?: string): Promise<MetaMediaResult> {
  let meta: MetaContext;
  try {
    meta = await metaContext(workspaceId);
  } catch (err) {
    return { status: "error", kind, error: (err as Error).message };
  }
  const source = { adAccountId: meta.adAccountId, adAccountName: meta.adAccountName, pageId: meta.pageId, pageName: meta.pageName };
  try {
    type Page = { data?: Record<string, unknown>[]; paging?: { next?: string; cursors?: { after?: string } } };
    let page: Page;
    // One page at a time, so a long list never overflows the answer; `next` continues it.
    const paging = { limit: Math.min(limit, kind === "ads" ? 25 : 50), ...(after ? { after } : {}) };
    if (kind === "lead_forms") {
      if (!meta.pageId) return { status: "error", kind, source, error: "No Facebook page is chosen for this business. The client picks one in Settings." };
      // Lead forms belong to the page and are read with the page's own token.
      const pageGraph = await meta.graph.forPage(meta.pageId);
      page = await pageGraph.get(`/${meta.pageId}/leadgen_forms`, { fields: "id,name,status,locale,created_time,questions{key,label,type}", ...paging });
    } else {
      if (!meta.adAccountId) return { status: "error", kind, source, error: "No ad account is chosen for this business. The client picks one in Settings." };
      const { edge, fields } = FIELDS[kind];
      page = await meta.graph.get(`/${meta.adAccountId}/${edge}`, { fields, ...paging });
    }
    let items: unknown[] = page.data ?? [];
    if (kind === "images") items = items.filter((i: any) => i.status !== "DELETED");
    if (kind === "ads") items = items.map(compactAd);
    const next = page.paging?.next ? page.paging.cursors?.after : undefined;
    if (!items.length && !next) return { status: "empty", kind, source, count: 0 };
    return { status: "ok", kind, source, count: items.length, items, ...(next ? { next } : {}) };
  } catch (err) {
    return { status: "error", kind, source, error: describeError(err) };
  }
}
