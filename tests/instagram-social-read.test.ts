import { afterEach, expect, it, vi } from "vitest";
import { TOOLS } from "@/lib/agent/tools";
import * as contexts from "@/lib/meta/context";
import { Graph } from "@/lib/meta/graph";

vi.mock("@/lib/meta/context", async importOriginal => ({ ...await importOriginal<typeof contexts>(), metaContext: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it.each(["read_stories", "read_organic_insights"])("%s resolves only the current workspace's Instagram account", async name => {
  const graph = new Graph("own-token");
  const all = vi.spyOn(graph, "all").mockResolvedValue([{ id: "own-data" }]);
  vi.mocked(contexts.metaContext).mockResolvedValue({ graph, igUserId: "own-instagram" });
  const tool = TOOLS.find(t => t.name === name)!;
  const input = tool.input.parse({ accountId: "foreign-account" });
  await expect(tool.run({ workspaceId: "own-workspace", tz: "Asia/Jerusalem" }, input)).resolves.toEqual([{ id: "own-data" }]);
  expect(contexts.metaContext).toHaveBeenCalledWith("own-workspace");
  expect(all.mock.calls[0][0]).toBe(`/own-instagram/${name === "read_stories" ? "stories" : "insights"}`);
  all.mockRejectedValueOnce(new Error("Missing Instagram permission"));
  await expect(tool.run({ workspaceId: "own-workspace", tz: "Asia/Jerusalem" }, input)).rejects.toThrow("Missing Instagram permission");
});
