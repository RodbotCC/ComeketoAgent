/**
 * Supabase persistence for /automation/drafts (Guardrails §M).
 * Server-only; uses service role.
 */

import { getSupabaseServer } from "./supabase";
import type { Workflow } from "@/app/automation/AutomationCanvas";

export type AutomationDraftStatus =
  | "draft"
  | "preview"
  | "needs_review"
  | "approved"
  | "active"
  | "paused"
  | "archived";

export type AutomationDraftRow = {
  id: string;
  name: string;
  status: AutomationDraftStatus;
  workflow_json: Workflow;
  close_steps_json: Array<Record<string, unknown>> | null;
  risk_notes: string | null;
  close_sequence_id: string | null;
  operator_goal: string | null;
  created_at: string;
  updated_at: string;
};

const EMPTY_WF: Workflow = {
  id: "local",
  name: "Untitled",
  nodes: [],
  connections: [],
};

function rowToDraft(r: Record<string, unknown>): AutomationDraftRow {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    status: (r.status as AutomationDraftStatus) || "draft",
    workflow_json: (r.workflow_json as Workflow) ?? EMPTY_WF,
    close_steps_json: (r.close_steps_json as Array<Record<string, unknown>>) ?? null,
    risk_notes: r.risk_notes != null ? String(r.risk_notes) : null,
    close_sequence_id: r.close_sequence_id != null ? String(r.close_sequence_id) : null,
    operator_goal: r.operator_goal != null ? String(r.operator_goal) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export async function listAutomationDrafts(limit = 50): Promise<AutomationDraftRow[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("automation_drafts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listAutomationDrafts: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(rowToDraft);
}

export async function getAutomationDraft(id: string): Promise<AutomationDraftRow | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb.from("automation_drafts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getAutomationDraft: ${error.message}`);
  if (!data) return null;
  return rowToDraft(data as Record<string, unknown>);
}

export async function createAutomationDraft(name = "Untitled draft"): Promise<string> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("automation_drafts")
    .insert({
      name,
      status: "draft",
      workflow_json: EMPTY_WF,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createAutomationDraft: ${error.message}`);
  return String((data as { id: string }).id);
}

export async function updateAutomationDraft(
  id: string,
  patch: Partial<{
    name: string;
    status: AutomationDraftStatus;
    workflow_json: Workflow;
    close_steps_json: Array<Record<string, unknown>> | null;
    risk_notes: string | null;
    close_sequence_id: string | null;
    operator_goal: string | null;
  }>
): Promise<void> {
  const sb = getSupabaseServer();
  const { error } = await sb
    .from("automation_drafts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`updateAutomationDraft: ${error.message}`);
}
