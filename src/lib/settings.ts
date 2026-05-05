import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * App settings — picked in the Settings page, read everywhere model selection matters.
 * Persisted to .cmk-settings.json at the project root (gitignored).
 */

export const AVAILABLE_MODELS = [
  "gpt-5.5",
  "gpt-5.5-2026-04-23",
  "gpt-5.5-pro",
  "gpt-5.5-pro-2026-04-23",
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

/** Calendar-day buckets in a generated cycle plan (NEPQ week default = 7). */
export const DEFAULT_PLAN_HORIZON_DAYS = 7;
export const PLAN_HORIZON_MIN = 1;
export const PLAN_HORIZON_MAX = 180;

export function clampPlanHorizonDays(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  const r = Math.round(n);
  if (!Number.isFinite(r)) return DEFAULT_PLAN_HORIZON_DAYS;
  return Math.min(PLAN_HORIZON_MAX, Math.max(PLAN_HORIZON_MIN, r));
}

export type Settings = {
  model: ModelId;
  execution_mode: ExecutionMode;
  /** Default N-day cycle when the UI does not pass an explicit horizon. */
  default_plan_horizon_days: number;
  /**
   * Solo-operator mode (2026-05-02). When true, heartbeat strips every
   * operator-imposed friction gate so the agent fires for the single human
   * driving it. Real-world safety still applies — STOP_SIGNAL and severe
   * voice violations still block. But ownership splits, status_won/lost,
   * stale-box pauses, send-window hours, frequency caps, and the
   * "approve every day before fire" requirement are all OFF. Default ON
   * because Andre is the only operator on the live profile.
   */
  solo_operator: boolean;
  /**
   * Auto-approve days at heartbeat time when the day's drafts pass the voice
   * lint. Eliminates the DAY_NOT_APPROVED skip pile-up. When false, operator
   * must click approve on each day before its actions fire.
   */
  auto_approve_clean_days: boolean;
  /**
   * MCP fallback kill switch (2026-05-02). When true (default), the chat
   * agent sees `close_mcp_list_tools` + `close_mcp_call` in its tools array
   * if `CLOSE_MCP_URL` is set in env. When false, those two tools are
   * filtered out of the agent's view AND the dispatcher refuses to run them
   * even if a stale message context tries. Use to flip MCP off without
   * blanking env vars when fallback misuse appears.
   */
  enable_mcp_fallback: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  model: "gpt-5.4-mini-2026-03-17",
  execution_mode: "approved_plan_execution",
  default_plan_horizon_days: DEFAULT_PLAN_HORIZON_DAYS,
  solo_operator: true,
  auto_approve_clean_days: true,
  enable_mcp_fallback: true,
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
      default_plan_horizon_days: clampPlanHorizonDays(
        parsed.default_plan_horizon_days ?? DEFAULT_SETTINGS.default_plan_horizon_days
      ),
      solo_operator:
        typeof parsed.solo_operator === "boolean"
          ? parsed.solo_operator
          : DEFAULT_SETTINGS.solo_operator,
      auto_approve_clean_days:
        typeof parsed.auto_approve_clean_days === "boolean"
          ? parsed.auto_approve_clean_days
          : DEFAULT_SETTINGS.auto_approve_clean_days,
      enable_mcp_fallback:
        typeof parsed.enable_mcp_fallback === "boolean"
          ? parsed.enable_mcp_fallback
          : DEFAULT_SETTINGS.enable_mcp_fallback,
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
    default_plan_horizon_days:
      partial.default_plan_horizon_days !== undefined
        ? clampPlanHorizonDays(partial.default_plan_horizon_days)
        : current.default_plan_horizon_days,
    solo_operator:
      typeof partial.solo_operator === "boolean"
        ? partial.solo_operator
        : current.solo_operator,
    auto_approve_clean_days:
      typeof partial.auto_approve_clean_days === "boolean"
        ? partial.auto_approve_clean_days
        : current.auto_approve_clean_days,
    enable_mcp_fallback:
      typeof partial.enable_mcp_fallback === "boolean"
        ? partial.enable_mcp_fallback
        : current.enable_mcp_fallback,
  };
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return next;
}
