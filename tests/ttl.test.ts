import { describe, expect, it, vi } from "vitest";
import { forgetBusiness, remember } from "@/lib/ttl";

describe("the short memory for what pages show", () => {
  it("answers a repeat visit from memory, until it expires or the business changes", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => 42);
    expect(await remember("campaigns:ws-1:last_7d", 60_000, fn)).toBe(42);
    expect(await remember("campaigns:ws-1:last_7d", 60_000, fn)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    forgetBusiness("ws-1");
    await remember("campaigns:ws-1:last_7d", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(61_000);
    await remember("campaigns:ws-1:last_7d", 60_000, fn);
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("never remembers a failure, and keeps businesses apart", async () => {
    await expect(remember("dashboard:ws-2", 60_000, async () => Promise.reject(new Error("meta down")))).rejects.toThrow();
    expect(await remember("dashboard:ws-2", 60_000, async () => "ok")).toBe("ok");
    expect(await remember("dashboard:ws-3", 60_000, async () => "other")).toBe("other");
  });

  it("after it expires, shows the last answer at once and brings the new one in behind it", async () => {
    vi.useFakeTimers();
    let v = 1;
    const fn = vi.fn(async () => v);
    expect(await remember("results:ws-4", 60_000, fn)).toBe(1);
    vi.advanceTimersByTime(90_000);
    v = 2;
    // Old answer right away (no waiting on Meta), refresh started once.
    expect(await remember("results:ws-4", 60_000, fn)).toBe(1);
    await vi.waitFor(async () => expect(await remember("results:ws-4", 60_000, fn)).toBe(2));
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
