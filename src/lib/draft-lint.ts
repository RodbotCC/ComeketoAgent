/**
 * Guardrails-aligned draft checks for outbound email/SMS seeds (NEPQ + structure).
 */

import { validateNepqVoice, hasBlockingViolation, type VoiceViolation } from "./nepq";

export type DraftLintIssue = {
  code: string;
  message: string;
  blocking: boolean;
};

/** Min question marks for NEPQ-style outbound email body heuristics (soft check). */
const MIN_QUESTIONS_EMAIL = 1;

function countQuestions(text: string): number {
  return (text.match(/\?/g) || []).length;
}

export function lintOutboundDraft(opts: {
  channel: "email" | "sms" | string;
  text: string;
}): DraftLintIssue[] {
  const issues: DraftLintIssue[] = [];
  const text = (opts.text || "").trim();
  if (!text) {
    issues.push({
      code: "EMPTY_DRAFT",
      message: "Draft is empty.",
      blocking: true,
    });
    return issues;
  }

  const voice: VoiceViolation[] = validateNepqVoice(text);
  for (const v of voice) {
    issues.push({
      code: `NEPQ_${v.code}`,
      message: v.matched ? `${v.rule} — matched: "${v.matched.slice(0, 120)}"` : v.rule,
      blocking: hasBlockingViolation([v]),
    });
  }

  if (opts.channel === "email" && countQuestions(text) < MIN_QUESTIONS_EMAIL) {
    issues.push({
      code: "NEPQ_LOW_QUESTIONS",
      message: `Email drafts should include at least ${MIN_QUESTIONS_EMAIL} real question — NEPQ ask, don't pitch.`,
      blocking: false,
    });
  }

  if (opts.channel === "sms" && text.length > 320) {
    issues.push({
      code: "SMS_LONG",
      message: "SMS seed is long — confirm it segments cleanly before send.",
      blocking: false,
    });
  }

  const hype = /\b(amazing|incredible|best in class|game changer|don't miss)\b/i;
  if (hype.test(text)) {
    issues.push({
      code: "TONE_HYPE",
      message: "Avoid hype phrases — Guardrails §G (NEPQ, no fake warmth).",
      blocking: false,
    });
  }

  return issues;
}

export function draftLintHasBlocking(issues: DraftLintIssue[]): boolean {
  return issues.some((i) => i.blocking);
}
