/**
 * Guardrails §H1: safe HTML preview for outbound email drafts (no raw customer send yet).
 * Escapes all text; paragraphs from double newlines; single newlines → <br>.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text draft → minimal HTML safe to inject for operator preview only. */
export function emailDraftPlainToPreviewHtml(plain: string): string {
  const t = plain.trim();
  if (!t) return "";
  const paras = t.split(/\n\n+/).map((p) => escapeHtml(p.trim()).replace(/\n/g, "<br />\n"));
  return paras.map((p) => `<p style="margin:0 0 12px;font-family:var(--font-body,Georgia,serif);font-size:14px;line-height:1.45">${p}</p>`).join("\n");
}
