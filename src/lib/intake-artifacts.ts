import { getSupabaseServer } from "./supabase";

export type IntakeArtifactRow = {
  id: string;
  created_at: string;
  filename: string;
  storage_path: string;
  mime: string | null;
  byte_size: number | null;
  summary: string | null;
  lead_id: string | null;
};

export async function listRecentIntakeArtifacts(limit = 30): Promise<IntakeArtifactRow[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("intake_artifacts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentIntakeArtifacts: ${error.message}`);
  return (data as IntakeArtifactRow[]) ?? [];
}

export async function listIntakeArtifactsForLead(
  leadId: string,
  limit = 24
): Promise<IntakeArtifactRow[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("intake_artifacts")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listIntakeArtifactsForLead: ${error.message}`);
  return (data as IntakeArtifactRow[]) ?? [];
}

export async function getIntakeArtifactById(id: string): Promise<IntakeArtifactRow | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb.from("intake_artifacts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getIntakeArtifactById: ${error.message}`);
  return (data as IntakeArtifactRow) ?? null;
}
