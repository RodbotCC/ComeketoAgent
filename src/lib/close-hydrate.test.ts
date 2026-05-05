import { describe, it, expect } from "vitest";
import { bucketActivities } from "./close-hydrate";
import type { CloseActivity } from "./close";

function activity(id: string, type: string): CloseActivity {
  return {
    id,
    _type: type,
    lead_id: "lead_x",
    date_created: "2026-05-05T00:00:00Z",
  } as CloseActivity;
}

describe("bucketActivities", () => {
  it("routes each canonical _type to its own bucket", () => {
    const buckets = bucketActivities([
      activity("a1", "Call"),
      activity("a2", "Email"),
      activity("a3", "SMS"),
      activity("a4", "Meeting"),
      activity("a5", "Note"),
      activity("a6", "Task"),
    ]);
    expect(buckets.calls.map((c) => c.id)).toEqual(["a1"]);
    expect(buckets.emails.map((c) => c.id)).toEqual(["a2"]);
    expect(buckets.smses.map((c) => c.id)).toEqual(["a3"]);
    expect(buckets.meetings.map((c) => c.id)).toEqual(["a4"]);
    expect(buckets.notes.map((c) => c.id)).toEqual(["a5"]);
    expect(buckets.tasks.map((c) => c.id)).toEqual(["a6"]);
    expect(buckets.unknown).toEqual([]);
  });

  it("bins TaskCompleted with regular tasks", () => {
    const buckets = bucketActivities([
      activity("t1", "Task"),
      activity("t2", "TaskCompleted"),
    ]);
    expect(buckets.tasks.map((c) => c.id)).toEqual(["t1", "t2"]);
  });

  it("preserves unrecognized types in the unknown bucket so renderer keeps fidelity", () => {
    const buckets = bucketActivities([
      activity("u1", "LeadStatusChange"),
      activity("u2", "OpportunityStatusChange"),
      activity("u3", "Created"),
    ]);
    expect(buckets.unknown.map((c) => c.id)).toEqual(["u1", "u2", "u3"]);
    expect(buckets.calls).toEqual([]);
    expect(buckets.emails).toEqual([]);
  });

  it("keeps within-bucket order matching input order (newest-first preservation)", () => {
    const buckets = bucketActivities([
      activity("e3", "Email"),
      activity("e1", "Email"),
      activity("e2", "Email"),
    ]);
    expect(buckets.emails.map((c) => c.id)).toEqual(["e3", "e1", "e2"]);
  });

  it("returns empty buckets for empty input", () => {
    const buckets = bucketActivities([]);
    expect(buckets.calls).toEqual([]);
    expect(buckets.emails).toEqual([]);
    expect(buckets.smses).toEqual([]);
    expect(buckets.unknown).toEqual([]);
  });
});
