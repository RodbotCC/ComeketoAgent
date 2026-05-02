import type { CloseActivity } from "@/lib/close";

export function activityLine(a: CloseActivity): { kind: string; line: string; direction: string } {
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
    return { kind: "task", direction: "·", line: (a.text as string | undefined) || (a.note as string | undefined) || "(task)" };
  }
  if (t === "Meeting") {
    return { kind: "meeting", direction: "·", line: (a.title as string | undefined) || "(meeting)" };
  }
  return { kind: t.toLowerCase(), direction: dir, line: `(${t})` };
}
