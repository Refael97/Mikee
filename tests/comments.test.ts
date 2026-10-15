import { beforeEach, describe, expect, it } from "vitest";
import { actOnComment, listComments } from "@/lib/meta/comments";
import { checkMetaWrite } from "@/lib/agent/tools";
import { forgetBusiness } from "@/lib/ttl";
import { FakeMeta } from "./support/fake-meta";
import { createBusiness } from "./support/setup";

let meta: FakeMeta;
let uninstall: (() => void) | undefined;
beforeEach(() => {
  uninstall?.();
  meta = new FakeMeta();
  uninstall = meta.install();
});

function seed() {
  const fbPost = meta.add("fbpost", { message: "קולקציית ערב חדשה" });
  const fbComment = meta.add("fbcomment", { parent: fbPost.id, message: "יש במידה 38?", from: { id: "u1", name: "דנה" } });
  const igPost = meta.add("igpost", { caption: "שמלת שבת" });
  const igComment = meta.add("igcomment", { parent: igPost.id, text: "מהמם! כמה עולה?", username: "dana.k" });
  return { fbPost, fbComment, igPost, igComment };
}

describe("comments on the business's posts", () => {
  it("lists Facebook and Instagram comments together, newest posts first", async () => {
    const ws = await createBusiness();
    seed();
    const posts = await listComments(ws);
    expect(posts.map((p) => p.platform).sort()).toEqual(["facebook", "instagram"]);
    expect(posts.flatMap((p) => p.comments.map((c) => c.text))).toEqual(expect.arrayContaining(["יש במידה 38?", "מהמם! כמה עולה?"]));
  });

  it("replies, likes, hides and deletes through the right endpoint for each network", async () => {
    const ws = await createBusiness();
    const { fbComment, igComment } = seed();

    await actOnComment(ws, { action: "reply", id: fbComment.id, text: "כן, יש" });
    await actOnComment(ws, { action: "reply", id: igComment.id, text: "390 ש״ח" });
    expect(meta.list("fbreply")[0].message).toBe("כן, יש");
    expect(meta.list("igreply")[0].text).toBe("390 ש״ח");

    await actOnComment(ws, { action: "like", id: igComment.id, liked: true });
    expect(meta.calls.some((c) => c.method === "POST" && c.path.endsWith("/ig_1/likes") && c.params.comment_id === igComment.id)).toBe(true);
    await actOnComment(ws, { action: "like", id: fbComment.id, liked: true });
    forgetBusiness(ws);
    const liked = (await listComments(ws)).flatMap((p) => p.comments).filter((c) => c.liked).map((c) => c.id);
    expect(liked.sort()).toEqual([fbComment.id, igComment.id].sort());

    await actOnComment(ws, { action: "hide", id: igComment.id, hidden: true });
    expect(meta.calls.some((c) => c.method === "POST" && c.path.endsWith(`/${igComment.id}`) && c.params.hide === "true")).toBe(true);
    await actOnComment(ws, { action: "hide", id: fbComment.id, hidden: true });
    expect(meta.calls.some((c) => c.method === "POST" && c.path.endsWith(`/${fbComment.id}`) && c.params.is_hidden === "true")).toBe(true);

    await actOnComment(ws, { action: "delete", id: fbComment.id });
    forgetBusiness(ws);
    expect((await listComments(ws)).flatMap((p) => p.comments).map((c) => c.id)).not.toContain(fbComment.id);
  });

  it("deletes an Instagram post of the business, and nothing that is not its own", async () => {
    const ws = await createBusiness();
    const { igPost, fbPost } = seed();
    const stranger = meta.add("igcomment", { parent: "someone_elses_post", text: "x", username: "x" });
    await expect(actOnComment(ws, { action: "delete", id: stranger.id })).rejects.toThrow();
    await expect(actOnComment(ws, { action: "delete_post", id: fbPost.id })).rejects.toThrow();
    await actOnComment(ws, { action: "delete_post", id: igPost.id });
    expect(meta.calls.some((c) => c.method === "DELETE" && c.path.endsWith(`/${igPost.id}`))).toBe(true);
  });

  it("an upcoming event can be set up only on the business's own Instagram account", () => {
    const assets = { instagram: "17841400000000001" };
    expect(checkMetaWrite("/17841400000000001/upcoming_events", { title: "השקת קולקציית חורף", start_time: "2026-11-20T18:00:00+02:00" }, assets)).toBeNull();
    expect(checkMetaWrite("/17841499999999999/upcoming_events", { title: "x", start_time: "2026-11-20T18:00:00+02:00" }, assets)).toMatch(/does not belong/);
    expect(checkMetaWrite("/17841400000000001/upcoming_events", { title: "x", status: "ACTIVE" }, assets)).toMatch(/not allowed/);
  });
});
