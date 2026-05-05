"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LeadAssetWithUrl, AssetScope } from "@/lib/assets";
import { deleteLeadAssetAction, redirectAssetDownload } from "./actions";

const ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "text/html",
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".html",
  ".htm",
  ".pdf",
  ".txt",
  ".md",
  ".json",
].join(",");

type PendingItem = {
  id: string;
  name: string;
  stage: "uploading" | "done" | "error";
  message?: string;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function kindGlyph(kind: string): string {
  if (kind === "image") return "IMG";
  if (kind === "html") return "HTML";
  if (kind === "pdf") return "PDF";
  if (kind === "json") return "{ }";
  if (kind === "text") return "TXT";
  return "FILE";
}

function kindTone(kind: string): string {
  if (kind === "image") return "peach";
  if (kind === "html") return "lavender";
  if (kind === "pdf") return "rose";
  if (kind === "json") return "sky";
  if (kind === "text") return "neutral";
  return "sage";
}

export function LeadAssetsPanel({
  leadId,
  assets,
  downloadError,
}: {
  leadId: string;
  assets: LeadAssetWithUrl[];
  downloadError?: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [scope, setScope] = useState<AssetScope>("lead");
  const [approved, setApproved] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [, startTransition] = useTransition();

  const uploadOne = useCallback(
    async (file: File) => {
      const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setPending((p) => [...p, { id: tempId, name: file.name, stage: "uploading" }]);

      const fd = new FormData();
      fd.set("file", file);
      fd.set("lead_id", leadId);
      fd.set("scope", scope);
      fd.set("approved_for_customer", approved ? "true" : "false");

      try {
        const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setPending((p) =>
            p.map((it) =>
              it.id === tempId ? { ...it, stage: "error", message: j.error || `failed (${res.status})` } : it
            )
          );
          return;
        }
        setPending((p) => p.map((it) => (it.id === tempId ? { ...it, stage: "done" } : it)));
        startTransition(() => router.refresh());
        setTimeout(() => setPending((p) => p.filter((it) => it.id !== tempId)), 2000);
      } catch (err) {
        setPending((p) =>
          p.map((it) =>
            it.id === tempId
              ? { ...it, stage: "error", message: err instanceof Error ? err.message : "failed" }
              : it
          )
        );
      }
    },
    [approved, leadId, router, scope]
  );

  const onFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.size > 0);
      void list.reduce(async (prev, file) => {
        await prev;
        await uploadOne(file);
      }, Promise.resolve());
    },
    [uploadOne]
  );

  const leadAssets = assets.filter((asset) => asset.scope === "lead");
  const globalAssets = assets.filter((asset) => asset.scope === "global");

  return (
    <section className="lead-card widget cmk-assets-panel">
      <div className="cmk-intake-section-h">
        <div>
          <div className="cmk-intake-eyebrow">Assets</div>
          <h2 className="cmk-intake-section-title">What Andre can reuse or send.</h2>
        </div>
        <div className="cmk-assets-mode" aria-label="Asset scope">
          <button type="button" className={scope === "lead" ? "on" : ""} onClick={() => setScope("lead")}>
            this lead
          </button>
          <button type="button" className={scope === "global" ? "on" : ""} onClick={() => setScope("global")}>
            reusable
          </button>
        </div>
      </div>

      {downloadError && <div className="cmk-intake-banner">{downloadError}</div>}

      <div
        className={`cmk-assets-drop${dragOver ? " is-drag" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (event.dataTransfer.files?.length) onFiles(event.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(event) => {
            if (event.target.files?.length) onFiles(event.target.files);
            event.target.value = "";
          }}
          style={{ display: "none" }}
        />
        <div className="cmk-assets-drop-title">
          Drop PNGs, HTML, PDFs, or branded files here.
        </div>
        <div className="cmk-assets-drop-sub">
          Saved as {scope === "global" ? "a reusable asset for every lead" : "a private asset for this lead"}.
        </div>
        <label className="cmk-assets-check" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={approved}
            onChange={(event) => setApproved(event.target.checked)}
          />
          approved for customer-facing use
        </label>
      </div>

      {pending.length > 0 && (
        <ul className="cmk-intake-pending">
          {pending.map((p) => (
            <li key={p.id} className={`cmk-intake-pending-row is-${p.stage}`}>
              <span className="cmk-intake-pending-name">{p.name}</span>
              <span className="cmk-intake-pending-stage">
                {p.stage === "uploading" ? "uploading..." : p.stage === "done" ? "done" : p.message || "failed"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {assets.length === 0 ? (
        <div className="cmk-intake-empty cmk-assets-empty">
          <p>No reusable or lead-specific assets yet.</p>
        </div>
      ) : (
        <div className="cmk-assets-groups">
          <AssetGroup title="This lead" empty="No lead-specific assets." leadId={leadId} assets={leadAssets} />
          <AssetGroup title="Reusable" empty="No reusable assets yet." leadId={leadId} assets={globalAssets} />
        </div>
      )}
    </section>
  );
}

function AssetGroup({
  title,
  empty,
  leadId,
  assets,
}: {
  title: string;
  empty: string;
  leadId: string;
  assets: LeadAssetWithUrl[];
}) {
  return (
    <div className="cmk-assets-group">
      <div className="cmk-assets-group-head">
        <span>{title}</span>
        <strong>{assets.length}</strong>
      </div>
      {assets.length === 0 ? (
        <div className="lead-empty">{empty}</div>
      ) : (
        <div className="cmk-assets-list">
          {assets.map((asset) => {
            const isImage = asset.kind === "image" && asset.signed_url;
            return (
              <article key={asset.id} className="cmk-assets-card">
                <div className="cmk-assets-thumb">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.signed_url!} alt={asset.alt_text || asset.title} />
                  ) : (
                    <span className={`cmk-intake-kind cmk-intake-kind--${kindTone(asset.kind)}`}>
                      {kindGlyph(asset.kind)}
                    </span>
                  )}
                </div>
                <div className="cmk-assets-main">
                  <div className="cmk-assets-title">{asset.title}</div>
                  <div className="cmk-assets-meta">
                    {fmtDate(asset.created_at)}
                    {asset.byte_size != null && (
                      <>
                        <span className="cmk-intake-dot">·</span>
                        {fmtBytes(asset.byte_size)}
                      </>
                    )}
                    <span className="cmk-intake-dot">·</span>
                    {asset.kind}
                  </div>
                  {asset.description && <p>{asset.description}</p>}
                  <div className="cmk-assets-flags">
                    <span>{asset.scope === "global" ? "reusable" : "lead-specific"}</span>
                    <span className={asset.approved_for_customer ? "is-approved" : ""}>
                      {asset.approved_for_customer ? "customer approved" : "internal only"}
                    </span>
                  </div>
                  <div className="cmk-assets-actions">
                    <form action={redirectAssetDownload}>
                      <input type="hidden" name="asset_id" value={asset.id} />
                      <input type="hidden" name="lead_id" value={leadId} />
                      <button type="submit" className="cmk-intake-link-btn">
                        Download
                      </button>
                    </form>
                    <form action={deleteLeadAssetAction}>
                      <input type="hidden" name="asset_id" value={asset.id} />
                      <input type="hidden" name="lead_id" value={leadId} />
                      <button type="submit" className="cmk-intake-link-btn cmk-assets-delete">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
