import { createHash } from "crypto";
import type { LeadHydration } from "./close-hydrate";
import type { CloseActivity, CloseEmailThread, CloseLead } from "./close";
import { slugify } from "./lead-folder";

export type FileMap = Map<string, string>;

/** Pure function: turn a `LeadHydration` into a map of relative-paths →
 *  file content. Sweeper (Atom 4) prepends the lead's folder root and
 *  pushes each file via `writeLeadFile`. Profile + discovery files are
 *  intentionally absent — those are LLM regen (Atom 7). */
export function renderLeadFolder(hydration: LeadHydration): FileMap {
  const out: FileMap = new Map();
  const verbatim = renderVerbatim(hydration);
  const digest = renderDigest(hydration);
  const ledger = renderLedger(hydration);
  const meta = renderMeta(hydration);

  out.set("00_meta.json", meta);
  out.set("01_comms_digest.md", digest);
  out.set("01b_comms_verbatim.md", verbatim);
  out.set("client_ledger.md", ledger);

  for (const a of allActivities(hydration)) {
    const path = activityFilename(a);
    if (!path) continue;
    out.set(path, JSON.stringify(a, null, 2) + "\n");
  }
  for (const t of hydration.threads) {
    const path = threadFilename(t);
    if (!path) continue;
    out.set(path, JSON.stringify(t, null, 2) + "\n");
  }

  return out;
}

// ───── 00_meta.json ─────────────────────────────────────────────────────────

function renderMeta(h: LeadHydration): string {
  const lead = h.lead;
  const primary_email =
    lead.contacts?.[0]?.emails?.[0]?.email ?? null;
  const primary_phone =
    lead.contacts?.[0]?.phones?.[0]?.phone ?? null;
  const meta = {
    lead_id: lead.id,
    name: lead.display_name,
    slug: slugify(lead.display_name),
    contact_id: lead.contacts?.[0]?.id ?? null,
    primary_email,
    primary_phone,
    status_id: lead.status_id ?? null,
    status_label: lead.status_label ?? null,
    organization_id: lead.organization_id ?? null,
    user_id: lead.user_id ?? null,
    user_name: lead.user_name ?? null,
    last_sweep_at: h.fetched_at,
    comms_dirty: false,
    comms_content_hash: contentHash(h),
    activity_total: h.activity_total,
    counts: {
      calls: h.calls.length,
      emails: h.emails.length,
      smses: h.smses.length,
      meetings: h.meetings.length,
      notes: h.notes.length,
      tasks: h.tasks.length,
      threads: h.threads.length,
      subscriptions: h.subscriptions.length,
    },
  };
  return JSON.stringify(meta, null, 2) + "\n";
}

/** Hash of activity_id+date_updated tuples — stable across renders unless
 *  Close's activity set genuinely changed. Used by the LLM regen path
 *  (Atom 7) to skip work when nothing material moved. */
export function contentHash(h: LeadHydration): string {
  const items = allActivities(h)
    .map((a) => `${a.id}:${(a as { date_updated?: string }).date_updated ?? a.date_created}`)
    .sort();
  const hash = createHash("sha256").update(items.join("\n")).digest("hex");
  return `sha256:${hash}`;
}

// ───── 01_comms_digest.md ──────────────────────────────────────────────────

