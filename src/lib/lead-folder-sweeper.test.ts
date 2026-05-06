import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { CloseLead } from "./close";

// Pin the env BEFORE importing the sweeper / close modules so `env` captures
// our values. The real env is restored in afterAll. Custom-field-tag mode
// is the production code path post-2026-05-05; user_id is no longer the
// source of truth for ownership in the Comeketo org.
const TAG = "01. 😎 Andre";
const FIELD_ID = "cf_TEST_OWNER_FIELD";

const ORIG = {
  CLOSE_OWNER_FIELD_ID: process.env.CLOSE_OWNER_FIELD_ID,
  CLOSE_OWNER_TAG_ANDRE: process.env.CLOSE_OWNER_TAG_ANDRE,
  CLOSE_USER_ID_ANDRE: process.env.CLOSE_USER_ID_ANDRE,
};

beforeAll(() => {
  process.env.CLOSE_OWNER_FIELD_ID = FIELD_ID;
  process.env.CLOSE_OWNER_TAG_ANDRE = TAG;
  process.env.CLOSE_USER_ID_ANDRE = "user_andre";
});

afterAll(() => {
  // Restore (or unset if originally absent) so other test files aren't affected.
  for (const [k, v] of Object.entries(ORIG)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function lead(over: Partial<CloseLead> = {}): CloseLead {
  return {
    id: "lead_x",
    display_name: "Test Lead",
    user_id: "user_andre",
    user_name: "Andre Raw",
    status_label: "🔘 Maybe",
    // Place the owner tag where `isOwnedByAndre` reads it.
    ...({ [`custom.${FIELD_ID}`]: TAG } as Partial<CloseLead>),
    ...over,
  };
}

// IMPORTANT: import the sweeper AFTER beforeAll has set the env, otherwise the
// `env` const captures empty strings at module-load time. We do this via a
// dynamic require inside each test to be safe across test runners.
async function getIsLeadInScope() {
  const mod = await import("./lead-folder-sweeper");
  return mod.isLeadInScope;
}

describe("isLeadInScope (custom-field ownership gate)", () => {
  it("includes Andre-owned, non-terminal leads", async () => {
    const isLeadInScope = await getIsLeadInScope();
    expect(isLeadInScope(lead())).toBe(true);
    expect(isLeadInScope(lead({ status_label: "🔘 Maybe" }))).toBe(true);
    expect(isLeadInScope(lead({ status_label: "📥 New Inquiry" }))).toBe(true);
  });

  it("excludes Won leads", async () => {
    const isLeadInScope = await getIsLeadInScope();
    expect(isLeadInScope(lead({ status_label: "✅ Won" }))).toBe(false);
  });

  it("excludes Lost leads", async () => {
    const isLeadInScope = await getIsLeadInScope();
    expect(isLeadInScope(lead({ status_label: "🔴 Lost" }))).toBe(false);
  });

  it("excludes Not Interested leads", async () => {
    const isLeadInScope = await getIsLeadInScope();
    expect(isLeadInScope(lead({ status_label: "🔴 Not Interested" }))).toBe(false);
  });

  it("excludes leads not tagged Andre in the custom field", async () => {
    const isLeadInScope = await getIsLeadInScope();
    const notAndre = lead({
      ...({ [`custom.${FIELD_ID}`]: "02. 👻 Someone Else" } as Partial<CloseLead>),
    });
    expect(isLeadInScope(notAndre)).toBe(false);
  });

  it("includes leads with no status_label (treated as in-progress)", async () => {
    const isLeadInScope = await getIsLeadInScope();
    expect(isLeadInScope(lead({ status_label: undefined }))).toBe(true);
  });
});
