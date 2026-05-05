/**
 * Lead asset library — file-canonical (Phase 6.1, 2026-05-05).
 *
 * Thin compatibility layer that preserves existing call sites (UI components,
 * server actions) while routing through the harness file tree. All actual
 * logic lives in `assets-fs.ts`.
 */

import {
  listAssetsForLeadFs,
  getAssetByIdFs,
  deleteAssetByIdFs,
  assetKind,
  type AssetMeta,
  type AssetWithRawUrl,
} from "./assets-fs";

export { assetKind };
export type { AssetMeta };

export type AssetScope = "lead" | "global";

/** Legacy row shape preserved so existing UI consumers don't churn. */
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

function adapt(meta: AssetMeta): LeadAssetRow {
  return {
    id: meta.id,
    created_at: meta.created_at,
    updated_at: meta.updated_at,
    scope: meta.scope,
    close_lead_id: meta.close_lead_id,
    title: meta.title,
    filename: meta.filename,
    storage_bucket: "harness",
    storage_path: meta.storage_path,
    mime: meta.mime,
    byte_size: meta.byte_size,
    kind: meta.kind,
    description: meta.description,
    alt_text: meta.alt_text,
    approved_for_customer: meta.approved_for_customer,
    source: meta.source,
    metadata: {},
  };
}

export async function listAssetsForLead(
  leadId: string,
  limit = 40,
): Promise<LeadAssetWithUrl[]> {
  const items = await listAssetsForLeadFs(leadId, limit);
  return items.map(
    (a: AssetWithRawUrl): LeadAssetWithUrl => ({
      ...adapt(a),
      signed_url: a.raw_url, // raw GitHub URL serves as the asset link
    }),
  );
}

export async function getAssetById(id: string): Promise<LeadAssetRow | null> {
  const meta = await getAssetByIdFs(id);
  return meta ? adapt(meta) : null;
}

export async function deleteAssetById(id: string): Promise<void> {
  await deleteAssetByIdFs(id);
}
