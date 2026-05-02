/**
 * Optional operator lock: set OPERATOR_PASSWORD (+ OPERATOR_COOKIE_SECRET) to require
 * a one-time browser login before sensitive server actions (see /operator-login).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { env } from "./env";

const COOKIE = "cmk_operator";

function sessionToken(): string | null {
  const secret = env.OPERATOR_COOKIE_SECRET.trim();
  const pass = env.OPERATOR_PASSWORD.trim();
  if (!secret || !pass) return null;
  return createHmac("sha256", secret).update(pass).digest("hex");
}

/** True when operator password protection is enabled. */
export function operatorLockEnabled(): boolean {
  return !!(env.OPERATOR_PASSWORD.trim() && env.OPERATOR_COOKIE_SECRET.trim());
}

/** Throws if lock is on and cookie is missing/invalid. */
export async function assertOperatorSession(): Promise<void> {
  const expected = sessionToken();
  if (!expected) return;
  const jar = cookies();
  const got = jar.get(COOKIE)?.value ?? "";
  let ok = false;
  try {
    ok =
      got.length === expected.length &&
      timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error("Operator login required — visit /operator-login (OPERATOR_PASSWORD is set).");
  }
}

/** Verify password and return the cookie value to set (caller sets Set-Cookie). */
export function operatorSessionFromPassword(password: string): string | null {
  const expected = sessionToken();
  if (!expected) return null;
  const pass = env.OPERATOR_PASSWORD.trim();
  if (!pass || password !== pass) return null;
  return expected;
}

export { COOKIE as OPERATOR_SESSION_COOKIE_NAME };
