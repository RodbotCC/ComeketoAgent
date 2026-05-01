/**
 * NEPQ voice validator (Guardrails §G4).
 *
 * Lints draft text (a `draft_seed` from a plan day or a full email/SMS body)
 * for the patterns Andre wants to NEVER ship: fake warmth, generic nurture,
 * sales-template smell, "checking in" language, etc.
 *
 * Returns a list of violations. Empty array = passes the voice gate.
 *
 * This is pure regex / heuristic — fast, deterministic, no LLM. It's the
 * first line of defense before any draft goes to a customer-facing send.
 * For nuanced "does this actually sound like Andre" checks the LLM-with-
 * lattice flow (future) is the second line.
 */

export type ViolationSeverity = "block" | "warn";

export type VoiceViolation = {
  code: string;
  severity: ViolationSeverity;
  rule: string;
  matched: string;
  position: number;
};

type Rule = {
  code: string;
  severity: ViolationSeverity;
  pattern: RegExp;
  rule: string;
};

// ─── Rules ────────────────────────────────────────────────────────────────
//
// "block" severity = must rewrite before send. "warn" = surface but don't
// auto-block. Patterns are case-insensitive unless explicitly anchored.

const RULES: Rule[] = [
  // Generic nurture / template smell — block
  { code: "FAKE_WARMTH",        severity: "block", rule: "No 'I hope this email finds you well' / 'hope you're doing well'",
    pattern: /\b(?:i hope|hope (?:that )?(?:this|you|your))\s+(?:email\s+)?(?:finds?|is\s+finding|are\s+(?:doing|having))\s+(?:you\s+)?(?:well|great|going)\b/i },
  { code: "JUST_TOUCHING_BASE", severity: "block", rule: "No 'just touching base' / 'just checking in'",
    pattern: /\b(?:just\s+)?(?:touching\s+base|checking\s+in)\b/i },
  { code: "CIRCLE_BACK",        severity: "block", rule: "No 'circle back' / 'circling back'",
    pattern: /\bcircl(?:e|ing)\s+back\b/i },
  { code: "REACHING_OUT",       severity: "block", rule: "No 'reaching out' / 'just wanted to reach out'",
    pattern: /\b(?:just\s+)?(?:wanted to\s+)?reach(?:ing)?\s+out\b/i },
  { code: "FOLLOWING_UP",       severity: "block", rule: "No 'just following up' / 'just wanted to follow up'",
    pattern: /\b(?:just\s+)?(?:wanted to\s+)?follow(?:ing)?\s+up\b/i },
  { code: "SYNERGY_LANGUAGE",   severity: "block", rule: "No 'synergy' / 'leverage' / 'unlock potential' / corporate slop",
    pattern: /\b(?:synerg(?:y|ies)|leverag(?:e|ing)|unlock(?:ing)?\s+(?:your\s+)?potential|maximi[sz]e\s+(?:your\s+)?(?:results|potential|impact)|circle\s+(?:up|the\s+wagons))\b/i },
  { code: "PLEASE_DONT_HESITATE", severity: "block", rule: "No 'please don't hesitate to'",
    pattern: /\bplease\s+(?:don'?t|do\s+not)\s+hesitate\b/i },
  { code: "AT_YOUR_CONVENIENCE", severity: "block", rule: "No 'at your earliest convenience' / 'at your convenience'",
    pattern: /\bat\s+your\s+(?:earliest\s+)?convenience\b/i },
  { code: "PER_MY_LAST",        severity: "block", rule: "No 'per my last (email|message)'",
    pattern: /\bper\s+my\s+(?:last|previous)\s+(?:email|message|note)\b/i },

  // Soft signals — warn but don't block
  { code: "EXCLAMATION_OVERUSE", severity: "warn", rule: "Max one exclamation point per draft",
    pattern: /!.*!/s },
  { code: "AS_DISCUSSED",       severity: "warn", rule: "'As discussed' is fine sparingly but often empty",
    pattern: /\bas\s+(?:we\s+)?(?:discussed|previously\s+discussed)\b/i },
  { code: "QUICK_QUESTION",     severity: "warn", rule: "'Quick question' often signals hedge — use the question itself as the opener",
    pattern: /\b(?:i\s+have\s+a\s+)?quick\s+question\b/i },
  { code: "WANTED_TO_SHARE",    severity: "warn", rule: "'Just wanted to share' is filler — share the thing",
    pattern: /\b(?:just\s+)?wanted\s+to\s+(?:share|let\s+you\s+know)\b/i },
  { code: "I_HOPE_YOU",         severity: "warn", rule: "'I hope you' openers tend to be filler — go directly to the point",
    pattern: /^\s*(?:hi|hey|hello)?[^.!?]*?\bi\s+hope\s+you\b/i },
];

// ─── Validate ─────────────────────────────────────────────────────────────

/**
 * Run every rule against the input text. Returns all hits (a single text
 * may trigger multiple rules). Sorted block→warn, then by position.
 */
export function validateNepqVoice(text: string): VoiceViolation[] {
  const out: VoiceViolation[] = [];
  if (!text || !text.trim()) return out;
  for (const r of RULES) {
    const m = r.pattern.exec(text);
    if (m) {
      out.push({
        code: r.code,
        severity: r.severity,
        rule: r.rule,
        matched: m[0],
        position: m.index ?? 0,
      });
    }
  }
  return out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "block" ? -1 : 1;
    return a.position - b.position;
  });
}

/** True if there is at least one block-severity violation. */
export function hasBlockingViolation(violations: VoiceViolation[]): boolean {
  return violations.some((v) => v.severity === "block");
}

/**
 * Validate every draft_seed across a plan's days. Returns a map of
 * `${dayIndex}:${actionIndex}` → violations[]. Convenient for UI rendering.
 */
export function validatePlanDrafts(
  days: Array<{ required_actions: Array<{ draft_seed?: string; intent: string }> }>
): Record<string, VoiceViolation[]> {
  const out: Record<string, VoiceViolation[]> = {};
  days.forEach((day, di) => {
    day.required_actions.forEach((act, ai) => {
      const text = act.draft_seed || act.intent || "";
      const v = validateNepqVoice(text);
      if (v.length > 0) out[`${di}:${ai}`] = v;
    });
  });
  return out;
}
