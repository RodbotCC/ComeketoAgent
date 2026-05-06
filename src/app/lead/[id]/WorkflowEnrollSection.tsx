import {
  closeListWorkflows,
  closeListPhoneNumbers,
  closeListEmailTemplates,
  closeListSmsTemplates,
  type CloseWorkflow,
} from "@/lib/close";
import { enrollInSequenceAction } from "./actions";
import { EnrollSubmitButton } from "./EnrollSubmitButton";

export async function WorkflowEnrollSection({
  leadId,
  contacts,
}: {
  leadId: string;
  contacts: Array<{ id: string; name?: string }>;
}) {
  let workflows: CloseWorkflow[] = [];
  try {
    workflows = await closeListWorkflows({ limit: 60 });
  } catch {
    workflows = [];
  }
  let phoneLines: string[] = [];
  try {
    const phones = await closeListPhoneNumbers({ limit: 15 });
    phoneLines = phones.map((p) => p.phone || p.id).filter(Boolean) as string[];
  } catch {
    phoneLines = [];
  }

  let emailTplCount = 0;
  let smsTplCount = 0;
  try {
    const [et, st] = await Promise.all([
      closeListEmailTemplates({ limit: 40 }),
      closeListSmsTemplates({ limit: 40 }),
    ]);
    emailTplCount = et.length;
    smsTplCount = st.length;
  } catch {
    /* ignore */
  }

  const activeSeq = workflows.filter((w) => w.status === "active");

  return (
    <div className="lead-enroll widget" style={{ marginTop: 14, padding: "12px 14px" }}>
      <h4 className="lead-card-h" style={{ fontSize: 13, marginBottom: 8 }}>
        Enroll in workflow (Close write)
      </h4>
      <p style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 10 }}>
        Guardrail: confirm checkbox required. Uses first org phone as sender when available. Operator session
        required if <code>OPERATOR_PASSWORD</code> is set.
      </p>
      {phoneLines.length > 0 && (
        <p style={{ fontSize: 11, marginBottom: 10 }}>
          <strong>Sending lines:</strong> {phoneLines.slice(0, 4).join(", ")}
          {phoneLines.length > 4 ? "…" : ""}
        </p>
      )}
      {(emailTplCount > 0 || smsTplCount > 0) && (
        <p style={{ fontSize: 11, marginBottom: 10, color: "var(--ink-soft)" }}>
          <strong>Org templates (read-only):</strong> {emailTplCount} email · {smsTplCount} SMS — sequences must
          match Close sender + template constraints before live sends.
        </p>
      )}
      <form action={enrollInSequenceAction} className="lead-enroll-form">
        <input type="hidden" name="lead_id" value={leadId} />
        <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
          Sequence
          <select name="sequence_id" required className="leads-search-select" style={{ display: "block", marginTop: 4, maxWidth: "100%" }}>
            <option value="">— pick —</option>
            {activeSeq.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name || w.id} ({w.status})
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
          Contact
          <select name="contact_id" required className="leads-search-select" style={{ display: "block", marginTop: 4, maxWidth: "100%" }}>
            <option value="">— pick —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 10 }}>
          <input type="checkbox" name="confirm" value="yes" required />
          I confirm enrollment in Close
        </label>
        <EnrollSubmitButton />
      </form>
    </div>
  );
}
