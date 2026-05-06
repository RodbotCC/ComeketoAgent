import { NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { getOctokit } from "@/lib/github";
import { getSettings } from "@/lib/settings";
import {
  closeListWorkflows,
  closeListEmailTemplates,
  closeListSmsTemplates,
  closeListLeadStatuses,
  closeListPhoneNumbers,
  closeListWebhookSubscriptions,
} from "@/lib/close";
import { closeMcpListTools, closeMcpStatus } from "@/lib/close-mcp";
import { sweepActiveLeads } from "@/lib/lead-folder-sweeper";
import { regenerateAllLeadDocs } from "@/lib/lead-folder-llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Lead sweep can run 60-90s for ~50 leads × 3 lanes; the other modes return
 *  in a few seconds. 5-minute ceiling is the same we set on the cron route. */
export const maxDuration = 300;

type Mode = "openai" | "supabase" | "github" | "close" | "close-mcp" | "lead-sweep" | "lead-regen";

async function testOpenAI() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env.local");
  }
  const settings = await getSettings();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // Responses API, NOT chat completions. No tools attached — pure round-trip.
  // Model is whatever the operator picked in /settings.
  const response = await client.responses.create({
    model: settings.model,
    input: "Reply with exactly three words: connection ok confirmed.",
  });

  return {
    id: response.id,
    model: response.model,
    output_text: response.output_text,
    usage: response.usage,
  };
}

async function testSupabase() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_URL and/or SUPABASE_SECRET_KEY are not set in .env.local");
  }

  // Hit the REST root with the secret key. A 200 with paths/info confirms:
  //   - URL is reachable
  //   - Secret key authenticates
  //   - PostgREST is healthy
  // The body is the OpenAPI spec for the project's tables.
  const url = `${env.SUPABASE_URL}/rest/v1/`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    },
  });

  let body: Record<string, unknown> | null = null;
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === "object") {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    /* not JSON — leave null */
  }

  // Extract a tight summary so the result pane stays readable.
  const info = body && "info" in body ? body.info : null;
  const pathsObj = body && "paths" in body && body.paths && typeof body.paths === "object"
    ? (body.paths as Record<string, unknown>)
    : null;
  const paths = pathsObj ? Object.keys(pathsObj) : [];

  return {
    status: res.status,
    ok: res.ok,
    info,
    table_count: paths.length,
    sample_paths: paths.slice(0, 8),
  };
}

async function testGitHub() {
  const octokit = getOctokit();
  const { data } = await octokit.rest.users.getAuthenticated();
  return {
    login: data.login,
    name: data.name,
    public_repos: data.public_repos,
    private_repos: data.total_private_repos ?? null,
    plan: data.plan?.name ?? null,
  };
}

async function testCloseMcp() {
  const status = closeMcpStatus();
  if (!status.configured) {
    // Not an exception — return the same shape the chat tools see when blank,
    // so operators learn what the agent would see if it tried to fall back.
    return {
      configured: false,
      url_set: status.url_set,
      auth_resolved: status.auth_resolved,
      tool_count: 0,
      sample_tool_names: [],
      hint:
        "Set CLOSE_MCP_URL in .env.local to enable the MCP fallback path. " +
        "CLOSE_MCP_AUTH_HEADER is optional — defaults to Bearer ${CLOSE_API_KEY}.",
    };
  }

  const result = await closeMcpListTools();
  if (!result.ok) {
    // Surface as an error — the URL was set but the call failed (auth shape,
    // transport variant, network).
    throw new Error(result.error);
  }
  return {
    configured: true,
    url_set: status.url_set,
    auth_resolved: status.auth_resolved,
    tool_count: result.tools.length,
    sample_tool_names: result.tools.slice(0, 12).map((t) => t.name),
    has_descriptions: result.tools.filter((t) => !!t.description).length,
  };
}

