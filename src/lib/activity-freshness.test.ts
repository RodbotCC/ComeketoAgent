import { describe, expect, it } from "vitest";
import { maxIsoTimestamp } from "./activity-freshness";

describe("maxIsoTimestamp", () => {
  it("returns null when both empty", () => {
    expect(maxIsoTimestamp(null, undefined)).toBe(null);
  });
  it("picks the later timestamp", () => {
    const a = "2026-05-01T10:00:00.000Z";
    const b = "2026-05-01T12:00:00.000Z";
    expect(maxIsoTimestamp(a, b)).toBe(b);
    expect(maxIsoTimestamp(b, a)).toBe(b);
  });
});
