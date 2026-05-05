import { describe, it, expect } from "vitest";
import {
  computeDiscoveryXP,
  computeReadiness,
  computeRestraint,
  RESTRAINT_GOOD_SKIPS,
  RESTRAINT_BAD_SKIPS,
} from "./journey-score";
import { DISCOVERY_SLOTS, buildDiscoveryMap, indexCustomFields } from "./discovery-map";

const CF_EVENT_DATE = "cf_FV2xBkviv7BAQZkkjUf8NUOc3fOpPTObMy5lVxZbyiP";
const CF_VENUE = "cf_bMmcNeKx2ltaIMgNPLXg3cQCVcKguZe28ilBnOilnO5";

describe("computeDiscoveryXP", () => {
  it("sums weights of known slots only", () => {
    const map = buildDiscoveryMap({
      customFields: indexCustomFields([
        { key: CF_EVENT_DATE, value: "2026-09-12" }, // weight 18
        { key: CF_VENUE, value: "Crane Estate" }, // weight 14
      ]),
    });
    expect(computeDiscoveryXP(map)).toBe(18 + 14);
  });

  it("counts stale slots at half-weight", () => {
    const fact = {
      slot_id: "service_style",
      value: "buffet",
      source: "llm_extraction" as const,
      extracted_at: "2026-04-01T00:00:00Z",
    };
    const map = buildDiscoveryMap({
      customFields: indexCustomFields([]),
      leadFacts: new Map([["service_style", fact]]),
      lastInboundAt: "2026-05-01T00:00:00Z", // newer → stale
    });
    // service_style weight = 10 → 5 XP
    expect(computeDiscoveryXP(map)).toBe(5);
  });
});

describe("computeReadiness", () => {
  it("zeroes plan factor when no plan", () => {
    const r = computeReadiness({ clarity: 60, planApprovalState: "none", voiceClean: true });
    // 0.5 * 60 + 0.3 * 0 + 0.2 * 100 = 30 + 0 + 20 = 50
    expect(r).toBe(50);
  });

  it("rewards approved plan", () => {
    const r = computeReadiness({ clarity: 60, planApprovalState: "approved", voiceClean: true });
    // 0.5*60 + 0.3*100 + 0.2*100 = 30 + 30 + 20 = 80
    expect(r).toBe(80);
  });

  it("penalizes voice failures", () => {
    const r = computeReadiness({ clarity: 60, planApprovalState: "approved", voiceClean: false });
    // 0.5*60 + 0.3*100 + 0.2*50 = 30 + 30 + 10 = 70
    expect(r).toBe(70);
  });

  it("clamps to 0..100", () => {
    expect(computeReadiness({ clarity: 100, planApprovalState: "approved", voiceClean: true })).toBe(
      100
    );
    expect(computeReadiness({ clarity: 0, planApprovalState: "none", voiceClean: false })).toBe(10);
  });
});

describe("computeRestraint", () => {
  it("returns null score when no data", () => {
    const { score } = computeRestraint({ skipBreakdown: {}, fires: 0 });
    expect(score).toBeNull();
  });

  it("rewards good skips (STOP_SIGNAL/REPLY_GATE/etc)", () => {
    const { score, breakdown } = computeRestraint({
      skipBreakdown: { STOP_SIGNAL: 3, REPLY_GATE: 2 },
      fires: 0,
    });
    // 5 good / (5 + 0 + 0) = 100
    expect(score).toBe(100);
    expect(breakdown.good_skips).toBe(5);
    expect(breakdown.bad_skips).toBe(0);
  });

  it("penalizes real failures (CLOSE_API_ERROR/HTML_FAIL)", () => {
    const { score, breakdown } = computeRestraint({
      skipBreakdown: { CLOSE_API_ERROR: 2, STOP_SIGNAL: 2 },
      fires: 4,
    });
    // (2 good + 4 fires) / (2 + 2 + 4) = 6/8 = 75
    expect(score).toBe(75);
    expect(breakdown.bad_skips).toBe(2);
  });

  it("treats neutral codes as filler (operational, not journey)", () => {
    const { score, breakdown } = computeRestraint({
      skipBreakdown: { OWNERSHIP: 5, DAY_NOT_TODAY: 3 },
      fires: 0,
    });
    // No good, no bad, no fires → score is null (no signal)
    expect(score).toBeNull();
    expect(breakdown.neutral_skips).toBe(8);
  });

  it("treats fires as intentional sends in the numerator", () => {
    const { score } = computeRestraint({
      skipBreakdown: { CLOSE_API_ERROR: 1 },
      fires: 9,
    });
    // (0 good + 9 fires) / (0 + 1 + 9) = 9/10 = 90
    expect(score).toBe(90);
  });
});

describe("restraint code sets", () => {
  it("includes all key NEPQ guardrails as good skips", () => {
    expect(RESTRAINT_GOOD_SKIPS.has("STOP_SIGNAL")).toBe(true);
    expect(RESTRAINT_GOOD_SKIPS.has("REPLY_GATE")).toBe(true);
    expect(RESTRAINT_GOOD_SKIPS.has("VOICE_FAIL")).toBe(true);
    expect(RESTRAINT_GOOD_SKIPS.has("FREQUENCY_CAP_24H")).toBe(true);
  });

  it("treats infra failures as bad skips", () => {
    expect(RESTRAINT_BAD_SKIPS.has("CLOSE_API_ERROR")).toBe(true);
    expect(RESTRAINT_BAD_SKIPS.has("HTML_FAIL")).toBe(true);
  });

  it("does not classify ownership/status filters as either", () => {
    expect(RESTRAINT_GOOD_SKIPS.has("OWNERSHIP")).toBe(false);
    expect(RESTRAINT_BAD_SKIPS.has("OWNERSHIP")).toBe(false);
    expect(RESTRAINT_GOOD_SKIPS.has("STATUS_WON")).toBe(false);
    expect(RESTRAINT_BAD_SKIPS.has("STATUS_WON")).toBe(false);
  });
});
