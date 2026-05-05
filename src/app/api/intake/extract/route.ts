import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deprecated as of Phase 1 of harness/ overhaul (2026-05-05).
 *
 * The intake upload route now extracts text inline and writes the result
 * directly to the lead's folder on the leads-data branch. There is no
 * separate "extract" step anymore.
 *
 * This stub remains so legacy callers (e.g. ChatPanel's attachment-extract
 * fallback) get a polite ok response instead of a 404. Returns immediately
 * with no work performed.
 */
export async function POST() {
  return NextResponse.json({
    ok: true,
    deprecated: true,
    note: "intake extraction now happens inline during upload; this endpoint is a no-op",
  });
}
