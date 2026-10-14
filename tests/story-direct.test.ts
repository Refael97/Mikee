import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MIKEE_TOOLS } from "@/lib/agent/run";
import { runTool } from "@/lib/agent/tools";
import { approveProposal } from "@/lib/proposals";
import { FakeMeta } from "./support/fake-meta";
import { createBusiness, drainJobs, NOW, proposal, TZ } from "./support/setup";

let meta: FakeMeta;
let uninstall: () => void;
beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  meta = new FakeMeta();
  uninstall = meta.install();
});
afterEach(() => uninstall());

describe("a Story straight from Mikee", () => {
  it("a ready video becomes a Story card Mikee makes himself, published as STORIES (not a reel) on approval", async () => {
    expect(MIKEE_TOOLS.map((t) => t.name)).toContain("propose_story");
    const ws = await createBusiness();
    const out = JSON.parse((await runTool({ workspaceId: ws, tz: TZ, agent: "mikee" }, "propose_story", { title: "סטורי לסרטון החדש", media: { type: "video", url: "https://cdn.example/reel.mp4" } })).content);
    const p = await proposal(out.proposalId);
    expect([p.kind, p.status, p.agent, (p.card as any).label]).toEqual(["post", "pending", "mikee", "סטורי"]);
    expect(p.action).toMatchObject({ format: "story", channels: ["instagram"], text: "" });
    expect(meta.writes()).toEqual([]);

    await approveProposal(ws, p.id, p.versionHash);
    await drainJobs();
    expect((await proposal(p.id)).status).toBe("done");
    const containers = meta.writes(/^\/ig_1\/media$/);
    expect(containers).toHaveLength(1);
    expect(containers[0].params).toMatchObject({ media_type: "STORIES", video_url: "https://cdn.example/reel.mp4" });
    expect(containers[0].params.media_type).not.toBe("REELS");
    expect(meta.writes(/^\/ig_1\/media_publish$/)).toHaveLength(1);
  });
});
