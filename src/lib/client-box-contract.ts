export type ClientBoxPhase = "raw" | "ai" | "execution" | "operator";

export type ClientBoxDoc = {
  file: string;
  label: string;
  phase: ClientBoxPhase;
  owner: "sweeper" | "ai" | "plan" | "operator";
  description: string;
};

export const CLIENT_BOX_DOCS: ClientBoxDoc[] = [
  {
    file: "00_meta.json",
    label: "Meta",
    phase: "raw",
    owner: "sweeper",
    description: "Lead id, name, primary routes, sweep timestamp, raw counts.",
  },
  {
    file: "01_raw_lead.json",
    label: "Raw lead profile",
    phase: "raw",
    owner: "sweeper",
    description: "Full Close lead object: contacts, custom fields, opportunities, status.",
  },
  {
    file: "02_continuity.jsonl",
    label: "Continuity ledger",
    phase: "raw",
    owner: "sweeper",
    description: "Chronological event index pointing to exact comm payloads.",
  },
  {
    file: "03_comms_interpreted.md",
    label: "AI comms read",
    phase: "ai",
    owner: "ai",
    description: "AI interpretation of timing, replies, buyer signals, and deal state.",
  },
  {
    file: "04_profile.md",
    label: "Profile",
    phase: "ai",
    owner: "ai",
    description: "Operator-facing profile, risks, win angles, and NEPQ openers.",
  },
  {
    file: "05_seven_day_plan.md",
    label: "Seven-day plan",
    phase: "execution",
    owner: "plan",
    description: "Human-readable plan; machine plan still mirrors to plan.json.",
  },
  {
    file: "06_discovery.md",
    label: "Discovery map",
    phase: "ai",
    owner: "ai",
    description: "Structured slots, current quest, and next discovery ask.",
  },
  {
    file: "07_andre_alerts.md",
    label: "Andre alerts",
    phase: "ai",
    owner: "ai",
    description: "Operator warnings, response framework, and timing flags.",
  },
  {
    file: "08_client_ledger.md",
    label: "Client ledger",
    phase: "execution",
    owner: "ai",
    description: "State of the deal against the plan: fires, replies, drift, lifecycle.",
  },
  {
    file: "09_enrichment.md",
    label: "Enrichment",
    phase: "operator",
    owner: "operator",
    description: "Manual or future-research enrichment layered above Close data.",
  },
  {
    file: "10_operator_overrides.md",
    label: "Operator overrides",
    phase: "operator",
    owner: "operator",
    description: "Andre/Jake override surface for plan, tone, or special constraints.",
  },
];

export const LEGACY_CLIENT_BOX_FILES = [
  "01_comms.md",
  "01_comms_digest.md",
  "01b_comms_verbatim.md",
  "09_andre_alerts.md",
  "client_ledger.md",
] as const;

export function manualClientBoxPlaceholders(leadName: string): Map<string, string> {
  return new Map([
    [
      "09_enrichment.md",
      [
        `# ${leadName} — Enrichment`,
        "",
        "_Operator-owned. Add research, venue intel, relationship context, pricing notes, screenshots, or anything useful that did not come directly from Close._",
        "",
        "## Notes",
        "",
        "- ",
        "",
      ].join("\n"),
    ],
    [
      "10_operator_overrides.md",
      [
        `# ${leadName} — Operator Overrides`,
        "",
        "_Operator-owned. Anything here supersedes AI interpretation and plan defaults._",
        "",
        "## Voice / Tone Overrides",
        "",
        "- ",
        "",
        "## Plan Overrides",
        "",
        "- ",
        "",
        "## Hard Constraints",
        "",
        "- ",
        "",
      ].join("\n"),
    ],
  ]);
}
