import { getSupabaseServer } from "./supabase";

export type AssetScope = "lead" | "global";

export type LeadAssetRow = {
  id: string;
  created_at: string;
  updated_at: string;
  scope: AssetScope;
  close_lead_id: string | null;
  title: string;
  filename: string;
  storage_bucket: string;
  storage_path: string;
  mime: string | null;
  byte_size: number | null;
  kind: string;
  description: string | null;
  alt_text: string | null;
  approved_for_customer: boolean;
  source: string;
  metadata: Record<string, unknown>;
};

export type LeadAssetWithUrl = LeadAssetRow & {
  signed_url: string | null;
};

export function assetKind(filename: string, mime?: string | null): string {
  const m = (mime || "").toLowerCase();
  const f = filename.toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(f)) return "image";
  if (m.includes("html") || /\.html?$/i.test(f)) return "html";
  if (m.includes("pdf") || /\.pdf$/i.test(f)) return "pdf";
  if (m.includes("csv") || /\.csv$/i.test(f)) return "csv";
  if (m.includes("json") || /\.json$/i.test(f)) return "json";
  if (m.startsWith("text/") || /\.(txt|md)$/i.test(f)) return "text";
  return "file";
}

export async function listAssetsForLead(
  leadId: string,
  limit = 40
): Promise<LeadAssetWithUrl[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("lead_assets")
    .select("*")
    .or(`scope.eq.global,close_lead_id.eq.${leadId}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listAssetsForLead: ${error.message}`);

  const rows = ((data as LeadAssetRow[]) ?? []).filter(
    (row) => row.scope === "global" || row.close_lead_id === leadId
  );

  return Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await sb.storage
        .from(row.storage_bucket)
        .createSignedUrl(row.storage_path, 300);
      return { ...row, signed_url: signed?.signedUrl ?? null };
    })
  );
}

export async function getAssetById(id: string): Promise<LeadAssetRow | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb.from("lead_assets").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getAssetById: ${error.message}`);
  return (data as LeadAssetRow) ?? null;
}

export async function deleteAssetById(id: string): Promise<void> {
  const sb = getSupabaseServer();
  const row = await getAssetById(id);
  if (!row) return;
  const rm = await sb.storage.from(row.storage_bucket).remove([row.storage_path]);
  if (rm.error) {
    console.warn("[assets] storage remove failed", rm.error.message);
  }
  const { error } = await sb.from("lead_assets").delete().eq("id", id);
  if (error) throw new Error(`deleteAssetById: ${error.message}`);
}
