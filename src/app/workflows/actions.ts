"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertOperatorSession } from "@/lib/operator-guard";
import { getSupabaseServer } from "@/lib/supabase";
import {
  createAutomationDraft,
  getAutomationDraft,
  updateAutomationDraft,
} from "@/lib/automation-drafts";
import { closeCreateSequence } from "@/lib/close";
import { workflowToCloseSequence } from "@/lib/manifest-to-close";
import { logExecution } from "@/lib/execution-audit";

/** Creates a fresh workflow draft and redirects to its authoring page. */
export async function createWorkflowDraftAction(formData?: FormData) {
  await assertOperatorSession();
  const seedName = formData
    ? String(formData.get("name") || "Untitled workflow")
    : "Untitled workflow";
  const id = await createAutomationDraft(seedName);
  revalidatePath("/workflows");
  redirect(`/workflows/${id}`);
}

/** Renames a draft. */
export async function renameWorkflowDraftAction(formData: FormData) {
  await assertOperatorSession();
  const id = String(formData.get("draft_id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!id || !name) throw new Error("draft_id and name required");
  await updateAutomationDraft(id, { name });
  revalidatePath(`/workflows/${id}`);
  revalidatePath("/workflows");
}

/** Deletes a draft. Soft for now (just delete the row). */
export async function deleteWorkflowDraftAction(formData: FormData) {
  await assertOperatorSession();
  const id = String(formData.get("draft_id") || "").trim();
  const stayOnList = String(formData.get("stay_on_list") || "") === "1";
  if (!id) throw new Error("draft_id required");
  const sb = getSupabaseServer();
  const { error } = await sb.from("automation_drafts").delete().eq("id", id);
  if (error) throw new Error(`delete draft failed: ${error.message}`);
  revalidatePath("/workflows");
  if (!stayOnList) redirect("/workflows");
}

/**
 * Sweep all drafts whose non-wait step count is 0. Used by the "Clear empty
 * drafts" button on /workflows for cleaning up testing remnants.
 *
 * Returns the number of drafts deleted so the UI can show a count.
 */
export async function deleteEmptyDraftsAction(): Promise<{ deleted: number }> {
  await assertOperatorSession();
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("automation_drafts")
    .select("id, workflow_json, close_sequence_id")
    .is("close_sequence_id", null);
  if (error) throw new Error(`list drafts failed: ${error.message}`);

  const emptyIds: string[] = [];
  for (const row of data ?? []) {
    const wf = (row as { workflow_json?: { nodes?: Array<{ kind?: string }> } }).workflow_json;
    const stepCount = wf?.nodes?.filter((n) => n.kind !== "wait").length ?? 0;
    if (stepCount === 0) emptyIds.push((row as { id: string }).id);
  }

  if (emptyIds.length === 0) {
    return { deleted: 0 };
  }

  const { error: delErr } = await sb.from("automation_drafts").delete().in("id", emptyIds);
  if (delErr) throw new Error(`bulk delete failed: ${delErr.message}`);
  revalidatePath("/workflows");
  return { deleted: emptyIds.length };
}

/**
 * Compile the draft → Close sequence body, fire `closeCreateSequence`, and
 * stamp the returned `close_sequence_id` back onto the draft. Returns
 * `{ ok, html_url? }` so the UI can deep-link to Close.
 */
export async function publishWorkflowDraftAction(
  draftId: string
): Promise<{ ok: true; html_url?: string; sequence_id: string } | { ok: false; error: string }> {
  try {
    await assertOperatorSession();
    const draft = await getAutomationDraft(draftId);
    if (!draft) return { ok: false, error: "draft not found" };

    const body = await workflowToCloseSequence(draft);
    const created = await closeCreateSequence(body);
    const sequenceId = String(created.id);
    const htmlUrl = typeof created.html_url === "string" ? created.html_url : undefined;

    await updateAutomationDraft(draftId, {
      close_sequence_id: sequenceId,
      status: "active",
      close_steps_json: body.steps as Array<Record<string, unknown>>,
    });

    void logExecution({
      action_kind: "publish_automation_draft",
      payload: {
        stage: "publish",
        draft_id: draftId,
        close_sequence_id: sequenceId,
        step_count: body.steps.length,
      },
    });

    revalidatePath("/workflows");
    revalidatePath(`/workflows/${draftId}`);

    return { ok: true, sequence_id: sequenceId, html_url: htmlUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
