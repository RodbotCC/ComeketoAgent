/**
 * Server-only typed env access.
 * Never import this file from a client component.
 */

function read(name: string, fallback: string = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // OpenAI — main key powers the chat agent.
  OPENAI_API_KEY: read("OPENAI_API_KEY"),
  // Three additional OpenAI keys reserved for the Auxiliary Agents fleet
  // (the four-dot identity from the wordmark — main + 3 auxiliaries).
  // Each auxiliary slot can choose which key powers it via /settings/auxiliaries.
  OPENAI_API_KEY_AUX_BROWN: read("OPENAI_API_KEY_AUX_BROWN"),
  OPENAI_API_KEY_AUX_GOLD: read("OPENAI_API_KEY_AUX_GOLD"),
  OPENAI_API_KEY_AUX_SAGE: read("OPENAI_API_KEY_AUX_SAGE"),

  // Supabase direct SDK
  SUPABASE_URL: read("SUPABASE_URL"),
  SUPABASE_PUBLISHABLE_KEY: read("SUPABASE_PUBLISHABLE_KEY"),
  SUPABASE_SECRET_KEY: read("SUPABASE_SECRET_KEY"),

  // GitHub direct API (Octokit)
  GITHUB_PAT: read("GITHUB_PAT"),

  // Close CRM
  CLOSE_API_KEY: read("CLOSE_API_KEY"),
  /** Hex `signature_key` from the webhook subscription POST response (Close docs: HMAC-SHA256). */
  CLOSE_WEBHOOK_SIGNATURE_KEY: read("CLOSE_WEBHOOK_SIGNATURE_KEY"),
  // Two-actor identity in the practice org. Per Guardrails, the app's
  // sends are "as Andre" — JAKE is for admin/dev actions only.
  CLOSE_USER_ID_JAKE: read("CLOSE_USER_ID_JAKE"),
  CLOSE_USER_ID_ANDRE: read("CLOSE_USER_ID_ANDRE"),
  /** Optional. Close's official MCP server URL. When set, the chat agent gets
   *  `close_mcp_list_tools` + `close_mcp_call` as fallback tools for Close
   *  operations not yet wrapped by the direct REST helpers. Blank disables. */
  CLOSE_MCP_URL: read("CLOSE_MCP_URL"),
  /** Optional. Full Authorization header value sent to the MCP server (e.g.
   *  "Bearer <token>"). When blank, defaults to "Bearer ${CLOSE_API_KEY}". */
  CLOSE_MCP_AUTH_HEADER: read("CLOSE_MCP_AUTH_HEADER"),

  /** Optional: require /operator-login before sensitive server actions when set with OPERATOR_COOKIE_SECRET. */
  OPERATOR_PASSWORD: read("OPERATOR_PASSWORD"),
  OPERATOR_COOKIE_SECRET: read("OPERATOR_COOKIE_SECRET"),
  CLICKUP_API_TOKEN: read("CLICKUP_API_TOKEN"),
  CLICKUP_TEAM_ID: read("CLICKUP_TEAM_ID"),
  CLICKUP_SPACE_ID: read("CLICKUP_SPACE_ID"),

  /** Optional. When set, the slack_mirror auxiliary POSTs a one-line JSON `{text}`
   *  to this URL on every assistant turn + meaningful tool action. */
  SLACK_WEBHOOK_URL: read("SLACK_WEBHOOK_URL"),
  /** Optional. Repo for the github_mirror auxiliary — format `owner/name`. Defaults
   *  to RodbotCC/ComeketoAgent if blank. Branch is `main`, file is appended. */
  GITHUB_AUDIT_REPO: read("GITHUB_AUDIT_REPO", "RodbotCC/ComeketoAgent"),
  GITHUB_AUDIT_PATH: read("GITHUB_AUDIT_PATH", "_audit/auxiliary-events.jsonl"),

  /** Harness file-tree memory repo. Owner/name of the GitHub repo that
   *  hosts `harness/`. Single-branch architecture as of 2026-05-05:
   *  harness lives alongside code on the same branch; Vercel skips builds
   *  for harness-only commits via "Ignored Build Step." */
  GITHUB_LEADS_OWNER: read("GITHUB_LEADS_OWNER", "RodbotCC"),
  GITHUB_LEADS_REPO: read("GITHUB_LEADS_REPO", "ComeketoAgent"),
  /** Branch the harness lives on. Default `main` (the 2026-05-05 collapse
   *  retired the `leads-data` parallel branch). Override only if hosting
   *  the harness on a different branch (e.g. for staging). */
  GITHUB_LEADS_BRANCH: read("GITHUB_LEADS_BRANCH", "main"),

  /** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` on every cron
   *  invocation. The `/api/cron/sweep-leads` route accepts either this header
   *  OR a valid operator session cookie (from the manual `/test` button). */
  CRON_SECRET: read("CRON_SECRET"),
} as const;

