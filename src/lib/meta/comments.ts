import "server-only";
import { forgetBusiness, remember } from "../ttl";
import { getSettings, updateSettings } from "../settings";
import { metaContext, type MetaContext } from "./context";
import type { Graph } from "./graph";

export type Platform = "facebook" | "instagram";
export type Comment = { id: string; author: string; text: string; at: string; hidden: boolean; likes: number; liked: boolean; replies: { id: string; author: string; text: string; at: string; mine: boolean }[] };
export type PostComments = { platform: Platform; postId: string; text: string; at: string; link?: string; image?: string; liked?: boolean; comments: Comment[] };

const POSTS = 8;
const PER_POST = 25;

/**
 * The comments on the business's latest Facebook Page posts and Instagram posts, with the business's own
 * replies under each, so the owner can answer, hide, like or delete them in one place.
 */
export async function listComments(workspaceId: string): Promise<PostComments[]> {
  return remember(`comments:${workspaceId}`, 60_000, async () => {
    const ctx = await metaContext(workspaceId);
    const liked = new Set((await getSettings(workspaceId)).likedComments ?? []);
    const [fb, ig] = await Promise.all([ctx.pageId ? facebookComments(ctx, liked).catch(() => []) : [], ctx.igUserId ? instagramComments(ctx, liked).catch(() => []) : []]);
    return [...fb, ...ig].sort((a, b) => b.at.localeCompare(a.at));
  });
}

async function facebookComments(ctx: MetaContext, liked: Set<string>): Promise<PostComments[]> {
  const page = await ctx.graph.forPage(ctx.pageId!);
  const posts = await page.get<{ data: any[] }>(`/${ctx.pageId}/posts`, { fields: "id,message,created_time,permalink_url,full_picture", limit: POSTS });
  return Promise.all(
    (posts.data ?? []).map(async (p) => {
      const list = await page
        .get<{ data: any[] }>(`/${p.id}/comments`, { fields: "id,message,from{id,name},created_time,is_hidden,like_count,comments{id,message,from{id,name},created_time}", limit: PER_POST, order: "reverse_chronological" })
        .catch(() => ({ data: [] as any[] }));
      return {
        platform: "facebook" as const,
        postId: p.id,
        text: p.message ?? "",
        at: p.created_time,
        link: p.permalink_url,
        image: p.full_picture,
        comments: (list.data ?? []).map((c) => ({
          id: c.id,
          author: c.from?.name ?? "",
          text: c.message ?? "",
          at: c.created_time,
          hidden: !!c.is_hidden,
          likes: c.like_count ?? 0,
          liked: liked.has(c.id),
          replies: (c.comments?.data ?? []).map((r: any) => ({ id: r.id, author: r.from?.name ?? "", text: r.message ?? "", at: r.created_time, mine: r.from?.id === ctx.pageId })),
        })),
      };
    }),
  );
}

async function instagramComments(ctx: MetaContext, liked: Set<string>): Promise<PostComments[]> {
  const media = await ctx.graph.get<{ data: any[] }>(`/${ctx.igUserId}/media`, { fields: "id,caption,timestamp,permalink,media_url,thumbnail_url", limit: POSTS });
  return Promise.all(
    (media.data ?? []).map(async (m) => {
      const list = await ctx.graph
        .get<{ data: any[] }>(`/${m.id}/comments`, { fields: "id,text,username,timestamp,hidden,like_count,replies{id,text,username,timestamp}", limit: PER_POST })
        .catch(() => ({ data: [] as any[] }));
      return {
        platform: "instagram" as const,
        postId: m.id,
        text: m.caption ?? "",
        at: m.timestamp,
        link: m.permalink,
        image: m.thumbnail_url ?? m.media_url,
        liked: liked.has(m.id),
        comments: (list.data ?? []).map((c) => ({
          id: c.id,
          author: c.username ?? "",
          text: c.text ?? "",
          at: c.timestamp,
          hidden: !!c.hidden,
          likes: c.like_count ?? 0,
          liked: liked.has(c.id),
          replies: (c.replies?.data ?? []).map((r: any) => ({ id: r.id, author: r.username ?? "", text: r.text ?? "", at: r.timestamp, mine: !!ctx.igUsername && r.username === ctx.igUsername })),
        })),
      };
    }),
  );
}

