"use client";

import { useTransition } from "react";
import { useToast } from "@/components/Toast";
import { CLIENT_BOX_DOCS, type ClientBoxDoc } from "@/lib/client-box-contract";
import {
  sweepLeadBoxAction,
  regenerateClientBoxDocsAction,
  regenerateOneClientBoxDocAction,
  runLeadBoxWorkflowAction,
  type ClientBoxDocKey,
} from "../actions";

type Props = {
  leadId: string;
  presentDocs: string[];
  commJsonCount: number;
};

const FILE_TO_DOC_KEY: Record<string, ClientBoxDocKey> = {
  "03_comms_interpreted.md": "comms",
  "04_profile.md": "profile",
  "06_discovery.md": "discovery",
  "07_andre_alerts.md": "alerts",
  "08_client_ledger.md": "ledger",
};

function phaseLabel(phase: ClientBoxDoc["phase"]): string {
  switch (phase) {
    case "raw":       return "raw";
    case "ai":        return "AI";
    case "execution": return "execution";
    case "operator":  return "operator";
  }
}

export function ClientBoxActions({ leadId, presentDocs, commJsonCount }: Props) {
  const present = new Set(presentDocs);
  const completedDocs = CLIENT_BOX_DOCS.filter((d) => present.has(d.file)).length;

  const toast = useToast();
  const [refreshPending, startRefresh] = useTransition();
  const [regenAllPending, startRegenAll] = useTransition();
  const [workflowPending, startWorkflow] = useTransition();

  function callRefresh() {
    const fd = new FormData();
    fd.set("lead_id", leadId);
    startRefresh(async () => {
      try {
        await sweepLeadBoxAction(fd);
        toast.push("Box refreshed from Close.", { tone: "success" });
      } catch (err) {
        toast.push(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`, { tone: "error" });
      }
    });
  }

  function callRegenAll() {
    const fd = new FormData();
    fd.set("lead_id", leadId);
    startRegenAll(async () => {
      try {
        await regenerateClientBoxDocsAction(fd);
        toast.push("AI docs regenerated.", { tone: "success" });
      } catch (err) {
        toast.push(`Regen failed: ${err instanceof Error ? err.message : String(err)}`, { tone: "error" });
      }
    });
  }

  function callWorkflow() {
    const fd = new FormData();
    fd.set("lead_id", leadId);
    startWorkflow(async () => {
      try {
        await runLeadBoxWorkflowAction(fd);
        toast.push("Workflow complete: raw → AI → plan.", { tone: "success", ttl: 5000 });
      } catch (err) {
        toast.push(`Workflow failed: ${err instanceof Error ? err.message : String(err)}`, { tone: "error" });
      }
    });
  }

  const busy = refreshPending || regenAllPending || workflowPending;

  return (
    <>
      <div className="lead-feed-head">
        <div>
          <h3 className="lead-card-h" style={{ marginBottom: 4 }}>Client box contract</h3>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Canonical lead folder shape: raw substrate first, AI interpretation second, execution state third.
          </p>
        </div>
        <span className="lead-feed-counts">
          <span className="lead-feed-count">{completedDocs}/{CLIENT_BOX_DOCS.length} docs</span>
          <span className="lead-feed-count">raw comms {commJsonCount}</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button
          className="lead-back"
          type="button"
          onClick={callRefresh}
          disabled={busy}
        >
          {refreshPending ? "Refreshing…" : "Refresh raw box from Close"}
        </button>
        <button
          className="lead-back"
          type="button"
          onClick={callRegenAll}
          disabled={busy}
        >
          {regenAllPending ? "Regenerating…" : "Regenerate AI docs from raw box"}
        </button>
        <button
          className="lead-back"
          type="button"
          onClick={callWorkflow}
          disabled={busy}
          title="Runs the canonical order: raw Close sweep, AI docs, then seven-day plan"
        >
          {workflowPending ? "Running workflow…" : "Run raw → AI → plan"}
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 8,
          marginTop: 12,
        }}
      >
        {CLIENT_BOX_DOCS.map((doc) => (
          <DocCard
            key={doc.file}
            doc={doc}
            leadId={leadId}
            present={present.has(doc.file)}
            anyTopPending={busy}
          />
        ))}
      </div>
    </>
  );
}

function DocCard({
  doc,
  leadId,
  present,
  anyTopPending,
}: {
  doc: ClientBoxDoc;
  leadId: string;
  present: boolean;
  anyTopPending: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const docKey = FILE_TO_DOC_KEY[doc.file];
  const canRegen = !!docKey;

  function callRegen() {
    if (!docKey) return;
    const fd = new FormData();
    fd.set("lead_id", leadId);
    fd.set("doc_key", docKey);
    startTransition(async () => {
      try {
        await regenerateOneClientBoxDocAction(fd);
        toast.push(`${doc.label} regenerated.`, { tone: "success" });
      } catch (err) {
        toast.push(`${doc.label} regen failed: ${err instanceof Error ? err.message : String(err)}`, { tone: "error" });
      }
    });
  }

  return (
    <div
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 8,
        padding: "10px 12px",
        background: present ? "var(--paper)" : "var(--paper-2)",
        position: "relative",
      }}
    >
      <div className="lead-sub-meta" style={{ marginBottom: 4 }}>
        <span className={`lead-sub-status lead-sub-status-${present ? "active" : "paused"}`}>
          {present ? "present" : "missing"}
        </span>
        <span className="lead-sep">·</span>
        <span>{phaseLabel(doc.phase)}</span>
      </div>
      <div className="lead-sub-name" style={{ fontSize: 13 }}>{doc.file}</div>
      <div className="lead-empty" style={{ marginTop: 4 }}>{doc.label}</div>
      <p className="muted" style={{ margin: "6px 0 0", fontSize: 11, lineHeight: 1.35 }}>
        {doc.description}
      </p>
      {canRegen ? (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={callRegen}
            disabled={pending || anyTopPending}
            className="cmk-utility-link"
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              fontSize: 11,
              color: "#6b6b66",
              cursor: pending || anyTopPending ? "default" : "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
            aria-label={`regenerate ${doc.file}`}
          >
            {pending ? "regenerating…" : "↻ regenerate"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
