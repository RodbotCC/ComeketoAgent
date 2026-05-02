/**
 * Server-only typed env access.
 * Never import this file from a client component.
 */

function read(name: string, fallback: string = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // OpenAI
  OPENAI_API_KEY: read("OPENAI_API_KEY"),

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

  /** Optional: require /operator-login before sensitive server actions when set with OPERATOR_COOKIE_SECRET. */
  OPERATOR_PASSWORD: read("OPERATOR_PASSWORD"),
  OPERATOR_COOKIE_SECRET: read("OPERATOR_COOKIE_SECRET"),
  CLICKUP_API_TOKEN: read("CLICKUP_API_TOKEN"),
  CLICKUP_TEAM_ID: read("CLICKUP_TEAM_ID"),
  CLICKUP_SPACE_ID: read("CLICKUP_SPACE_ID"),
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
