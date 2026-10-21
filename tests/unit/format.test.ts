import { describe, expect, it } from "vitest";
import { formatServiceDate, plural, timeAgo } from "@/lib/format";

describe("format", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  it("relative times", () => {
    expect(timeAgo("2026-10-25T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-25T11:52:00Z", now)).toBe("8 min ago");
    expect(timeAgo("2026-10-25T10:00:00Z", now)).toBe("2 hrs ago");
    expect(timeAgo("2026-10-24T10:00:00Z", now)).toBe("yesterday");
    expect(timeAgo("2026-10-21T10:00:00Z", now)).toBe("4 days ago");
  });
  it("service dates never shift across timezones", () => {
    expect(formatServiceDate("2026-10-25")).toBe("Sun 25 Oct");
    expect(formatServiceDate("2026-10-25", "long")).toBe("Sunday 25 October");
  });
  it("plurals", () => {
    expect(plural(1, "question")).toBe("1 question");
    expect(plural(2, "person", "people")).toBe("2 people");
  });
});
