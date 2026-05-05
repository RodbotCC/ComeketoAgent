import { describe, it, expect } from "vitest";
import {
  DISCOVERY_SLOTS,
  buildDiscoveryMap,
  indexCustomFields,
  resolveSlot,
  resolveStage,
  type LeadFactRecord,
} from "./discovery-map";

const CF_EVENT_DATE = "cf_FV2xBkviv7BAQZkkjUf8NUOc3fOpPTObMy5lVxZbyiP";
const CF_VENUE = "cf_bMmcNeKx2ltaIMgNPLXg3cQCVcKguZe28ilBnOilnO5";
const CF_BUDGET = "cf_imMCu3Pod85W2K5ZkVUjBD7m3E5iZxbSf3mueeNpibM";
const CF_CLIENT_TYPE = "cf_QfX8ZrR1sRNYK67a1hsggbrqzpVKnYSNXdHJNTOH46k";
const CF_VISIT_STATUS = "cf_GGYkQSVNFOgGaPQ0GjFaTKdlyKpBNu3uEs7cHvBtXwQ";
const CF_VISIT_DATE = "cf_pwsRX35x1yQARZ5o0oBmSZyt69uoROzrI4NofjCcpyp";
const CF_BEO = "cf_pic3ufMdrIRgABujfMuf9mWHkFRHBJPMHKnALFq1s9c";
const CF_AGREEMENT = "cf_9DKFeuKphaS8HcK70MkP5mXMKCKbq8LCBQFqb3OgRH7";
const CF_DEPOSIT = "cf_QpQkq9FJreb7tNkzGTZhyvlflmhTv7yy1Ls7OttDrL6";

describe("DISCOVERY_SLOTS", () => {
  it("locks at exactly 9 entries (3×3 grid contract)", () => {
    expect(DISCOVERY_SLOTS).toHaveLength(9);
  });

  it("has unique slot ids", () => {
    const ids = DISCOVERY_SLOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has 5 canonical-close slots and 4 LLM-only slots", () => {
    const canonical = DISCOVERY_SLOTS.filter((s) => s.close_custom_key !== null);
    const llmOnly = DISCOVERY_SLOTS.filter((s) => s.close_custom_key === null);
    expect(canonical).toHaveLength(5);
    expect(llmOnly).toHaveLength(4);
  });
});

describe("resolveSlot", () => {
  it("resolves close_custom when canonical key has a value", () => {
    const ctx = {
      customFields: indexCustomFields([
        { key: CF_EVENT_DATE, value: "2026-09-12" },
      ]),
    };
    const slot = DISCOVERY_SLOTS.find((s) => s.id === "event_date")!;
    const state = resolveSlot(slot, ctx);
    expect(state.status).toBe("known");
    expect(state.source).toBe("close_custom");
    expect(state.value).toBe("2026-09-12");
  });

  it("merges composite extras into a value array (location)", () => {
    const ctx = {
      customFields: indexCustomFields([
        { key: "cf_l7gEKQsPZLqjEw35V4WB6ewUuc84dS3nohisc0BeCdy", value: "344 Salem St" },
        { key: "cf_xD3AKAnhwHeZy3OAUrZvbbFYiDPFwtFfTrSLAbDbmA2", value: "Medford" },
      ]),
    };
    const slot = DISCOVERY_SLOTS.find((s) => s.id === "location")!;
    const state = resolveSlot(slot, ctx);
    expect(state.status).toBe("known");
    expect(Array.isArray(state.value)).toBe(true);
    expect((state.value as unknown[])).toContain("344 Salem St");
    expect((state.value as unknown[])).toContain("Medford");
  });

  it("falls through to lead_facts when close_custom is empty", () => {
    const fact: LeadFactRecord = {
      slot_id: "guest_count",
      value: 115,
      source: "llm_extraction",
      evidence: { activity_id: "acti_x", excerpt: "we expect about 115 guests" },
      extracted_at: "2026-05-04T18:00:00Z",
    };
    const ctx = {
      customFields: indexCustomFields([]),
      leadFacts: new Map([["guest_count", fact]]),
    };
    const slot = DISCOVERY_SLOTS.find((s) => s.id === "guest_count")!;
    const state = resolveSlot(slot, ctx);
    expect(state.status).toBe("known");
    expect(state.source).toBe("llm_extraction");
    expect(state.value).toBe(115);
  });

  it("marks stale when extracted_at < lastInboundAt", () => {
    const fact: LeadFactRecord = {
      slot_id: "service_style",
      value: "buffet",
      source: "llm_extraction",
      extracted_at: "2026-05-01T00:00:00Z",
    };
    const ctx = {
      customFields: indexCustomFields([]),
      leadFacts: new Map([["service_style", fact]]),
      lastInboundAt: "2026-05-04T12:00:00Z",
    };
    const slot = DISCOVERY_SLOTS.find((s) => s.id === "service_style")!;
    const state = resolveSlot(slot, ctx);
    expect(state.status).toBe("stale");
  });

  it("returns unknown when neither close_custom nor lead_facts has the slot", () => {
    const ctx = { customFields: indexCustomFields([]) };
    const slot = DISCOVERY_SLOTS.find((s) => s.id === "decision_timeline")!;
    const state = resolveSlot(slot, ctx);
    expect(state.status).toBe("unknown");
    expect(state.value).toBeNull();
  });
});

