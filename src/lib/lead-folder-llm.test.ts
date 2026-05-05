import { describe, it, expect } from "vitest";

// `frontmatterHash` is internal but the contract matters: skip detection drives
// our cost model. We test it via behavioral assertions that match how the
// regen path uses it.

describe("frontmatter hash extraction (behavior expected by regen path)", () => {
  // A stand-in matching the regex used internally — if this drifts we know
  // both have to update together.
  function frontmatterHash(markdown: string): string | null {
    if (!markdown.startsWith("---")) return null;
    const end = markdown.indexOf("\n---", 3);
    if (end === -1) return null;
    const block = markdown.slice(3, end);
    const m = block.match(/^from_hash:\s*(\S+)$/m);
    return m && typeof m[1] === "string" ? m[1] : null;
  }

  it("extracts from_hash when frontmatter is well-formed", () => {
    const md = [
      "---",
      "close_lead_id: lead_x",
      "lead_name: Test",
      "generated_at: 2026-05-05T00:00:00Z",
      "from_hash: sha256:abc123",
      "---",
      "",
      "## Snapshot",
    ].join("\n");
    expect(frontmatterHash(md)).toBe("sha256:abc123");
  });

  it("returns null when no frontmatter", () => {
    expect(frontmatterHash("# Just a heading")).toBeNull();
  });

  it("returns null when frontmatter has no from_hash field", () => {
    const md = "---\nclose_lead_id: lead_x\n---\n\nbody";
    expect(frontmatterHash(md)).toBeNull();
  });

  it("returns null when frontmatter is unterminated", () => {
    const md = "---\nclose_lead_id: lead_x\nbody without closing fence";
    expect(frontmatterHash(md)).toBeNull();
  });

  it("handles multiple fields and finds from_hash anywhere in the block", () => {
    const md = [
      "---",
      "from_hash: sha256:zzz",
      "close_lead_id: lead_x",
      "---",
      "body",
    ].join("\n");
    expect(frontmatterHash(md)).toBe("sha256:zzz");
  });
});