async function testLeadSweep() {
  const summary = await sweepActiveLeads();
  // Compact the result for the test pane: keep top-level shape but trim each
  // swept entry to identifying fields. Full payload is in the cron route's
  // own response when Vercel runs it.
  return {
    considered: summary.considered,
    in_scope: summary.in_scope,
    started_at: summary.started_at,
    finished_at: summary.finished_at,
    swept_count: summary.swept.length,
    swept: summary.swept.slice(0, 25).map((s) => ({
      lead_id: s.lead_id,
      name: s.name,
      written: s.written,
      skipped_identical: s.skipped_identical,
      total_rendered: s.total_rendered,
      duration_ms: s.duration_ms,
    })),
    error_count: summary.errors.length,
    errors: summary.errors.slice(0, 10),
    hint:
      summary.in_scope === 0
        ? "0 leads in scope — confirm CLOSE_USER_ID_ANDRE matches your active assignee, and that some leads aren't all in Won/Lost/Not-Interested."
        : undefined,
  };
}

async function testLeadRegen() {
  const summary = await regenerateAllLeadDocs();
  return {
    considered: summary.considered,
    in_scope: summary.in_scope,
    started_at: summary.started_at,
    finished_at: summary.finished_at,
    comms: summary.comms,
    profile: summary.profile,
    discovery: summary.discovery,
    alerts: summary.alerts,
    ledger: summary.ledger,
    error_count: summary.errors.length,
    errors: summary.errors.slice(0, 10),
    hint:
      summary.in_scope === 0
        ? "0 leads in scope — confirm CLOSE_USER_ID_ANDRE matches your active assignee."
        : summary.comms.regenerated +
            summary.profile.regenerated +
            summary.discovery.regenerated +
            summary.alerts.regenerated +
            summary.ledger.regenerated ===
          0
        ? "All leads up to date (hash match on every file). Run lead sweep first if you expect new comms."
        : undefined,
  };
}

async function testClose() {
  const [workflows, templates, smsTemplates, leadStatuses, phones, webhooks] = await Promise.all([
    closeListWorkflows({ limit: 50 }),
    closeListEmailTemplates({ limit: 50 }),
    closeListSmsTemplates({ limit: 50 }),
    closeListLeadStatuses(),
    closeListPhoneNumbers({ limit: 50 }),
    closeListWebhookSubscriptions({ limit: 50 }),
  ]);
  return {
    workflow_count: workflows.length,
    workflows_active: workflows.filter((w) => w.status === "active").length,
    workflow_names: workflows.slice(0, 12).map((w) => w.name),
    email_template_count: templates.length,
    sample_templates: templates.slice(0, 6).map((t) => t.name),
    sms_template_count: smsTemplates.length,
    sample_sms_templates: smsTemplates.slice(0, 6).map((t) => t.name),
    lead_status_count: leadStatuses.length,
    sample_lead_statuses: leadStatuses.slice(0, 8).map((s) => `${s.label} (${s.id})`),
    phone_number_count: phones.length,
    sample_phones: phones.slice(0, 6).map((p) => (p.phone as string) ?? p.id),
    webhook_subscription_count: webhooks.length,
    webhook_urls: webhooks.slice(0, 8).map((w) => w.url ?? w.id),
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  let body: { mode?: Mode };
  try {
    body = (await req.json()) as { mode?: Mode };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode;
  if (!mode || !["openai", "supabase", "github", "close", "close-mcp", "lead-sweep", "lead-regen"].includes(mode)) {
    return NextResponse.json(
      { ok: false, error: "mode must be one of: openai, supabase, github, close, close-mcp, lead-sweep, lead-regen" },
      { status: 400 }
    );
  }

  try {
    const output =
      mode === "openai"
        ? await testOpenAI()
        : mode === "supabase"
        ? await testSupabase()
        : mode === "github"
        ? await testGitHub()
        : mode === "close"
        ? await testClose()
        : mode === "close-mcp"
        ? await testCloseMcp()
        : mode === "lead-sweep"
        ? await testLeadSweep()
        : await testLeadRegen();

    return NextResponse.json({
      ok: true,
      mode,
      durationMs: Date.now() - startedAt,
      output,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, mode, durationMs: Date.now() - startedAt, error: message },
      { status: 500 }
    );
  }
}
