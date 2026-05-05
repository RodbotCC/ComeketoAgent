import { describe, it, expect } from "vitest";
import { __TEST_ONLY, filterLedgerByLead, type LedgerRow } from "./harness-ledger";

describe("ledgerPathForDate", () => {
  it("formats dates as harness/ledger/YYYY-MM-DD.jsonl in UTC", () => {
    const d = new Date("2026-05-05T14:23:11.412Z");
    expect(__TEST_ONLY.ledgerPathForDate(d)).toBe(
      "harness/ledger/2026-05-05.jsonl",
    );
  });

  it("zero-pads single-digit months and days", () => {
    expect(
      __TEST_ONLY.ledgerPathForDate(new Date("2026-01-05T00:00:00Z")),
    ).toBe("harness/ledger/2026-01-05.jsonl");
    expect(
      __TEST_ONLY.ledgerPathForDate(new Date("2026-12-09T23:59:59Z")),
    ).toBe("harness/ledger/2026-12-09.jsonl");
  });

  it("uses UTC, not local time, so day boundaries are stable", () => {
    // 2026-05-05T23:30:00 in PDT is 2026-05-06T06:30:00 UTC. The path must
    // reflect the UTC date.
    const d = new Date("2026-05-06T06:30:00Z");
    expect(__TEST_ONLY.ledgerPathForDate(d)).toBe(
      "harness/ledger/2026-05-06.jsonl",
    );
  });
});

describe("parseJsonl", () => {
  it("parses one row per line", () => {
    const text =
      `{"at":"2026-05-05T14:00:00Z","action_kind":"heartbeat_run","result":"ok"}\n` +
      `{"at":"2026-05-05T14:01:00Z","action_kind":"close_write","close_lead_id":"lead_x","result":"ok"}\n`;
    const rows = __TEST_ONLY.parseJsonl(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.action_kind).toBe("heartbeat_run");
    expect(rows[1]?.close_lead_id).toBe("lead_x");
  });

  it("skips blank lines", () => {
    const text =
      `\n` +
      `{"at":"2026-05-05T14:00:00Z","action_kind":"heartbeat_run","result":"ok"}\n` +
      `\n\n` +
      `{"at":"2026-05-05T14:01:00Z","action_kind":"close_write","result":"ok"}\n`;
    expect(__TEST_ONLY.parseJsonl(text)).toHaveLength(2);
  });

  it("skips malformed lines without breaking the read", () => {
    const text =
      `{"at":"2026-05-05T14:00:00Z","action_kind":"heartbeat_run","result":"ok"}\n` +
      `THIS LINE IS BROKEN\n` +
      `{"at":"2026-05-05T14:01:00Z","action_kind":"close_write","result":"ok"}\n`;
    const rows = __TEST_ONLY.parseJsonl(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.action_kind).toBe("heartbeat_run");
    expect(rows[1]?.action_kind).toBe("close_write");
  });

  it("returns empty for empty content", () => {
    expect(__TEST_ONLY.parseJsonl("")).toEqual([]);
    expect(__TEST_ONLY.parseJsonl("\n\n\n")).toEqual([]);
  });
});

describe("filterLedgerByLead", () => {
  const rows: LedgerRow[] = [
    { at: "2026-05-05T14:00:00Z", action_kind: "heartbeat_run", close_lead_id: null, result: "ok" },
    { at: "2026-05-05T14:01:00Z", action_kind: "close_write", close_lead_id: "lead_a", result: "ok" },
    { at: "2026-05-05T14:02:00Z", action_kind: "close_write", close_lead_id: "lead_b", result: "ok" },
    { at: "2026-05-05T14:03:00Z", action_kind: "approve_plan", close_lead_id: "lead_a", result: "ok" },
  ];

  it("filters rows down to the matching lead_id", () => {
    const out = filterLedgerByLead(rows, "lead_a");
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.close_lead_id === "lead_a")).toBe(true);
  });

  it("excludes rows with null close_lead_id", () => {
    const out = filterLedgerByLead(rows, "lead_a");
    expect(out.find((r) => r.action_kind === "heartbeat_run")).toBeUndefined();
  });

  it("returns empty array for unknown lead_id", () => {
    expect(filterLedgerByLead(rows, "lead_zzz")).toEqual([]);
  });
});
