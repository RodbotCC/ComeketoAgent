import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * App settings — picked in the Settings page, read everywhere model selection matters.
 * Persisted to .cmk-settings.json at the project root (gitignored).
 */

export const AVAILABLE_MODELS = [
  "gpt-5.4-nano-2026-03-17",
  "gpt-5.4-mini-2026-03-17",
  "gpt-5.4-2026-03-05",
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number];

/**
 * Execution mode controls how the heartbeat handles fire-eligible verdicts.
 *
 * - draft_only:               heartbeat reports only, never touches Close
 * - approval_required:        heartbeat would-fire reports for approved days,
 *                             still doesn't touch Close (visible "ready" state)
 * - approved_plan_execution:  heartbeat WRITES to Close. Tasks are created.
 *                             Email/SMS activities are logged with `status:"draft"`
 *                             so they appear in the lead's activity feed but
 *                             do NOT actually send via SMTP/Twilio. (A future
 *                             "live_send" mode would flip status to "outbox".)
 * - manual_send_only:         everything stays in our app; nothing goes to Close
 *                             except via explicit operator click.
 */
export const EXECUTION_MODES = [
  "draft_only",
  "approval_required",
  "approved_plan_execution",
  "manual_send_only",
] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export type Settings = {
  model: ModelId;
  execution_mode: ExecutionMode;
};

export const DEFAULT_SETTINGS: Settings = {
  model: "gpt-5.4-mini-2026-03-17",
  execution_mode: "draft_only",
};

const SETTINGS_PATH = path.join(process.cwd(), ".cmk-settings.json");

function isValidModel(value: unknown): value is ModelId {
  return typeof value === "string" && (AVAILABLE_MODELS as readonly string[]).includes(value);
}
function isValidExecutionMode(value: unknown): value is ExecutionMode {
  return typeof value === "string" && (EXECUTION_MODES as readonly string[]).includes(value);
}

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      model: isValidModel(parsed.model) ? parsed.model : DEFAULT_SETTINGS.model,
      execution_mode: isValidExecutionMode(parsed.execution_mode)
        ? parsed.execution_mode
        : DEFAULT_SETTINGS.execution_mode,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function setSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    model: isValidModel(partial.model) ? partial.model : current.model,
    execution_mode: isValidExecutionMode(partial.execution_mode)
      ? partial.execution_mode
      : current.execution_mode,
  };
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return next;
}
