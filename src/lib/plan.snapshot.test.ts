import { describe, expect, it } from "vitest";
import { snapshotIdForBox } from "./plan";
import type { CloseActivity, CloseLeadFull } from "./close";

function act(p: Partial<CloseActivity> & Pick<CloseActivity, "id" | "date_created">): CloseActivity {
  return {
    _type: "Note",
    lead_id: "lead_1",
    ...p,
  };
}

function minimalBox(overrides: Partial<CloseLeadFull> = {}): CloseLeadFull {
  return {
    lead: {
      id: "lead_1",
      display_name: "Test",
      date_updated: "2026-05-01T12:00:00Z",
    },
    activities: [
      act({ id: "a2", date_created: "2026-05-01T11:00:00Z" }),
      act({ id: "a1", date_created: "2026-05-01T10:00:00Z" }),
    ],
    email_threads: [],
    subscriptions: [],
    fetched_at: "2026-05-01T12:05:00Z",
    ...overrides,
  };
}

describe("snapshotIdForBox", () => {
  it("is stable when activity array order changes (sorted by time)", () => {
    const base = minimalBox();
    const b1 = base;
    const b2 = minimalBox({
      activities: [...base.activities].reverse(),
    });
    expect(snapshotIdForBox(b1)).toBe(snapshotIdForBox(b2));
  });

  it("changes when latest activity id changes", () => {
    const b1 = minimalBox();
    const b2 = minimalBox({
      activities: [
        act({ id: "a3", date_created: "2026-05-01T11:00:00Z" }),
        act({ id: "a1", date_created: "2026-05-01T10:00:00Z" }),
      ],
    });
    expect(snapshotIdForBox(b1)).not.toBe(snapshotIdForBox(b2));
  });
});
