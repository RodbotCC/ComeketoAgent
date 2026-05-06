import { describe, it, expect } from "vitest";
import { renderLeadFolder, activityFilename } from "./lead-folder-renderer";
import type { LeadHydration } from "./close-hydrate";
import type { CloseActivity, CloseLead } from "./close";

function lead(overrides: Partial<CloseLead> = {}): CloseLead {
  return {
    id: "lead_uePfZilFAKE",
    display_name: "Eliana Lopes",
    status_id: "stat_test",
    status_label: "🔘 Maybe",
    user_id: "user_andre",
    user_name: "Andre Raw",
    organization_id: "orga_test",
    contacts: [
      {
        id: "cont_test",
        name: "Eliana Lopes",
        emails: [{ email: "eliana.lopes8@icloud.com" }],
        phones: [{ phone: "+15089678185" }],
      },
    ],
    ...overrides,
  };
}

function activity(over: Partial<CloseActivity>): CloseActivity {
  return {
    id: "acti_test",
    _type: "Email",
    lead_id: "lead_uePfZilFAKE",
    date_created: "2026-04-23T15:37:55Z",
    direction: "outbound",
    user_name: "Andre Raw",
    ...over,
  } as CloseActivity;
}

function emptyHydration(over: Partial<LeadHydration> = {}): LeadHydration {
  return {
    lead: lead(),
    calls: [],
    emails: [],
    smses: [],
    whatsapps: [],
    meetings: [],
    notes: [],
    tasks: [],
    threads: [],
    subscriptions: [],
    unknown_activities: [],
    fetched_at: "2026-05-05T14:00:00Z",
    activity_total: 0,
    ...over,
  };
}

describe("renderLeadFolder — raw substrate contract (2026-05-05)", () => {
  it("emits the canonical raw box files on an empty hydration", () => {
    const out = renderLeadFolder(emptyHydration());
    expect(out.has("00_meta.json")).toBe(true);
    expect(out.has("01_raw_lead.json")).toBe(true);
    expect(out.has("02_continuity.jsonl")).toBe(true);
  });

  it("never emits the legacy summary files (digest / verbatim / ledger)", () => {
    const out = renderLeadFolder(emptyHydration());
    expect(out.has("01_comms_digest.md")).toBe(false);
    expect(out.has("01b_comms_verbatim.md")).toBe(false);
    expect(out.has("client_ledger.md")).toBe(false);
  });

  it("never emits LLM-derived files (those are phase-2)", () => {
    const out = renderLeadFolder(emptyHydration());
    expect(out.has("04_profile.md")).toBe(false);
    expect(out.has("06_discovery.md")).toBe(false);
    expect(out.has("07_andre_alerts.md")).toBe(false);
    expect(out.has("08_client_ledger.md")).toBe(false);
  });

  it("writes one comms/*.json per activity, mirrored in continuity refs", () => {
    const a1 = activity({ id: "acti_AAA", _type: "Email" });
    const a2 = activity({
      id: "acti_BBB",
      _type: "Call",
      date_created: "2026-04-24T10:00:00Z",
    });
    const out = renderLeadFolder(emptyHydration({ emails: [a1], calls: [a2] }));
    const ref1 = activityFilename(a1)!;
    const ref2 = activityFilename(a2)!;
    expect(out.has(ref1)).toBe(true);
    expect(out.has(ref2)).toBe(true);

    const continuity = out.get("02_continuity.jsonl")!;
    const lines = continuity.trim().split("\n");
    expect(lines).toHaveLength(2);
    const refs = lines.map((l) => (JSON.parse(l) as { ref: string }).ref);
    expect(refs).toContain(ref1);
    expect(refs).toContain(ref2);
  });

  it("02_continuity.jsonl is sorted by date ascending (oldest first)", () => {
    const older = activity({
      id: "acti_OLD",
      date_created: "2026-04-20T10:00:00Z",
    });
    const newer = activity({
      id: "acti_NEW",
      date_created: "2026-04-25T10:00:00Z",
    });
    const out = renderLeadFolder(emptyHydration({ emails: [newer, older] }));
    const lines = out.get("02_continuity.jsonl")!.trim().split("\n");
    const dates = lines.map((l) => (JSON.parse(l) as { date: string }).date);
    expect(dates).toEqual([older.date_created, newer.date_created]);
  });
});

describe("renderLeadFolder — canonical JSON shape", () => {
  it("includes sweep envelope in 00_meta.json and raw Close lead in 01_raw_lead.json", () => {
    const out = renderLeadFolder(emptyHydration());
    const meta = JSON.parse(out.get("00_meta.json")!) as Record<string, unknown>;
    const raw = JSON.parse(out.get("01_raw_lead.json")!) as Record<string, unknown>;
    expect(meta.lead_id).toBe("lead_uePfZilFAKE");
    expect(meta.last_sweep_at).toBe("2026-05-05T14:00:00Z");
    expect(raw.id).toBe("lead_uePfZilFAKE");
    expect(raw.display_name).toBe("Eliana Lopes");
    expect(raw.__sweep).toBeUndefined();
  });

  it("preserves all custom.cf_* keys verbatim", () => {
    const withCustom = lead({
      // Cast — the CloseLead type doesn't enumerate `custom.*` keys but the
      // runtime supports them as flat keys.
      ...({
        "custom.cf_owner": "01. 😎 Andre",
        "custom.cf_event": "WEDDING",
      } as Partial<CloseLead>),
    });
    const out = renderLeadFolder(emptyHydration({ lead: withCustom }));
    const raw = JSON.parse(out.get("01_raw_lead.json")!) as Record<string, unknown>;
    expect(raw["custom.cf_owner"]).toBe("01. 😎 Andre");
    expect(raw["custom.cf_event"]).toBe("WEDDING");
  });

  it("output is byte-stable across renders of the same hydration", () => {
    const h = emptyHydration({ emails: [activity({ id: "acti_X" })] });
    const a = renderLeadFolder(h).get("01_raw_lead.json");
    const b = renderLeadFolder(h).get("01_raw_lead.json");
    expect(a).toBe(b);
    const ca = renderLeadFolder(h).get("02_continuity.jsonl");
    const cb = renderLeadFolder(h).get("02_continuity.jsonl");
    expect(ca).toBe(cb);
  });
});
