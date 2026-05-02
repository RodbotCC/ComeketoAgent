import { NextResponse } from "next/server";
import { runHeartbeatSweep } from "@/lib/heartbeat";
import { getSettings } from "@/lib/settings";
import { logStructured } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron entrypoint for the heartbeat sweep.
 *
 * Mode comes from app settings (Settings page). Default per Guardrails §E +
 * §I1 is `draft_only` — audits + marks stale, never writes to Close. Real
 * execution requires the operator to flip the switch in Settings.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET || "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const settings = await getSettings();
    const { runs, errors, trace_id } = await runHeartbeatSweep("cron", settings.execution_mode);
    logStructured("info", "cron.heartbeat", "sweep_complete", {
      trace_id,
      execution_mode: settings.execution_mode,
      plans_swept: runs.length,
      errors: errors.length,
    });
    return NextResponse.json({
      ok: true,
      trace_id,
      durationMs: Date.now() - startedAt,
      execution_mode: settings.execution_mode,
      plans_swept: runs.length,
      total_actions_eligible: runs.reduce((s, r) => s + r.actions_eligible, 0),
      total_actions_fired: runs.reduce((s, r) => s + r.actions_fired, 0),
      total_actions_skipped: runs.reduce((s, r) => s + r.actions_skipped, 0),
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