/**
 * Returns a redacted summary of which env vars are configured.
 * Safe to send to the client (no secret values, only presence + last-4 fingerprint).
 */
export function envStatus() {
  const fingerprint = (v: string) =>
    !v ? null : v.length <= 8 ? "***" : `***${v.slice(-4)}`;

  return {
    OPENAI_API_KEY: { set: !!env.OPENAI_API_KEY, fingerprint: fingerprint(env.OPENAI_API_KEY) },
    SUPABASE_URL: { set: !!env.SUPABASE_URL, fingerprint: env.SUPABASE_URL || null },
    SUPABASE_PUBLISHABLE_KEY: { set: !!env.SUPABASE_PUBLISHABLE_KEY, fingerprint: fingerprint(env.SUPABASE_PUBLISHABLE_KEY) },
    SUPABASE_SECRET_KEY: { set: !!env.SUPABASE_SECRET_KEY, fingerprint: fingerprint(env.SUPABASE_SECRET_KEY) },
    GITHUB_PAT: { set: !!env.GITHUB_PAT, fingerprint: fingerprint(env.GITHUB_PAT) },
    CLOSE_API_KEY: { set: !!env.CLOSE_API_KEY, fingerprint: fingerprint(env.CLOSE_API_KEY) },
    CLOSE_USER_ID_JAKE: { set: !!env.CLOSE_USER_ID_JAKE, fingerprint: fingerprint(env.CLOSE_USER_ID_JAKE) },
    CLOSE_USER_ID_ANDRE: { set: !!env.CLOSE_USER_ID_ANDRE, fingerprint: fingerprint(env.CLOSE_USER_ID_ANDRE) },
    CLOSE_WEBHOOK_SIGNATURE_KEY: {
      set: !!env.CLOSE_WEBHOOK_SIGNATURE_KEY,
      fingerprint: fingerprint(env.CLOSE_WEBHOOK_SIGNATURE_KEY),
    },
    CLOSE_MCP_URL: {
      set: !!env.CLOSE_MCP_URL.trim(),
      // URL is not a secret — render it directly so operators can sanity-check.
      fingerprint: env.CLOSE_MCP_URL.trim() || null,
    },
    CLOSE_MCP_AUTH_HEADER: {
      set: !!env.CLOSE_MCP_AUTH_HEADER.trim(),
      fingerprint: fingerprint(env.CLOSE_MCP_AUTH_HEADER),
    },
    OPERATOR_PASSWORD: {
      set: !!env.OPERATOR_PASSWORD.trim(),
      fingerprint: fingerprint(env.OPERATOR_PASSWORD),
    },
    OPERATOR_COOKIE_SECRET: {
      set: !!env.OPERATOR_COOKIE_SECRET.trim(),
      fingerprint: fingerprint(env.OPERATOR_COOKIE_SECRET),
    },
    CLICKUP_API_TOKEN: { set: !!env.CLICKUP_API_TOKEN, fingerprint: fingerprint(env.CLICKUP_API_TOKEN) },
  };
}

export type EnvStatus = ReturnType<typeof envStatus>;
