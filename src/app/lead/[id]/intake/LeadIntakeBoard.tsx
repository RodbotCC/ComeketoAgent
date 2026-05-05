"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IntakeArtifactRow } from "@/lib/intake-artifacts";
import {
  redirectIntakeArtifactDownload,
  deleteIntakeArtifactAction,
} from "../actions";

const ACCEPT = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  ".md",
  ".txt",
  ".csv",
  ".json",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
].join(",");

type PendingItem = {
  id: string;
  name: string;
  size: number;
  stage: "uploading" | "extracting" | "done" | "error";
  message?: string;
};

type Props = {
  leadId: string;
  artifacts: IntakeArtifactRow[];
  downloadError?: string | null;
};

const KIND_DEFS: Array<{ test: (a: IntakeArtifactRow) => boolean; glyph: string; label: string; tone: string }> = [
  { test: (a) => /\.pdf$/i.test(a.filename) || (a.mime || "").includes("pdf"), glyph: "PDF", label: "pdf", tone: "rose" },
  { test: (a) => /\.csv$/i.test(a.filename) || (a.mime || "").includes("csv"), glyph: "CSV", label: "csv", tone: "sage" },
  { test: (a) => /\.json$/i.test(a.filename) || (a.mime || "").includes("json"), glyph: "{ }", label: "json", tone: "lavender" },
  { test: (a) => /\.md$/i.test(a.filename) || (a.mime || "").includes("markdown"), glyph: "MD", label: "markdown", tone: "sky" },
  { test: (a) => /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(a.filename) || (a.mime || "").startsWith("image/"), glyph: "IMG", label: "image", tone: "peach" },
  { test: (a) => /\.(mp4|mov|webm|mkv)$/i.test(a.filename) || (a.mime || "").startsWith("video/"), glyph: "VID", label: "video", tone: "lemon" },
  { test: (a) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(a.filename) || (a.mime || "").startsWith("audio/"), glyph: "WAV", label: "audio", tone: "lemon" },
  { test: (a) => /\.(txt|html?)$/i.test(a.filename) || (a.mime || "").startsWith("text/"), glyph: "TXT", label: "text", tone: "neutral" },
];

function kindFor(a: IntakeArtifactRow) {
  return KIND_DEFS.find((k) => k.test(a)) ?? { glyph: "FILE", label: a.mime || "file", tone: "neutral" };
}

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

function snippet(a: IntakeArtifactRow): string {
  const text = (a.extracted_text || a.summary || "").trim();
  if (!text) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 220 ? oneLine.slice(0, 220) + "…" : oneLine;
}

