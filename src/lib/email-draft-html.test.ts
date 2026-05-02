import { describe, expect, it } from "vitest";
import { emailDraftPlainToPreviewHtml } from "./email-draft-html";

describe("emailDraftPlainToPreviewHtml", () => {
  it("escapes HTML in plain text", () => {
    const html = emailDraftPlainToPreviewHtml('Hello <script>x</script> & you');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<script>");
  });
  it("wraps paragraphs", () => {
    const html = emailDraftPlainToPreviewHtml("A\n\nB");
    expect(html).toMatch(/<p/);
    expect(html).toContain("A");
    expect(html).toContain("B");
  });
});
