"use server";

import { redirect } from "next/navigation";
import { getIntakeArtifactById } from "@/lib/intake-artifacts";
import { getSupabaseServer } from "@/lib/supabase";

function boxPath(leadId: string, code?: string): string {
  const base = `/lead/${encodeURIComponent(leadId)}/box`;
  return code ? `${base}?intake_dl=${code}` : base;
}

/** Form: hidden `artifact_id`, `lead_id` — redirects to a short-lived signed download URL. */
export async function redirectIntakeArtifactDownload(formData: FormData) {
  const artifactId = String(formData.get("artifact_id") ?? "").trim();
  const leadId = String(formData.get("lead_id") ?? "").trim();
  if (!artifactId || !leadId) {
    redirect(leadId ? boxPath(leadId, "bad_request") : "/intake");
  }

  const row = await getIntakeArtifactById(artifactId);
  if (!row || row.lead_id !== leadId) {
    redirect(boxPath(leadId, "not_found"));
  }

  const sb = getSupabaseServer();
  const { data, error } = await sb.storage.from("intake").createSignedUrl(row.storage_path, 120);
  if (error || !data?.signedUrl) {
    redirect(boxPath(leadId, "signed_url"));
  }

  redirect(data.signedUrl);
}
