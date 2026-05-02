"use client";

import { useState } from "react";
import Link from "next/link";

/** POST `/api/intake/upload` with multipart field `file`, optional `lead_id` (Close id like `lead_…`). */
export function IntakeUploader() {
  const [leadId, setLeadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="cmk-stack-panel cmk-stack-panel--sky cmk-stack-panel--tight-top"
      style={{ padding: "16px 18px 18px", marginBottom: 20 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const input = form.elements.namedItem("file") as HTMLInputElement;
        const file = input?.files?.[0];
        if (!file || file.size === 0) {
          setMessage("Choose a file to upload.");
          return;
        }
        setBusy(true);
        setMessage(null);
        const fd = new FormData();
        fd.set("file", file);
        const lid = leadId.trim();
        if (lid) fd.set("lead_id", lid);
        try {
          const res = await fetch("/api/intake/upload", { method: "POST", body: fd });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!res.ok) {
            setMessage(j.error || `Upload failed (${res.status})`);
            setBusy(false);
            return;
          }
          setMessage("Uploaded.");
          form.reset();
          setLeadId(lid);
          window.location.reload();
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Upload failed");
          setBusy(false);
        }
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Upload to intake storage</div>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 14px", lineHeight: 1.45, maxWidth: "40rem" }}>
        Files go to Supabase; optional <strong>lead id</strong> links the file to the lead Box tab (
        <code style={{ fontSize: 11 }}>lead_…</code>).
      </p>
      <label className="muted" style={{ display: "block", fontSize: 11, fontWeight: 500, letterSpacing: "0.05em" }}>
        LEAD ID · OPTIONAL
        <input
          type="text"
          name="lead_id_display"
          value={leadId}
          onChange={(ev) => setLeadId(ev.target.value)}
          placeholder="lead_…"
          autoComplete="off"
          disabled={busy}
          className="cmk-field-panel"
          style={{ display: "block", width: "100%", maxWidth: "28rem", marginTop: 8 }}
        />
      </label>
      <label className="cmk-file-lane">
        <span className="cmk-file-lane-label">File</span>
        <input
          type="file"
          name="file"
          aria-label="File to upload"
          disabled={busy}
          style={{ display: "block", marginTop: 8, fontSize: 11, width: "100%" }}
        />
      </label>
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" className="plan-btn plan-btn-primary" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </button>
        {message && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{message}</span>}
      </div>
      <p className="muted" style={{ fontSize: 11, margin: "14px 0 0" }}>
        Questions → <Link href="/chat">Chat</Link>
      </p>
    </form>
  );
}
