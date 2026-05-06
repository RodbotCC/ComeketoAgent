"use server";

import { revalidatePath } from "next/cache";
import { sweepActiveLeads } from "@/lib/lead-folder-sweeper";
import { assertOperatorSession } from "@/lib/operator-guard";
import { logExecution } from "@/lib/execution-audit";

export type SweepAllSummary = Awaited<ReturnType<typeof sweepActiveLeads>>;

export async function sweepAllActiveLeadsAction(): Promise<
  { ok: true; summary: SweepAllSummary } | { ok: false; error: string }
> {
  try {
    await assertOperatorSession();
    const summary = await sweepActiveLeads();
    void logExecution({
      action_kind: "sweep_lead_box",
      payload: { mode: "all", summary },
    });
    revalidatePath("/console");
    revalidatePath("/leads");
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
