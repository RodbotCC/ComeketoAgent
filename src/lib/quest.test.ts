import { describe, it, expect } from "vitest";
import { synthesizeQuest } from "./quest";
import { buildDiscoveryMap, indexCustomFields, resolveStage } from "./discovery-map";

const CF_EVENT_DATE = "cf_FV2xBkviv7BAQZkkjUf8NUOc3fOpPTObMy5lVxZbyiP";
const CF_VENUE = "cf_bMmcNeKx2ltaIMgNPLXg3cQCVcKguZe28ilBnOilnO5";
const CF_BUDGET = "cf_imMCu3Pod85W2K5ZkVUjBD7m3E5iZxbSf3mueeNpibM";
const CF_BEO = "cf_pic3ufMdrIRgABujfMuf9mWHkFRHBJPMHKnALFq1s9c";
const CF_VISIT_STATUS = "cf_GGYkQSVNFOgGaPQ0GjFaTKdlyKpBNu3uEs7cHvBtXwQ";
const CF_VISIT_DATE = "cf_pwsRX35x1yQARZ5o0oBmSZyt69uoROzrI4NofjCcpyp";

function ctxFor(fields: Array<[string, unknown]>) {
  const cf = new Map(fields);
  return {
    map: buildDiscoveryMap({ customFields: indexCustomFields(fields.map(([k, v]) => ({ key: k, value: v }))) }),
    stage: resolveStage({
      customFields: cf,
      leadCreatedAt: "2026-05-01T00:00:00Z",
      statusLabel: "potential",
    }),
  };
}

describe("synthesizeQuest", () => {
  it("picks event_date as current quest when nothing is known (highest weight in quest category)", () => {
    const { map, stage } = ctxFor([]);
    const q = synthesizeQuest(map, stage, null);
    expect(q.current.slot_id).toBe("event_date");
    expect(q.current.title).toContain("event date");
    // Bonus is next-priority unknown — venue (weight 14) in quest category
    expect(q.bonus?.slot_id).toBe("venue");
  });

  it("advances to clarity slots once quest slots are filled", () => {
    const { map, stage } = ctxFor([
      [CF_EVENT_DATE, "2026-09-12"],
      [CF_VENUE, "Crane Estate"],
      ["cf_l7gEKQsPZLqjEw35V4WB6ewUuc84dS3nohisc0BeCdy", "344 Salem St"],
      ["cf_QfX8ZrR1sRNYK67a1hsggbrqzpVKnYSNXdHJNTOH46k", ["Consumer"]],
    ]);
    const q = synthesizeQuest(map, stage, null);
    // All quest slots known → current should be a clarity slot. Highest weight
    // unknown in clarity is budget (16) since guest_count (14) is unknown too.
    expect(q.current.slot_id).toBe("budget");
  });

  it("flags premature-proposal risk when plan mentions proposal but budget unknown", () => {
    const { map, stage } = ctxFor([[CF_EVENT_DATE, "2026-09-12"]]);
    const plan = {
      status: "approved",
      days: [{ day_number: 3, required_actions: [{ intent: "send proposal package", channel: "email" }] }],
    };
    const q = synthesizeQuest(map, stage, plan);
    expect(q.risk?.title).toBe("Premature proposal risk");
  });

  it("flags low-clarity risk when clarity < 30", () => {
    const { map, stage } = ctxFor([]);
    const q = synthesizeQuest(map, stage, null);
    expect(q.risk?.title).toBe("Low clarity");
  });

  it("flags open-ended tasting risk after tasting_done with no decision_timeline", () => {
    const { map, stage } = ctxFor([
      [CF_EVENT_DATE, "2026-09-12"],
      [CF_VENUE, "Crane"],
      [CF_BUDGET, "$15k"],
      [CF_VISIT_STATUS, "BOOKED"],
      [CF_VISIT_DATE, "2024-01-01"],
    ]);
    expect(stage.current).toBe("tasting_done");
    const q = synthesizeQuest(map, stage, null);
    expect(q.risk?.title).toBe("Open-ended tasting");
  });

  it("uses plan.best_next_question when available", () => {
    const { map, stage } = ctxFor([]);
    const plan = { status: "approved", best_next_question: "When are you tasting next?" };
    const q = synthesizeQuest(map, stage, plan);
    expect(q.recommended_move.question).toBe("When are you tasting next?");
  });

  it("falls back to slot-templated NEPQ question when plan has none", () => {
    const { map, stage } = ctxFor([]);
    const q = synthesizeQuest(map, stage, null);
    // Current is event_date → templated event_date question
    expect(q.recommended_move.question).toContain("event date");
  });

  it("returns null bonus when only one slot is unknown", () => {
    // Fill 8 of 9 slots so only one unknown remains.
    const fields: Array<[string, unknown]> = [
      [CF_EVENT_DATE, "2026-09-12"],
      [CF_VENUE, "Crane"],
      ["cf_l7gEKQsPZLqjEw35V4WB6ewUuc84dS3nohisc0BeCdy", "344 Salem St"],
      ["cf_QfX8ZrR1sRNYK67a1hsggbrqzpVKnYSNXdHJNTOH46k", ["Consumer"]],
      [CF_BUDGET, "$15k"],
    ];
    // Plus 3 lead_facts to fill all but one
    const cf = new Map(fields);
    const map = buildDiscoveryMap({
      customFields: indexCustomFields(fields.map(([k, v]) => ({ key: k, value: v }))),
      leadFacts: new Map([
        ["guest_count", { slot_id: "guest_count", value: 115, source: "operator" as const, extracted_at: "2026-05-04T00:00:00Z" }],
        ["service_style", { slot_id: "service_style", value: "buffet", source: "operator" as const, extracted_at: "2026-05-04T00:00:00Z" }],
        ["decision_timeline", { slot_id: "decision_timeline", value: "by July", source: "operator" as const, extracted_at: "2026-05-04T00:00:00Z" }],
      ]),
    });
    const stage = resolveStage({ customFields: cf, leadCreatedAt: "x", statusLabel: "" });
    const q = synthesizeQuest(map, stage, null);
    // 8 known, 1 unknown → current = dietary_constraints (only unknown)
    expect(q.current.slot_id).toBe("dietary_constraints");
    expect(q.bonus).toBeNull();
  });
});
