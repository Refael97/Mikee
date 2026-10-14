import { describe, expect, it } from "vitest";
import { delivery } from "@/lib/meta/performance";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const A = { effective_status: "ACTIVE" };
const future = "2026-11-01T00:00:00Z";
const past = "2026-10-01T00:00:00Z";

describe("is a campaign really running", () => {
  it("live only with an active campaign, a running ad set and an active ad", () => {
    expect(delivery(A, [{ ...A, end_time: future }], [A], NOW)).toBe("live");
  });

  it("a campaign switched on whose ad sets are all paused is paused, not live", () => {
    expect(delivery(A, [{ effective_status: "PAUSED" }, { effective_status: "PAUSED" }], [{ effective_status: "ADSET_PAUSED" }], NOW)).toBe("paused");
  });

  it("past its end date it has ended, whatever its switch says", () => {
    expect(delivery(A, [{ ...A, end_time: past }], [A], NOW)).toBe("ended");
    expect(delivery({ ...A, stop_time: past }, [A], [A], NOW)).toBe("ended");
  });

  it("all ads paused, in review or rejected are reported as such", () => {
    expect(delivery(A, [A], [{ effective_status: "PAUSED" }], NOW)).toBe("paused");
    expect(delivery(A, [A], [{ effective_status: "PENDING_REVIEW" }], NOW)).toBe("review");
    expect(delivery(A, [A], [{ effective_status: "DISAPPROVED" }], NOW)).toBe("issue");
    expect(delivery({ effective_status: "PAUSED" }, [A], [A], NOW)).toBe("paused");
  });
});
