import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Server-only Supabase client using the secret key.
 * Bypasses RLS — never expose this client or its key to a browser bundle.
 */
export function getSupabaseServer(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error(
      "SUPABASE_URL and/or SUPABASE_SECRET_KEY are not set in .env.local"
    );
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
