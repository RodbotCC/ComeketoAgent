"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOperatorSession } from "@/lib/operator-guard";
import {
  createAutomationDraft,
  getAutomationDraft,
  updateAutomationDraft,
} from "@/lib/automation-drafts";
import { interpretWorkflowToCloseSteps } from "@/lib/sequence-ai";
import { closeCreateSequence, closeUpdateSequence } from "@/lib/close";
import type { Workflow } from "@/app/automation/AutomationCanvas";
import { logExecution } from "@/lib/execution-audit";

const DEFAULT_SCHEDULE = {
  ranges: [
    { end: "16:59", start: "09:00", weekday: 1 },
    { end: "16:59", start: "09:00", weekday: 2 },
    { end: "16:59", start: "09:00", weekday: 3 },
    { end: "16:59", start: "09:00", weekday: 4 },
    { end: "16:59", start: "09:00", weekday: 5 },
  ],
};

export async function createAutomationDraftFormAction() {
  await assertOperatorSession();
  const id = await createAutomationDraft();
  revalidatePath("/automation/drafts");
  redirect(`/automation/drafts/${id}`);
}

export async function saveAutomationDraftAction(formData: FormData) {
  await assertOperatorSession();
  const id = String(formData.get("draft_id") || "");
  const name = String(formData.get("name") || "").trim();
  const goal = String(formData.get("operator_goal") || "");
  const wfRaw = String(formData.get("workflow_json") || "").trim();
  if (!id) throw new Error("draft_id required");
  let workflow: Workflow | undefined;
  if (wfRaw) {
    try {
      workflow = JSON.parse(wfRaw) as Workflow;
    } catch {
      throw new Error("workflow_json must be valid JSON");
    }
  }
  await updateAutomationDraft(id, {
    ...(name ? { name } : {}),
    operator_goal: goal || null,
    ...(workflow ? { workflow_json: workflow } : {}),
  });
  revalidatePath(`/automation/drafts/${id}`);
  revalidatePath("/automation/drafts");
}

export async function generateCloseStepsDraftAction(formData: FormData) {
  await assertOperatorSession();
  const id = String(formData.get("draft_id") || "");
  if (!id) throw new Error("draft_id required");
  const draft = await getAutomationDraft(id);
  if (!draft) throw new Error("draft not found");
  const goal =
    String(formData.get("operator_goal") || draft.operator_goal || "").trim();
  if (!goal) throw new Error("operator goal required for AI");

  const r = await interpretWorkflowToCloseSteps(draft.workflow_json, goal);
  if (!r.ok) throw new Error(r.error);

  const riskText = r.result.risks.map((x) => `• ${x}`).join("\n");
  await updateAutomationDraft(id, {
    close_steps_json: r.result.steps,
    risk_notes: riskText,
    status: "needs_review",
    operator_goal: goal,
  });
  revalidatePath(`/automation/drafts/${id}`);
}

export async function approveDraftReviewAction(formData: FormData) {
  await assertOperatorSession();
  const id = String(formData.get("draft_id") || "");
  const confirm = String(formData.get("confirm_review") || "");
  if (!id) throw new Error("draft_id required");
  if (confirm !== "yes") throw new Error("confirmation required");
  const draft = await getAutomationDraft(id);
  if (!draft?.close_steps_json?.length) {
    throw new Error("no proposed steps — run AI interpret first");
  }
  await updateAutomationDraft(id, { status: "approved" });
  revalidatePath(`/automation/drafts/${id}`);
}

export async function publishDraftToCloseAction(formData: FormData) {
  await assertOperatorSession();
  const id = String(formData.get("draft_id") || "");
  const confirm = String(formData.get("confirm_publish") || "");
  const timezone = String(formData.get("timezone") || "America/New_York");
  if (!id) throw new Error("draft_id required");
  if (confirm !== "yes") throw new Error("confirm_publish checkbox required");

  const draft = await getAutomationDraft(id);
  if (!draft) throw new Error("draft not found");
  if (draft.status !== "approved") throw new Error("draft must be approved before publish");
  if (!draft.close_steps_json?.length) throw new Error("no close steps to publish");

  const body: Record<string, unknown> = {
    name: draft.name,
    status: "draft",
    timezone,
    schedule: DEFAULT_SCHEDULE,
    steps: draft.close_steps_json,
  };

  try {
    let seqId = draft.close_sequence_id;
    if (seqId) {
      await closeUpdateSequence(seqId, body);
    } else {
      const created = await closeCreateSequence(body);
      const newId = typeof created.id === "string" ? created.id : null;
      if (!newId) {
        throw new Error(
          "Close create did not return sequence id — use Export JSON and paste into Close, or Open in Close from an existing sequence."
        );
      }
      seqId = newId;
      await updateAutomationDraft(id, { close_sequence_id: seqId });
    }

    await updateAutomationDraft(id, { status: "active" });
    void logExecution({
      action_kind: "publish_automation_draft",
      payload: { draft_id: id, close_sequence_id: seqId },
      result: "ok",
    });
    revalidatePath(`/automation/drafts/${id}`);
    revalidatePath("/automation/drafts");
    revalidatePath("/automation");
  } catch (err) {
    void logExecution({
      action_kind: "publish_automation_draft",
      payload: { draft_id: id },
      result: "error",
    });
    throw err;
  }
}
