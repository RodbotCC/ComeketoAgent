"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import type { CloseActivity } from "@/lib/close";

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type LineInfo = { kind: string; line: string; direction: string };

function activityLine(a: CloseActivity): LineInfo {
  const t = a._type;
  const dir = a.direction === "inbound" ? "←" : a.direction === "outbound" ? "→" : "·";
  if (t === "Email") {
    const subj = a.subject || "(no subject)";
    return { kind: "email", direction: dir, line: subj };
  }
  if (t === "SMS") {
    const text = (a.text || "").trim();
    return { kind: "sms", direction: dir, line: text.length > 120 ? text.slice(0, 119) + "…" : text };
  }
  if (t === "Call") {
    const dur = typeof a.duration === "number" ? `${Math.round(a.duration / 60)}m` : "—";
    return { kind: "call", direction: dir, line: `${dur} · ${a.note ? a.note.slice(0, 80) : "(no notes)"}` };
  }
  if (t === "Note") {
    const txt = (a.note as string | undefined) || "";
    return { kind: "note", direction: "·", line: txt.length > 120 ? txt.slice(0, 119) + "…" : txt };
  }
  if (t === "Task") {
    return { kind: "task", direction: "·", line: ((a.text as string | undefined) || (a.note as string | undefined) || "(task)") };
  }
  if (t === "Meeting") {
    return { kind: "meeting", direction: "·", line: (a.title as string | undefined) || "(meeting)" };
  }
  return { kind: t.toLowerCase(), direction: dir, line: `(${t})` };
}

function fullBody(a: CloseActivity): string {
  if (a._type === "Email") {
    const subj = a.subject ? `Subject: ${a.subject}\n\n` : "";
    return subj + ((a.body_text as string) || (a.body_html as string) || "(no body)");
  }
  if (a._type === "SMS") return (a.text as string) || "(no text)";
  if (a._type === "Call") {
    const dur = typeof a.duration === "number" ? `Duration: ${Math.round(a.duration / 60)}m\n\n` : "";
    const note = (a.note as string) || "";
    const tx = a.transcript ? `\n\n— Transcript —\n${typeof a.transcript === "string" ? a.transcript : JSON.stringify(a.transcript, null, 2)}` : "";
    return dur + note + tx;
  }
  if (a._type === "Note") return (a.note as string) || "(no note)";
  if (a._type === "Task") return (a.text as string) || (a.note as string) || "(no task body)";
  if (a._type === "Meeting") return (a.title as string) || "(no title)";
  return JSON.stringify(a, null, 2);
}

export function ActivityFeed({ activities }: { activities: CloseActivity[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const sorted = [...activities].sort(
    (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
  );
  const open = openId ? sorted.find((a) => a.id === openId) : null;

  if (sorted.length === 0) {
    return <div className="lead-empty" style={{ marginTop: 12 }}>no activity yet</div>;
  }

  return (
    <>
      <ol className="lead-feed">
        {sorted.slice(0, 60).map((a) => {
          const { kind, direction, line } = activityLine(a);
          return (
            <li
              key={a.id}
              className={`lead-feed-item lead-feed-item-${kind} lead-feed-item-clickable`}
              onClick={() => setOpenId(a.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpenId(a.id);
                }
              }}
            >
              <span className="lead-feed-when">{fmtDate(a.date_created)}</span>
              <span className={`lead-feed-dir lead-feed-dir-${a.direction || "system"}`}>{direction}</span>
              <span className="lead-feed-kind">{kind}</span>
              <span className="lead-feed-line">{line}</span>
            </li>
          );
        })}
      </ol>

      <Modal open={!!open} onClose={() => setOpenId(null)} labelledBy="activity-modal-h">
        {open && (
          <div className="plan-day-modal">
            <header className="plan-day-modal-head" style={{ background: "var(--paper-2)" }}>
              <span className="cme-eyebrow">
                {open._type} {open.direction ? `· ${open.direction}` : ""}
              </span>
              <h2 id="activity-modal-h" className="plan-day-modal-title">
                {activityLine(open).line || `${open._type} activity`}
              </h2>
              <p className="plan-day-modal-context">{fmtDate(open.date_created)}</p>
            </header>
            <div className="plan-day-modal-body">
              <pre className="activity-body-pre">{fullBody(open)}</pre>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