describe("buildDiscoveryMap", () => {
  it("computes completeness and clarity from slot states", () => {
    const ctx = {
      customFields: indexCustomFields([
        { key: CF_EVENT_DATE, value: "2026-09-12" },
        { key: CF_VENUE, value: "Crane Estate" },
        { key: CF_BUDGET, value: "$15-20k" },
        { key: CF_CLIENT_TYPE, value: ["Consumer"] },
      ]),
    };
    const map = buildDiscoveryMap(ctx);
    // 4 of 9 slots known → completeness ≈ 0.44
    expect(map.completeness).toBeCloseTo(4 / 9, 2);
    // by-category breakdowns
    expect(map.by_category.quest.known).toBe(3); // event_date + venue + client_type
    expect(map.by_category.clarity.known).toBe(1); // budget
    expect(map.by_category.consequence.known).toBe(0);
    // Clarity score: known weights = 18 + 14 + 8 + 16 = 56; total = 110
    // 56/110 ≈ 0.509 → 51
    expect(map.clarity).toBe(51);
  });

  it("returns zero scores when nothing is known", () => {
    const map = buildDiscoveryMap({ customFields: indexCustomFields([]) });
    expect(map.completeness).toBe(0);
    expect(map.clarity).toBe(0);
  });
});

describe("resolveStage", () => {
  it("returns 'lead' for a fresh lead with no signals", () => {
    const stage = resolveStage({
      customFields: new Map(),
      leadCreatedAt: "2026-05-01T00:00:00Z",
      statusLabel: "potential",
    });
    expect(stage.current).toBe("lead");
    expect(stage.next?.id).toBe("discovery_started");
  });

  it("advances to discovery_started when event_date or venue is set", () => {
    const stage = resolveStage({
      customFields: new Map([[CF_EVENT_DATE, "2026-09-12"]]),
      leadCreatedAt: "2026-05-01T00:00:00Z",
      statusLabel: "potential",
    });
    expect(stage.current).toBe("discovery_started");
  });

  it("advances to tasting_booked when visit_status BOOKED with future date", () => {
    const stage = resolveStage({
      customFields: new Map([
        [CF_EVENT_DATE, "2026-09-12"],
        [CF_VISIT_STATUS, "BOOKED"],
        [CF_VISIT_DATE, "2099-12-01"],
      ]),
      leadCreatedAt: "2026-05-01T00:00:00Z",
      statusLabel: "tasting",
    });
    expect(stage.current).toBe("tasting_booked");
  });

  it("advances to tasting_done when BOOKED with past date", () => {
    const stage = resolveStage({
      customFields: new Map([
        [CF_EVENT_DATE, "2026-09-12"],
        [CF_VISIT_STATUS, "BOOKED"],
        [CF_VISIT_DATE, "2024-01-01"],
      ]),
      leadCreatedAt: "2026-05-01T00:00:00Z",
      statusLabel: "tasting",
    });
    expect(stage.current).toBe("tasting_done");
  });

  it("advances to beo_sent / agreement_signed / deposit_in", () => {
    const cf = new Map<string, unknown>([
      [CF_EVENT_DATE, "2026-09-12"],
      [CF_VISIT_STATUS, "BOOKED"],
      [CF_VISIT_DATE, "2024-01-01"],
      [CF_BEO, "02. Sent (In progress)"],
    ]);
    expect(resolveStage({ customFields: cf, leadCreatedAt: "x", statusLabel: "" }).current).toBe(
      "beo_sent"
    );

    cf.set(CF_AGREEMENT, ["04. CLIENT SIGNED"]);
    expect(resolveStage({ customFields: cf, leadCreatedAt: "x", statusLabel: "" }).current).toBe(
      "agreement_signed"
    );

    cf.set(CF_DEPOSIT, "2026-06-01");
    expect(resolveStage({ customFields: cf, leadCreatedAt: "x", statusLabel: "" }).current).toBe(
      "deposit_in"
    );
  });

  it("short-circuits to lost when status_label includes lost", () => {
    const stage = resolveStage({
      customFields: new Map([[CF_EVENT_DATE, "2026-09-12"]]),
      leadCreatedAt: "2026-05-01T00:00:00Z",
      statusLabel: "lost (closed)",
    });
    expect(stage.current).toBe("lost");
    expect(stage.next).toBeNull();
  });

  it("short-circuits to event_won when status_label includes won", () => {
    const stage = resolveStage({
      customFields: new Map([[CF_EVENT_DATE, "2026-09-12"]]),
      leadCreatedAt: "2026-05-01T00:00:00Z",
      statusLabel: "won",
    });
    expect(stage.current).toBe("event_won");
  });
});
