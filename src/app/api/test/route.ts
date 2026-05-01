import { NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { getOctokit } from "@/lib/github";
import { getSettings } from "@/lib/settings";
import { closeListWorkflows, closeListEmailTemplates } from "@/lib/close";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "openai" | "supabase" | "github" | "close";

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

async function testClose() {
  // Two reads in parallel: workflows + email templates. Both confirm the
  // API key works, the network path is open, and we can paginate Close.
  const [workflows, templates] = await Promise.all([
    closeListWorkflows({ limit: 50 }),
    closeListEmailTemplates({ limit: 50 }),
  ]);
  return {
    workflow_count: workflows.length,
    workflows_active: workflows.filter((w) => w.status === "active").length,
    workflow_names: workflows.slice(0, 12).map((w) => w.name),
    email_template_count: templates.length,
    sample_templates: templates.slice(0, 6).map((t) => t.name),
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
  if (!mode || !["openai", "supabase", "github", "close"].includes(mode)) {
    return NextResponse.json(
      { ok: false, error: "mode must be one of: openai, supabase, github, close" },
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
        : await testClose();

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
