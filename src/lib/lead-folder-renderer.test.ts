import { describe, it, expect } from "vitest";
import {
  renderLeadFolder,
  contentHash,
  activityFilename,
} from "./lead-folder-renderer";
import type { LeadHydration } from "./close-hydrate";
import type { CloseActivity, CloseLead } from "./close";

function lead(overrides: Partial<CloseLead> = {}): CloseLead {
  return {
    id: "lead_uePfZilFAKE",
    display_name: "Eliana Lopes",
    status_id: "stat_test",
    status_label: "🔴 Lost",
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

describe("renderLeadFolder — file map shape", () => {
  it("always emits the four canonical files", () => {
    const out = renderLeadFolder(emptyHydration());
    expect([...out.keys()].sort()).toEqual([
      "00_meta.json",
      "01_comms_digest.md",
      "01b_comms_verbatim.md",
      "client_ledger.md",
    ]);
  });

  it("never emits 04_profile.md or 06_discovery.md (Atom 7's job)", () => {
    const out = renderLeadFolder(emptyHydration());
    expect(out.has("04_profile.md")).toBe(false);
    expect(out.has("06_discovery.md")).toBe(false);
    expect(out.has("10_andre_feedback.md")).toBe(false);
  });

  it("emits one file per activity in comms/", () => {
    const out = renderLeadFolder(
      emptyHydration({
        emails: [activity({ id: "acti_email1", subject: "Hi" })],
        smses: [activity({ id: "acti_sms1", _type: "SMS", text: "yo" })],
        calls: [
          activity({
            id: "acti_call1",
            _type: "Call",
            duration: 120,
          }),
        ],
        activity_total: 3,
      }),
    );
    const commsFiles = [...out.keys()]
      .filter((p) => p.startsWith("comms/"))
      .sort();
    expect(commsFiles.length).toBe(3);
    expect(commsFiles[0]).toMatch(/^comms\/call_2026-04-23_/);
    expect(commsFiles[1]).toMatch(/^comms\/email_2026-04-23_/);
    expect(commsFiles[2]).toMatch(/^comms\/sms_2026-04-23_/);
  });
});

describe("activityFilename", () => {
  it("matches the Eliana convention: last 8 chars of id, lowercase", () => {
    const a = activity({
      id: "acti_GOY8LzV84GHpZPylbkjUcMohj3LjS0581XgaSnaTj4B",
      _type: "Call",
      date_created: "2026-04-23T15:37:47Z",
    });
    expect(activityFilename(a)).toBe("comms/call_2026-04-23_asnatj4b.json");
  });

  it("includes the .json suffix", () => {
    const a = activity({ _type: "Email", id: "acti_test12345678" });
    expect(activityFilename(a)?.endsWith(".json")).toBe(true);
  });

  it("returns null for unrecognized activity types", () => {
    const a = activity({ _type: "LeadStatusChange" });
    expect(activityFilename(a)).toBeNull();
  });
});

describe("00_meta.json", () => {
  it("populates lead identity fields from the lead payload", () => {
    const out = renderLeadFolder(emptyHydration());
    const meta = JSON.parse(out.get("00_meta.json")!);
    expect(meta.lead_id).toBe("lead_uePfZilFAKE");
    expect(meta.name).toBe("Eliana Lopes");
    expect(meta.slug).toBe("eliana-lopes");
    expect(meta.contact_id).toBe("cont_test");
    expect(meta.primary_email).toBe("eliana.lopes8@icloud.com");
    expect(meta.primary_phone).toBe("+15089678185");
    expect(meta.status_label).toBe("🔴 Lost");
  });

  it("includes counts and a content hash", () => {
    const out = renderLeadFolder(
      emptyHydration({
        emails: [activity({ id: "acti_e1" }), activity({ id: "acti_e2" })],
        smses: [activity({ id: "acti_s1", _type: "SMS" })],
        activity_total: 3,
      }),
    );
    const meta = JSON.parse(out.get("00_meta.json")!);
    expect(meta.counts).toEqual({
      calls: 0,
      emails: 2,
      smses: 1,
      meetings: 0,
      notes: 0,
      tasks: 0,
      threads: 0,
      subscriptions: 0,
    });
    expect(meta.activity_total).toBe(3);
    expect(meta.comms_content_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(meta.comms_dirty).toBe(false);
  });
});

describe("contentHash", () => {
  it("is stable when activity set is identical", () => {
    const h1 = emptyHydration({
      emails: [activity({ id: "acti_e1" })],
      activity_total: 1,
    });
    const h2 = emptyHydration({
      emails: [activity({ id: "acti_e1" })],
      activity_total: 1,
    });
    expect(contentHash(h1)).toBe(contentHash(h2));
  });

  it("changes when an activity is added", () => {
    const h1 = emptyHydration({
      emails: [activity({ id: "acti_e1" })],
      activity_total: 1,
    });
    const h2 = emptyHydration({
      emails: [activity({ id: "acti_e1" }), activity({ id: "acti_e2" })],
      activity_total: 2,
    });
    expect(contentHash(h1)).not.toBe(contentHash(h2));
  });

  it("does not change when activity order is shuffled (sorts internally)", () => {
    const h1 = emptyHydration({
      emails: [activity({ id: "acti_e1" }), activity({ id: "acti_e2" })],
      activity_total: 2,
    });
    const h2 = emptyHydration({
      emails: [activity({ id: "acti_e2" }), activity({ id: "acti_e1" })],
      activity_total: 2,
    });
    expect(contentHash(h1)).toBe(contentHash(h2));
  });
});

describe("01b_comms_verbatim.md content", () => {
  it("renders email subject + body in blockquote with Close link", () => {
    const out = renderLeadFolder(
      emptyHydration({
        emails: [
          activity({
            id: "acti_email1",
            subject: "Family Reunion inquiry",
            body_text: "Hey there, just checking in.\nTalk soon.",
            date_created: "2026-04-23T15:37:55Z",
          }),
        ],
        activity_total: 1,
      }),
    );
    const verbatim = out.get("01b_comms_verbatim.md")!;
    expect(verbatim).toContain("https://app.close.com/lead/lead_uePfZilFAKE/");
    expect(verbatim).toContain("📧 Email (outgoing) — 2026-04-23 15:37");
    expect(verbatim).toContain("Family Reunion inquiry");
    expect(verbatim).toContain("> Hey there, just checking in.");
    expect(verbatim).toContain("acti_email1");
  });

  it("renders call transcript as a blockquote when present", () => {
    const out = renderLeadFolder(
      emptyHydration({
        calls: [
          activity({
            id: "acti_call1",
            _type: "Call",
            duration: 220,
            recording_transcript: "Hi Eliana, do you have a minute?",
          }),
        ],
        activity_total: 1,
      }),
    );
    const verbatim = out.get("01b_comms_verbatim.md")!;
    expect(verbatim).toContain("**Transcript:**");
    expect(verbatim).toContain("> Hi Eliana, do you have a minute?");
  });

  it("notes when a call has no transcript", () => {
    const out = renderLeadFolder(
      emptyHydration({
        calls: [
          activity({ id: "acti_call1", _type: "Call", duration: 3 }),
        ],
        activity_total: 1,
      }),
    );
    const verbatim = out.get("01b_comms_verbatim.md")!;
    expect(verbatim).toContain("(no transcript");
  });
});

describe("01_comms_digest.md content", () => {
  it("groups outbound vs inbound", () => {
    const out = renderLeadFolder(
      emptyHydration({
        smses: [
          activity({
            id: "acti_out",
            _type: "SMS",
            direction: "outbound",
            text: "Hi from us",
          }),
          activity({
            id: "acti_in",
            _type: "SMS",
            direction: "inbound",
            text: "Reply from lead",
            user_name: undefined,
          }),
        ],
        activity_total: 2,
      }),
    );
    const digest = out.get("01_comms_digest.md")!;
    expect(digest).toContain("Recent fires (us → lead)");
    expect(digest).toContain("Hi from us");
    expect(digest).toContain("Inbound activity (lead → us)");
    expect(digest).toContain("Reply from lead");
  });

  it("shows 'none yet' when no outbound exists", () => {
    const out = renderLeadFolder(emptyHydration());
    const digest = out.get("01_comms_digest.md")!;
    expect(digest).toContain("_(none yet)_");
  });
});