function renderDigest(h: LeadHydration): string {
  const lead = h.lead;
  const lines: string[] = [];
  lines.push(`# ${lead.display_name} — Communications digest`);
  lines.push("");
  lines.push(
    `_Refreshed by sweeper at ${h.fetched_at}. Auto-generated; do not hand-edit. Operator overrides go in \`10_andre_feedback.md\`._`,
  );
  lines.push("");

  // Counts strip — same idiom Eliana's verbatim used
  const counts = [
    `call: ${h.calls.length}`,
    `email: ${h.emails.length}`,
    `sms: ${h.smses.length}`,
    `meeting: ${h.meetings.length}`,
    `thread: ${h.threads.length}`,
    `note: ${h.notes.length}`,
    `task: ${h.tasks.length}`,
  ].join("  ·  ");
  lines.push(`**Counts:** ${counts}`);
  lines.push("");

  // Recent fires — outbound from us
  const outbound = sortedByDateDesc(allComms(h)).filter(
    (a) => a.direction === "outbound",
  );
  const inbound = sortedByDateDesc(allComms(h)).filter(
    (a) => a.direction === "inbound",
  );

  lines.push("## Recent fires (us → lead)");
  lines.push("");
  if (outbound.length === 0) {
    lines.push("_(none yet)_");
  } else {
    lines.push("| When | Channel | By | Preview |");
    lines.push("|---|---|---|---|");
    for (const a of outbound.slice(0, 12)) {
      lines.push(
        `| ${shortTime(a.date_created)} | ${kindLabel(a)} | ${escMd(a.user_name ?? "—")} | ${escMd(previewOf(a))} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Inbound activity (lead → us)");
  lines.push("");
  if (inbound.length === 0) {
    lines.push("_(no inbound yet)_");
  } else {
    lines.push("| When | Channel | Preview |");
    lines.push("|---|---|---|");
    for (const a of inbound.slice(0, 12)) {
      lines.push(
        `| ${shortTime(a.date_created)} | ${kindLabel(a)} | ${escMd(previewOf(a))} |`,
      );
    }
  }
  lines.push("");

  // Latest call transcript snippet — most recent call with a transcript
  const transcribed = h.calls
    .slice()
    .sort((a, b) => (b.date_created ?? "").localeCompare(a.date_created ?? ""))
    .find(
      (c) =>
        typeof (c as { recording_transcript?: unknown }).recording_transcript ===
        "string" &&
        ((c as { recording_transcript?: string }).recording_transcript ?? "").trim()
          .length > 0,
    );
  if (transcribed) {
    const transcript = String(
      (transcribed as { recording_transcript?: string }).recording_transcript ??
        "",
    );
    lines.push(
      `## Latest call transcript snippet — ${shortTime(transcribed.date_created)}`,
    );
    lines.push("");
    lines.push("> " + transcript.slice(0, 1200).replace(/\n/g, "\n> "));
    if (transcript.length > 1200) lines.push(">");
    if (transcript.length > 1200) lines.push("> _(truncated — full text in `comms/`)_");
    lines.push("");
  }

  return lines.join("\n");
}

// ───── 01b_comms_verbatim.md ───────────────────────────────────────────────

function renderVerbatim(h: LeadHydration): string {
  const lead = h.lead;
  const lines: string[] = [];
  lines.push(`# ${lead.display_name} — Verbatim communications`);
  lines.push("");
  lines.push(
    `**Close lead:** [${lead.id}](https://app.close.com/lead/${lead.id}/)`,
  );
  lines.push(`**Generated:** ${h.fetched_at}`);
  lines.push("**Source:** Close API (api.close.com/api/v1)");
  lines.push("");
  const counts = [
    `call: ${h.calls.length}`,
    `meeting: ${h.meetings.length}`,
    `thread: ${h.threads.length}`,
    `email: ${h.emails.length}`,
    `sms: ${h.smses.length}`,
  ].join("  ·  ");
  lines.push(`**Counts:** ${counts}`);
  lines.push("");
  lines.push("Raw payloads are in `./comms/` (one JSON per activity).");
  lines.push("");
  lines.push("---");

  const ordered = sortedByDateAsc(allComms(h));
  for (const a of ordered) {
    lines.push("");
    renderActivityBlock(a, lines);
    lines.push("");
    lines.push("---");
  }
  return lines.join("\n");
}

function renderActivityBlock(a: CloseActivity, lines: string[]): void {
  const when = shortTime(a.date_created);
  const dir = a.direction === "outbound" ? "outgoing" : a.direction === "inbound" ? "incoming" : "—";
  switch (a._type) {
    case "Email": {
      lines.push(`### 📧 Email (${dir}) — ${when}`);
      lines.push("");
      if (a.subject) lines.push(`- **Subject:** ${escMd(a.subject)}`);
      if (a.user_name) lines.push(`- **By:** ${escMd(a.user_name)}`);
      lines.push(`- **Activity ID:** \`${a.id}\``);
      lines.push("");
      const body = (a.body_text ?? stripHtml(a.body_html ?? "")) || "_(empty)_";
      lines.push(blockquote(body));
      break;
    }
    case "SMS": {
      lines.push(`### 💬 SMS (${dir}) — ${when}`);
      lines.push("");
      if (a.user_name) lines.push(`- **By:** ${escMd(a.user_name)}`);
      lines.push(`- **Activity ID:** \`${a.id}\``);
      lines.push("");
      const body = a.text ?? "_(empty)_";
      lines.push(blockquote(String(body)));
      break;
    }
    case "Call": {
      const dur = typeof a.duration === "number" ? `${a.duration}s` : "—";
      lines.push(`### ☎️ Call (${dir}) — ${when}  ·  duration ${dur}`);
      lines.push("");
      if (a.user_name) lines.push(`- **By:** ${escMd(a.user_name)}`);
      lines.push(`- **Activity ID:** \`${a.id}\``);
      const note = String(a.note ?? "").trim();
      if (note) {
        lines.push("");
        lines.push("**Operator note:**");
        lines.push("");
        lines.push(blockquote(note));
      }
      const transcript = String(
        (a as { recording_transcript?: string }).recording_transcript ?? "",
      ).trim();
      if (transcript) {
        lines.push("");
        lines.push("**Transcript:**");
        lines.push("");
        lines.push(blockquote(transcript));
      } else {
        lines.push("");
        lines.push("_(no transcript — call too short or audio expired)_");
      }
      const auto = String(
        (a as { outcome_autofill_reasoning?: string }).outcome_autofill_reasoning ??
          "",
      ).trim();
      if (auto) {
        lines.push("");
        lines.push("**Close auto-summary:**");
        lines.push("");
        lines.push(blockquote(auto));
      }
      break;
    }
    case "Meeting": {
      lines.push(`### 📅 Meeting — ${when}`);
      lines.push("");
      lines.push(`- **Activity ID:** \`${a.id}\``);
      const note = String(a.note ?? "").trim();
      if (note) {
        lines.push("");
        lines.push(blockquote(note));
      }
      break;
    }
    case "Note": {
      lines.push(`### 📝 Note — ${when}`);
      lines.push("");
      if (a.user_name) lines.push(`- **By:** ${escMd(a.user_name)}`);
      lines.push(`- **Activity ID:** \`${a.id}\``);
      lines.push("");
      const note = String(a.note ?? "").trim() || "_(empty)_";
      lines.push(blockquote(note));
      break;
    }
    default: {
      lines.push(`### · ${a._type} — ${when}`);
      lines.push("");
      lines.push(`- **Activity ID:** \`${a.id}\``);
    }
  }
}

// ───── client_ledger.md ─────────────────────────────────────────────────────

function renderLedger(h: LeadHydration): string {
  const lead = h.lead;
  const lines: string[] = [];
  lines.push(`# client_ledger.md — ${lead.display_name}`);
  lines.push("");
  lines.push(
    `_Refreshed by sweeper at ${h.fetched_at}. Regenerated on every sweep — do not hand-edit. Operator overrides go in \`10_andre_feedback.md\`._`,
  );
  lines.push("");
  lines.push("## State");
  lines.push("");
  lines.push("|  |  |");
  lines.push("|---|---|");
  lines.push(`| Lead | [${lead.display_name}](https://app.close.com/lead/${lead.id}/) |`);
  lines.push(`| Status | ${lead.status_label ?? "—"} |`);
  lines.push(`| Owner | ${lead.user_name ?? "—"} |`);
  lines.push(`| Last sweep | ${h.fetched_at} |`);
  lines.push(`| Activity total | ${h.activity_total} |`);
  lines.push(`| Active subscriptions | ${h.subscriptions.filter((s) => s.status === "active").length} |`);
  lines.push("");

  const outbound = sortedByDateDesc(allComms(h)).filter(
    (a) => a.direction === "outbound",
  );
  lines.push("## Recent fires (us → lead)");
  lines.push("");
  if (outbound.length === 0) {
    lines.push("_(none)_");
  } else {
    lines.push("| When (UTC) | Channel | By | activity_id | Preview |");
    lines.push("|---|---|---|---|---|");
    for (const a of outbound.slice(0, 10)) {
      lines.push(
        `| ${shortTime(a.date_created)} | ${kindLabel(a)} | ${escMd(a.user_name ?? "—")} | \`${a.id}\` | ${escMd(previewOf(a))} |`,
      );
    }
  }
  lines.push("");
  lines.push(
    "_Cadence position (plan day, send window) lands here once Atom 10's plan-mirror ships._",
  );
  return lines.join("\n");
}

// ───── helpers ──────────────────────────────────────────────────────────────

function allActivities(h: LeadHydration): CloseActivity[] {
  return [
    ...h.calls,
    ...h.emails,
    ...h.smses,
    ...h.meetings,
    ...h.notes,
    ...h.tasks,
    ...h.unknown_activities,
  ];
}

function allComms(h: LeadHydration): CloseActivity[] {
  return [...h.calls, ...h.emails, ...h.smses, ...h.meetings];
}

function sortedByDateDesc(xs: CloseActivity[]): CloseActivity[] {
  return xs.slice().sort((a, b) => (b.date_created ?? "").localeCompare(a.date_created ?? ""));
}

function sortedByDateAsc(xs: CloseActivity[]): CloseActivity[] {
  return xs.slice().sort((a, b) => (a.date_created ?? "").localeCompare(b.date_created ?? ""));
}

function shortTime(iso: string | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

function kindLabel(a: CloseActivity): string {
  switch (a._type) {
    case "Email":
      return "Email";
    case "SMS":
      return "SMS";
    case "Call":
      return "Call";
    case "Meeting":
      return "Meeting";
    case "Note":
      return "Note";
    case "Task":
    case "TaskCompleted":
      return "Task";
    default:
      return a._type;
  }
}

function previewOf(a: CloseActivity): string {
  const raw =
    a.subject ?? a.text ?? (typeof a.note === "string" ? a.note : "") ?? "";
  const oneLine = String(raw).replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? oneLine.slice(0, 77) + "…" : oneLine || "—";
}

function escMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function blockquote(s: string): string {
  return s
    .split("\n")
    .map((l) => "> " + l)
    .join("\n");
}

function stripHtml(s: string): string {
  return s
    .replace(/<\/(p|div|li|br|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** `comms/{kind}_{YYYY-MM-DD}_{shortid}.json`. shortid = last 8 chars of
 *  activity id, lowercased. Mirrors Eliana's filename convention. */
export function activityFilename(a: CloseActivity): string | null {
  const kind = activityFilenameKind(a._type);
  if (!kind) return null;
  const date = (a.date_created ?? "").slice(0, 10);
  if (!date) return null;
  const shortid = a.id.slice(-8).toLowerCase();
  return `comms/${kind}_${date}_${shortid}.json`;
}

function activityFilenameKind(type: string): string | null {
  switch (type) {
    case "Call":
      return "call";
    case "Email":
      return "email";
    case "SMS":
      return "sms";
    case "Meeting":
      return "meeting";
    case "Note":
      return "note";
    case "Task":
    case "TaskCompleted":
      return "task";
    default:
      return null;
  }
}

function threadFilename(t: CloseEmailThread): string | null {
  const date = (t.date_created ?? "").slice(0, 10);
  if (!date) return null;
  const shortid = t.id.slice(-8).toLowerCase();
  return `comms/thread_${date}_${shortid}.json`;
}

// re-export for tests
export { allActivities as __allActivities };
