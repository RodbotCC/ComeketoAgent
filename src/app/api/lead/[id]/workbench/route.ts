import { NextResponse } from "next/server";
import { CLIENT_BOX_DOCS } from "@/lib/client-box-contract";
import { getLatestHeartbeatForLead } from "@/lib/heartbeat";
import { listLeadFolderFiles, stripFrontmatter } from "@/lib/lead-folder";
import { getLatestPlanForLead } from "@/lib/plans-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocStatus = {
  file: string;
  label: string;
  phase: "raw" | "ai" | "execution" | "operator";
  present: boolean;
  chars: number;
  preview: string | null;
  /** Full body of the doc (markdown stripped of frontmatter, JSON/JSONL untouched).
   * Bounded by chars; if missing, the file isn't present. */
  body: string | null;
  generated_at: string | null;
};

type ContinuityRow = {
  date?: string;
  kind?: string;
  direction?: string | null;
  activity_id?: string;
  contact_id?: string;
  ref?: string;
};

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function frontmatterValue(raw: string, key: string): string | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  const fm = raw.slice(3, end);
  const line = fm.split("\n").find((l) => l.startsWith(`${key}:`));
  if (!line) return null;
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") || null;
}

function previewText(raw: string, file: string): string {
  const body = file.endsWith(".md") ? stripFrontmatter(raw) : raw;
  return body.replace(/\s+/g, " ").trim().slice(0, 360);
}

function latestContinuityRows(raw: string | undefined, n = 6): ContinuityRow[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJson<ContinuityRow>(line))
    .filter((row): row is ContinuityRow => Boolean(row?.ref))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, n);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const leadId = params.id?.trim();
  if (!leadId || !leadId.startsWith("lead_")) {
    return NextResponse.json({ ok: false, error: "invalid lead id" }, { status: 400 });
  }

  try {
    const files = await listLeadFolderFiles(leadId).catch(() => null);
    const meta = parseJson<Record<string, unknown>>(files?.get("00_meta.json")?.content);
    const rawLead =
      parseJson<Record<string, unknown>>(files?.get("01_raw_lead.json")?.content) ??
      parseJson<Record<string, unknown>>(files?.get("00_lead.json")?.content);
    const continuityRaw =
      files?.get("02_continuity.jsonl")?.content ??
      files?.get("00_continuity.jsonl")?.content;
    const commFiles = files
      ? [...files.keys()].filter((k) => k.startsWith("comms/") && k.endsWith(".json"))
      : [];

    const docs: DocStatus[] = CLIENT_BOX_DOCS.map((doc) => {
      const content = files?.get(doc.file)?.content ?? null;
      const fullBody = content
        ? doc.file.endsWith(".md")
          ? stripFrontmatter(content)
          : content
        : null;
      return {
        file: doc.file,
        label: doc.label,
        phase: doc.phase,
        present: Boolean(content),
        chars: content?.length ?? 0,
        preview: content ? previewText(content, doc.file) : null,
        body: fullBody,
        generated_at: content && doc.file.endsWith(".md") ? frontmatterValue(content, "generated_at") : null,
      };
    });

    const latest = latestContinuityRows(continuityRaw);
    const latest_comms = latest.map((row) => {
      const raw = row.ref ? files?.get(row.ref)?.content : null;
      const payload = parseJson<Record<string, unknown>>(raw);
      const text =
        typeof payload?.text === "string"
          ? payload.text
          : typeof payload?.body_text === "string"
            ? payload.body_text
            : typeof payload?.recording_transcript === "string"
              ? payload.recording_transcript
              : typeof payload?.note === "string"
                ? payload.note
                : "";
      return {
        date: row.date ?? null,
        kind: row.kind ?? null,
        direction: row.direction ?? null,
        ref: row.ref ?? null,
        activity_id: row.activity_id ?? null,
        preview: text.replace(/\s+/g, " ").trim().slice(0, 260) || null,
      };
    });

    const plan = await getLatestPlanForLead(leadId).catch(() => null);
    const heartbeat = await getLatestHeartbeatForLead(leadId).catch(() => null);

    const aiFiles = ["03_comms_interpreted.md", "04_profile.md", "06_discovery.md", "07_andre_alerts.md", "08_client_ledger.md"];
    const rawFiles = ["00_meta.json", "01_raw_lead.json", "02_continuity.jsonl"];
    const present = new Set(files ? [...files.keys()] : []);
    const needs = {
      raw: rawFiles.filter((f) => !present.has(f)),
      ai: aiFiles.filter((f) => !present.has(f)),
      plan: plan ? [] : ["plan.json"],
    };

    return NextResponse.json({
      ok: true,
      lead_id: leadId,
      folder_state: files ? "present" : "missing",
      lead_name:
        (typeof meta?.name === "string" && meta.name) ||
        (typeof rawLead?.display_name === "string" && rawLead.display_name) ||
        leadId,
      status_label:
        (typeof meta?.status_label === "string" && meta.status_label) ||
        (typeof rawLead?.status_label === "string" && rawLead.status_label) ||
        null,
      last_checked_at: typeof meta?.last_sweep_at === "string" ? meta.last_sweep_at : null,
      counts: {
        activities: typeof meta?.activity_total === "number" ? meta.activity_total : latest.length,
        comm_files: commFiles.length,
        docs_present: docs.filter((d) => d.present).length,
        docs_total: docs.length,
      },
      docs,
      needs,
      latest_comms,
      profile_preview: docs.find((d) => d.file === "04_profile.md")?.preview ?? null,
      discovery_preview: docs.find((d) => d.file === "06_discovery.md")?.preview ?? null,
      ledger_preview: docs.find((d) => d.file === "08_client_ledger.md")?.preview ?? null,
      alerts_preview: docs.find((d) => d.file === "07_andre_alerts.md")?.preview ?? null,
      plan: plan
        ? {
            plan_id: plan.plan_id,
            status: plan.status,
            generated_at: plan.generated_at,
            primary_goal: plan.primary_goal,
            goal_summary: plan.goal_summary,
            best_next_question: plan.best_next_question,
            days: plan.days.length,
            needs_review: plan.days.filter((d) => d.approval_status === "needs_review").length,
            approved: plan.days.filter((d) => d.approval_status === "approved").length,
            sent: plan.days.filter((d) => d.approval_status === "sent").length,
          }
        : null,
      heartbeat,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