export type CommentAction =
  | { action: "reply"; id: string; text: string }
  | { action: "hide"; id: string; hidden: boolean }
  | { action: "like"; id: string; liked: boolean }
  | { action: "delete"; id: string }
  | { action: "delete_post"; id: string }
  | { action: "edit_post"; id: string; text: string }
  | { action: "like_post"; id: string; liked: boolean };

/**
 * Runs what the owner clicked. Every id is checked against this business's own posts and comments first, so
 * nothing outside its Page and Instagram account can be touched. Instagram post deletion is Instagram only.
 */
export async function actOnComment(workspaceId: string, a: CommentAction): Promise<void> {
  forgetBusiness(workspaceId);
  const posts = await listComments(workspaceId);
  const ctx = await metaContext(workspaceId);
  try {
    if (a.action === "delete_post" || a.action === "edit_post" || a.action === "like_post") {
      const post = posts.find((p) => p.postId === a.id);
      if (!post) throw new Error("not this business's post");
      const fb = post.platform === "facebook";
      if (a.action === "delete_post") {
        await (fb ? await ctx.graph.forPage(ctx.pageId!) : ctx.graph).delete(`/${post.postId}`);
      } else if (a.action === "edit_post") {
        // Meta edits the text of a Page post; an Instagram caption cannot be changed through the API.
        if (!fb) throw new Error("an Instagram caption cannot be edited");
        await (await ctx.graph.forPage(ctx.pageId!)).post(`/${post.postId}`, { message: a.text });
      } else {
        if (fb) throw new Error("likes on Page posts are not offered");
        await (a.liked ? ctx.graph.post(`/${ctx.igUserId}/likes`, { media_id: post.postId }) : ctx.graph.delete(`/${ctx.igUserId}/likes`, { media_id: post.postId }));
        await rememberLiked(workspaceId, post.postId, a.liked);
      }
      return;
    }
    const post = posts.find((p) => p.comments.some((c) => c.id === a.id || c.replies.some((r) => r.id === a.id && r.mine)));
    if (!post) throw new Error("not a comment on this business's posts");
    const fb = post.platform === "facebook";
    const g: Graph = fb ? await ctx.graph.forPage(ctx.pageId!) : ctx.graph;
    switch (a.action) {
      case "reply":
        await g.post(fb ? `/${a.id}/comments` : `/${a.id}/replies`, { message: a.text });
        break;
      case "hide":
        await g.post(`/${a.id}`, fb ? { is_hidden: a.hidden } : { hide: a.hidden });
        break;
      case "delete":
        await g.delete(`/${a.id}`);
        break;
      case "like": {
        if (fb) await (a.liked ? g.post(`/${a.id}/likes`) : g.delete(`/${a.id}/likes`));
        else await (a.liked ? g.post(`/${ctx.igUserId}/likes`, { comment_id: a.id }) : g.delete(`/${ctx.igUserId}/likes`, { comment_id: a.id }));
        await rememberLiked(workspaceId, a.id, a.liked);
        break;
      }
    }
  } finally {
    forgetBusiness(workspaceId);
  }
}

/** Meta does not say whether the business liked something, so Mikee keeps its own short list. */
async function rememberLiked(workspaceId: string, id: string, liked: boolean) {
  const current = (await getSettings(workspaceId)).likedComments ?? [];
  const next = liked ? [...current.filter((x) => x !== id), id].slice(-500) : current.filter((x) => x !== id);
  await updateSettings(workspaceId, { likedComments: next });
}
