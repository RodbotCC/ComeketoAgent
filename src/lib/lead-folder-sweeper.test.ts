import { describe, it, expect } from "vitest";
import { isLeadInScope } from "./lead-folder-sweeper";
import { env } from "./env";
import type { CloseLead } from "./close";

function lead(over: Partial<CloseLead> = {}): CloseLead {
  return {
    id: "lead_x",
    display_name: "Test Lead",
    user_id: env.CLOSE_USER_ID_ANDRE || "user_andre",
    user_name: "Andre Raw",
    status_label: "🔵 Maybe",
    ...over,
  };
}

describe("isLeadInScope", () => {
  it("includes Andre-owned, non-terminal leads", () => {
    expect(isLeadInScope(lead())).toBe(true);
    expect(isLeadInScope(lead({ status_label: "🔵 Maybe" }))).toBe(true);
    expect(
      isLeadInScope(lead({ status_label: "📥 New Inquiry" })),
    ).toBe(true);
  });

  it("excludes Won leads", () => {
    expect(isLeadInScope(lead({ status_label: "✅ Won" }))).toBe(false);
  });

  it("excludes Lost leads", () => {
    expect(isLeadInScope(lead({ status_label: "🔴 Lost" }))).toBe(false);
  });

  it("excludes Not Interested leads", () => {
    expect(
      isLeadInScope(lead({ status_label: "🔴 Not Interested" })),
    ).toBe(false);
  });

  it("excludes leads owned by someone other than Andre when env is set", () => {
    if (!env.CLOSE_USER_ID_ANDRE) {
      // env not configured in test runner — skip
      return;
    }
    expect(isLeadInScope(lead({ user_id: "user_someone_else" }))).toBe(false);
  });

  it("includes leads with no status_label (treated as in-progress)", () => {
    expect(isLeadInScope(lead({ status_label: undefined }))).toBe(true);
  });
});
