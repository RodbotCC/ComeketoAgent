import { NextResponse } from "next/server";
import {
  operatorLockEnabled,
  operatorSessionFromPassword,
  OPERATOR_SESSION_COOKIE_NAME,
} from "@/lib/operator-guard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!operatorLockEnabled()) {
    return NextResponse.json({ ok: false, error: "operator lock not configured" }, { status: 400 });
  }
  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const token = operatorSessionFromPassword(String(body.password || ""));
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OPERATOR_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
