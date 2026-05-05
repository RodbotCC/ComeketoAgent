/**
 * Lead-name resolver — server-only, module-cached.
 *
 * Maps Close lead_xxx IDs → human display names. Backed by a single
 * `closeListLeads({ limit: 250 })` call, cached at module level for 60s
 * so /heartbeat (auto-refreshes every 30s) and /console don't hammer
 * Close on every server-component re-render.
 *
 * Defensive: if Close is unreachable, returns an empty map and the
 * call sites fall back to a truncated lead_id via `shortLeadId`.
 */
import { closeListLeads } from "@/lib/close";

const TTL_MS = 60_000;

let cache: { fetchedAt: number; names: Map<string, string> } | null = null;

export async function resolveLeadNames(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.names;
  }
  try {
    // Close's _limit caps at 200 (returns 400 above that).
    const leads = await closeListLeads({ limit: 200 });
    const m = new Map<string, string>();
    for (const l of leads) {
      const id = (l as { id?: string }).id;
      const dn = (l as { display_name?: string }).display_name;
      const nm = (l as { name?: string }).name;
      // Match the /leads page fallback chain: display_name → name. Many
      // seed/practice leads come back with empty display_name but a real name.
      const resolved = (dn && dn.trim()) || (nm && nm.trim()) || "";
      if (id && resolved.length > 0) m.set(id, resolved);
    }
    cache = { fetchedAt: now, names: m };
    if (m.size === 0) {
      console.warn(`[lead-names] Close returned ${leads.length} leads but resolved 0 names. First lead shape:`, leads[0]);
    } else {
      console.info(`[lead-names] resolved ${m.size}/${leads.length} lead names from Close`);
    }
    return m;
  } catch (err) {
    console.error(`[lead-names] resolveLeadNames failed:`, err instanceof Error ? err.message : err);
    // Don't poison the cache on failure — let the next call retry.
    return cache?.names ?? new Map();
  }
}

/** lead_xxxxxxx → lead_xxxx… */
export function shortLeadId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 16 ? id.slice(0, 14) + "…" : id;
}

/**
 * Display name from the resolver map; falls back to a truncated id when
 * Close is unreachable, the org doesn't include the lead in the recent-250
 * window, or the lead has no display_name set.
 */
export function displayName(id: string | null | undefined, names: Map<string, string>): string {
  if (!id) return "—";
  const n = names.get(id);
  if (n && n.trim().length > 0) return n;
  return shortLeadId(id);
}