export function LeadIntakeBoard({ leadId, artifacts, downloadError }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [, startTransition] = useTransition();

  const uploadOne = useCallback(
    async (file: File) => {
      const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setPending((p) => [
        ...p,
        { id: tempId, name: file.name, size: file.size, stage: "uploading" },
      ]);

      const fd = new FormData();
      fd.set("file", file);
      fd.set("lead_id", leadId);

      try {
        const res = await fetch("/api/intake/upload", { method: "POST", body: fd });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          artifact_id?: string;
        };
        if (!res.ok) {
          setPending((p) =>
            p.map((it) => (it.id === tempId ? { ...it, stage: "error", message: j.error || `failed (${res.status})` } : it))
          );
          return;
        }
        // Phase 1 of harness/ overhaul: upload route extracts inline and
        // writes directly to the file tree. The separate /api/intake/extract
        // call is no longer needed; keeping a brief "extracting" frame for
        // visual continuity then transitioning to done.
        if (j.artifact_id) {
          setPending((p) => p.map((it) => (it.id === tempId ? { ...it, stage: "extracting" } : it)));
        }
        setPending((p) => p.map((it) => (it.id === tempId ? { ...it, stage: "done" } : it)));
        // Drop the row 2s after refresh so the operator sees the success tick briefly.
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
    [leadId, router]
  );

  const onFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.size > 0);
      // Sequential upload — keeps server load predictable + keeps UI ordering stable.
      void list.reduce(async (prev, f) => {
        await prev;
        await uploadOne(f);
      }, Promise.resolve());
    },
    [uploadOne]
  );

  return (
    <div className="cmk-intake-board">
      {downloadError && (
        <div className="cmk-intake-banner">{downloadError}</div>
      )}

      <div
        className={`cmk-intake-drop${dragOver ? " is-drag" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
        <div className="cmk-intake-drop-arrow" aria-hidden>
          ↓
        </div>
        <div className="cmk-intake-drop-title">Drop anything in here.</div>
        <div className="cmk-intake-drop-sub">
          Receipts · invoices · CSV · PDFs · photos · markdown · JSON · TXT — the agent reads them all.
        </div>
        <div className="cmk-intake-drop-cta">click to browse</div>
      </div>

      {pending.length > 0 && (
        <ul className="cmk-intake-pending">
          {pending.map((p) => (
            <li key={p.id} className={`cmk-intake-pending-row is-${p.stage}`}>
              <span className="cmk-intake-pending-name">{p.name}</span>
              <span className="cmk-intake-pending-size">{fmtBytes(p.size)}</span>
              <span className="cmk-intake-pending-stage">
                {p.stage === "uploading"
                  ? "uploading…"
                  : p.stage === "extracting"
                  ? "extracting…"
                  : p.stage === "done"
                  ? "done"
                  : p.message || "failed"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="cmk-intake-section-h">
        <div className="cmk-intake-eyebrow">Documents</div>
        <h2 className="cmk-intake-section-title">What the agent has read.</h2>
      </div>

      {artifacts.length === 0 ? (
        <div className="cmk-intake-empty">
          <p>No materials yet — drop a file above to give the agent context for this lead.</p>
        </div>
      ) : (
        <div className="cmk-intake-grid">
          {artifacts.map((a) => {
            const k = kindFor(a);
            const body = snippet(a);
            return (
              <article key={a.id} className="cmk-intake-card">
                <header className="cmk-intake-card-head">
                  <span className={`cmk-intake-kind cmk-intake-kind--${k.tone}`}>{k.glyph}</span>
                  <div className="cmk-intake-card-title-wrap">
                    <div className="cmk-intake-card-title" title={a.filename}>
                      {a.filename}
                    </div>
                    <div className="cmk-intake-card-meta">
                      {fmtDate(a.created_at)}
                      {a.byte_size != null && (
                        <>
                          <span className="cmk-intake-dot">·</span>
                          {fmtBytes(a.byte_size)}
                        </>
                      )}
                      {a.extracted_text && (
                        <>
                          <span className="cmk-intake-dot">·</span>
                          {a.extracted_text.length.toLocaleString()} chars
                        </>
                      )}
                    </div>
                  </div>
                  <form action={deleteIntakeArtifactAction} className="cmk-intake-card-x">
                    <input type="hidden" name="artifact_id" value={a.id} />
                    <input type="hidden" name="lead_id" value={leadId} />
                    <button
                      type="submit"
                      aria-label={`Remove ${a.filename}`}
                      title="Remove"
                      className="cmk-intake-x-btn"
                    >
                      ×
                    </button>
                  </form>
                </header>

                {body && <p className="cmk-intake-card-body">{body}</p>}

                {a.extracted_text && (
                  <details className="cmk-intake-card-details">
                    <summary>View full extracted text</summary>
                    <pre className="cmk-intake-card-pre">{a.extracted_text}</pre>
                  </details>
                )}

                <footer className="cmk-intake-card-foot">
                  <form action={redirectIntakeArtifactDownload}>
                    <input type="hidden" name="artifact_id" value={a.id} />
                    <input type="hidden" name="lead_id" value={leadId} />
                    <button type="submit" className="cmk-intake-link-btn">
                      Download
                    </button>
                  </form>
                  {!a.extracted_text && (
                    <span className="cmk-intake-badge-muted">extraction deferred</span>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
