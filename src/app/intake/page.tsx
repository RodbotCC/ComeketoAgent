import { AppHeader } from "@/components/AppHeader";
import { TabNav } from "@/components/TabNav";
import { icons } from "@/components/icons";

const DOCS: Array<{ name: string; meta: string }> = [
  { name: "Chat.html",         meta: "landing page · 14kb" },
  { name: "hero.css",          meta: "stylesheet · 3kb" },
  { name: "hero-1.jpg",        meta: "screenshot · changelog" },
  { name: "auto-2.jpg",        meta: "screenshot · workflows" },
  { name: "chat-initial.jpg",  meta: "screenshot · briefing" },
  { name: "chat-scroll.jpg",   meta: "screenshot · cadence" },
];

const SUGGESTED_QUESTIONS = [
  "Summarize what's in these documents",
  "OCR everything and flag uncertain lines",
  "Extract line items into a clean table",
  "Pull every name, address, phone, email",
  "What deadlines are buried in here?",
  "Find contradictions across these files",
];

const SYNTHESIZING_STEPS = [
  { done: true,  label: "Opening the HTML structure" },
  { done: true,  label: "Inspecting hero.css styling" },
  { done: true,  label: "Viewing hero-1 product image" },
  { done: true,  label: "Viewing auto-2 image content" },
  { done: true,  label: "Checking chat-initial screenshot" },
  { done: true,  label: "Checking chat-scroll screenshot" },
  { done: false, label: "Synthesizing document themes" },
];

export default function IntakePage() {
  return (
    <div className="cme-shell chat-shell">
      <AppHeader wordmarkHref="/" />
      <TabNav active="intake" />

      <div className="cmk-scroll scroll-hide" style={{ flex: 1, overflowY: "auto", padding: "22px 28px 16px" }}>
        {/* Top action bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              style={{
                fontSize: 10.5,
                padding: "4px 10px",
                border: "0.5px solid rgba(0,0,0,0.15)",
                borderRadius: 999,
                background: "#FCFBF8",
                color: "#6b6b66",
                cursor: "pointer",
                letterSpacing: "0.06em",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "inherit",
              }}
            >
              ← reports
            </button>
            <span className="cmk-eyebrow">Intake report · 6 docs · 1 answer</span>
          </div>
          <button
            type="button"
            style={{
              fontSize: 10.5,
              padding: "4px 11px",
              border: "0.5px solid rgba(139,53,53,0.2)",
              borderRadius: 999,
              background: "transparent",
              color: "#993333",
              cursor: "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: "inherit",
            }}
          >
            Delete
          </button>
        </div>

        {/* Title */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
          <span className="cmk-dot" style={{ background: "#6B8E5A", alignSelf: "center" }} />
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", margin: 0, lineHeight: 1.1 }}>
            Hi Claude watch this
          </h1>
        </div>
        <div style={{ fontSize: 12.5, color: "#6b6b66", marginBottom: 22, paddingLeft: 19 }}>
          Drop receipts, CSVs, PDFs, photos, notes — anything. Comeketo Agent reads it all and answers your questions.
        </div>

        {/* Drop zone */}
        <div
          style={{
            background: "#FCFBF8",
            border: "1px dashed rgba(0,0,0,0.12)",
            borderRadius: 10,
            padding: 22,
            textAlign: "center",
            marginBottom: 22,
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6b6b66" }}>
            {icons.upload}
            <span>Drop anything here</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ fontSize: 11, color: "#9a9a93" }}>PDF · CSV · images · markdown · JSON</span>
          </div>
        </div>

        {/* What Comeketo Agent has read */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span className="cmk-eyebrow">What Comeketo Agent has read</span>
            <span style={{ fontSize: 11, color: "#9a9a93" }}>{DOCS.length} documents</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {DOCS.map((doc) => (
              <div key={doc.name} className="cmk-doc-panel">
                <span className="cmk-dot" style={{ background: "#6B8E5A", marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "#1a1a1a" }}>{doc.name}</div>
                  <div style={{ fontSize: 11, color: "#9a9a93", marginTop: 1 }}>{doc.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Q&A card */}
        <div
          style={{
            background: "#FCFBF8",
            border: "0.5px solid rgba(0,0,0,0.09)",
            borderRadius: 10,
            padding: "14px 16px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
            marginBottom: 14,
            borderLeft: "2px solid #9B8FB8",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span className="cmk-dot-sm" style={{ background: "#9B8FB8" }} />
            <span className="cmk-eyebrow" style={{ color: "#534AB7" }}>You asked</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
            Summarize what&apos;s in these documents.
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              paddingTop: 10,
              borderTop: "0.5px solid rgba(0,0,0,0.05)",
            }}
          >
            <span className="cmk-dot-sm" style={{ background: "#6B8E5A" }} />
            <span className="cmk-eyebrow" style={{ color: "#3a5230" }}>Comeketo Agent · synthesizing</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: "#6b6b66", paddingLeft: 2 }}>
            {SYNTHESIZING_STEPS.map((step, i) => (
              <div key={i}>
                {step.done ? (
                  <span className="cmk-strike">✓ &nbsp;{step.label}</span>
                ) : (
                  <span style={{ color: "#4a4a45" }}>
                    <span style={{ opacity: 0.5 }}>○</span>&nbsp;&nbsp;{step.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Try one */}
        <div style={{ marginBottom: 16 }}>
          <div className="cmk-eyebrow" style={{ marginBottom: 10 }}>Try one</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SUGGESTED_QUESTIONS.map((q) => (
              <span key={q} className="cmk-chip">{q}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Ask bar */}
      <div style={{ padding: "12px 28px", flexShrink: 0, borderTop: "0.5px solid rgba(0,0,0,0.05)", background: "#FCFBF8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 12.5, color: "#9a9a93" }}>
            Ask Comeketo Agent anything about your documents…
          </span>
          <span style={{ fontSize: 10.5, color: "#b0b0a8", letterSpacing: "0.05em" }}>⌘+Enter</span>
          <button
            type="button"
            style={{
              padding: "5px 14px",
              borderRadius: 6,
              background: "#2C2C2A",
              border: "none",
              color: "#F5F3EE",
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "inherit",
            }}
          >
            Ask <span>→</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 28px",
          fontSize: 10.5,
          color: "#9a9a93",
          flexShrink: 0,
          borderTop: "0.5px solid rgba(0,0,0,0.05)",
        }}
      >
        <span>
          grid · morning &nbsp;/&nbsp; activity &nbsp;/&nbsp;{" "}
          <span style={{ color: "#1a1a1a" }}>intake</span>
        </span>
        <span>
          proposals · personal ·{" "}
          <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "#5a5a55" }}>Comeketo Agent</span>
        </span>
      </footer>
    </div>
  );
}
