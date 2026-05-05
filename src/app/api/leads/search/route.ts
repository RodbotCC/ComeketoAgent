/**
 * GET /api/leads/search?q=… — proxy to closeListLeads({query, limit}) for
 * client-side pickers (cockpit lead picker etc.). Returns trimmed shape:
 * just id + display_name + status_label.
 *
 * No query → returns the most-recently-updated leads (acts as a "recent" feed).
 */
import { NextResponse } from "next/server";
import { closeListLeads } from "@/lib/close";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitRaw || "10", 10) || 10, 1), 50);

  try {
    const leads = await closeListLeads({ query: q || undefined, limit });
    const trimmed = leads.map((l) => ({
      id: l.id,
      display_name: l.display_name || l.name || l.id,
      status_label: l.status_label || "—",
    }));
    return NextResponse.json({ ok: true, leads: trimmed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
