import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  OPERATOR_SESSION_COOKIE_NAME,
  verifyOperatorSessionCookieEdge,
} from "@/lib/operator-cookie-edge";

function operatorLockEnv(): { on: true; password: string; secret: string } | { on: false } {
  const password = (process.env.OPERATOR_PASSWORD || "").trim();
  const secret = (process.env.OPERATOR_COOKIE_SECRET || "").trim();
  if (!password || !secret) return { on: false };
  return { on: true, password, secret };
}

/**
 * Cron: Bearer CRON_SECRET when set.
 * Operator surfaces: when OPERATOR_PASSWORD + OPERATOR_COOKIE_SECRET are set, require valid
 * cmk_operator cookie (same token as /api/auth/operator).
 *
 * Matcher inventory (2026-05): pages `/`, `/lead/*`, `/approvals`, `/settings`, `/heartbeat`,
 * `/automation`, `/console`, `/chat`, `/leads`, ``/test`, `/analytics` (+ `:path*` where listed).
 * APIs `/api/cron`, `/api`/api/chat`, `/api/threads`, `/api/leads`, `/api/test` (+ children).
 * Not matched (stay public): `/operator-login`, `/api/auth/operator`, `/api/webhooks/:path*`.
 * New top-level app route or `/api/*` (except webhooks/auth) → extend `matcher` or it stays open when lock is on.
 */
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const cron = process.env.CRON_SECRET;
  if (cron && path.startsWith("/api/cron")) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${cron}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const lock = operatorLockEnv();
  if (!lock.on) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(OPERATOR_SESSION_COOKIE_NAME)?.value;
  const ok = await verifyOperatorSessionCookieEdge(cookie, lock.password, lock.secret);
  if (ok) {
    return NextResponse.next();
  }

  if (path.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "operator_login_required" }, { status: 401 });
  }

  const login = new URL("/operator-login", req.url);
  login.searchParams.set("next", path + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/",
    "/api/cron/:path*",
    "/lead/:path*",
    "/approvals",
    "/approvals/:path*",
    "/settings",
    "/settings/:path*",
    "/heartbeat",
    "/heartbeat/:path*",
    "/api/intake/:path*",
    "/automation",
    "/automation/:path*",
    "/console",
    "/console/:path*",
    "/chat",
    "/chat/:path*",
    "/leads",
    "/leads/:path*",
    "/api/chat",
    "/api/chat/:path*",
    "/api/threads",
    "/api/threads/:path*",
    "/api/leads",
    "/api/leads/:path*",
    "/api/test",
    "/api/test/:path*",
    "/test",
    "/test/:path*",
    "/analytics",
    "/analytics/:path*",
  ],
};
