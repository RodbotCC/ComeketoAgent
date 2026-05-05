import { describe, it, expect } from "vitest";
import { slugify, leadFolderPath, __TEST_ONLY } from "./lead-folder";

describe("slugify", () => {
  it("hyphenates spaces and lowercases", () => {
    expect(slugify("Eliana Lopes")).toBe("eliana-lopes");
    expect(slugify("Sakamoto Family")).toBe("sakamoto-family");
  });

  it("strips combining accents via NFKD", () => {
    expect(slugify("Café")).toBe("cafe");
    expect(slugify("Renée Dúbe")).toBe("renee-dube");
    expect(slugify("Niño")).toBe("nino");
  });

  it("drops symbols and decorative punctuation", () => {
    expect(slugify("☼ Sunny ☼")).toBe("sunny");
    expect(slugify("✨ Star ✨ Light")).toBe("star-light");
    expect(slugify("Anne (Charlton)")).toBe("anne-charlton");
  });

  it("collapses runs of separators", () => {
    expect(slugify("a   b---c")).toBe("a-b-c");
    expect(slugify("---leading and trailing---")).toBe(
      "leading-and-trailing",
    );
  });

  it("caps at 60 chars", () => {
    const long = "a".repeat(120);
    expect(slugify(long)).toHaveLength(60);
  });

  it("returns 'unnamed' for empty / pure-symbol input", () => {
    expect(slugify("")).toBe("unnamed");
    expect(slugify("☼☼☼")).toBe("unnamed");
    expect(slugify("   ")).toBe("unnamed");
  });

  it("handles apostrophes by treating them as separators", () => {
    expect(slugify("O'Brien")).toBe("o-brien");
    expect(slugify("Café d'Or")).toBe("cafe-d-or");
  });
});

describe("leadFolderPath", () => {
  it("composes the active path by default", () => {
    expect(leadFolderPath("lead_abc123", "Eliana Lopes")).toBe(
      "harness/leads/active/lead_abc123__eliana-lopes",
    );
  });

  it("respects the archive state", () => {
    expect(leadFolderPath("lead_abc123", "Eliana Lopes", "archive")).toBe(
      "harness/leads/archive/lead_abc123__eliana-lopes",
    );
  });

  it("preserves lead_id prefix exactly so id-based lookups work", () => {
    const id = "lead_uePfZil6QF7XOYTzqMc90u6SRtXlyZEBZRjOgjaqAOT";
    const folder = leadFolderPath(id, "Eliana Lopes");
    expect(folder.startsWith(`harness/leads/active/${id}__`)).toBe(true);
  });

  it("falls back to 'unnamed' slug rather than colliding when name is empty", () => {
    expect(leadFolderPath("lead_xyz", "")).toBe(
      "harness/leads/active/lead_xyz__unnamed",
    );
  });
});

describe("retry pacing", () => {
  it("backs off with three increasing delays under one second total", () => {
    const delays = __TEST_ONLY.RETRY_DELAYS_MS;
    expect(delays.length).toBe(3);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(delays.reduce((s, d) => s + d, 0)).toBeLessThan(1000);
  });
});

describe("repo defaults", () => {
  it("defaults to RodbotCC/ComeketoAgent on the main branch when env unset", () => {
    expect(__TEST_ONLY.REPO_OWNER).toBe("RodbotCC");
    expect(__TEST_ONLY.REPO_NAME).toBe("ComeketoAgent");
    expect(__TEST_ONLY.REPO_BRANCH).toBe("main");
  });
});
