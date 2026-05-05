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
  if (!id) throw new Error("draft_id required");
  const sb = getSupabaseServer();
  const { error } = await sb.from("automation_drafts").delete().eq("id", id);
  if (error) throw new Error(`delete draft failed: ${error.message}`);
  revalidatePath("/workflows");
  redirect("/workflows");
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

    const body = workflowToCloseSequence(draft);
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
