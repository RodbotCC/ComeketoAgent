/**
 * Edge-safe HMAC for operator session cookie (middleware runs on Edge — no Node crypto).
 * Must match `operator-guard.ts`: HMAC-SHA256(secret, password) → hex digest.
 */

export const OPERATOR_SESSION_COOKIE_NAME = "cmk_operator";

export async function operatorSessionTokenHexEdge(
  password: string,
  secret: string
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(password));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function verifyOperatorSessionCookieEdge(
  cookieValue: string | undefined,
  password: string,
  secret: string
): Promise<boolean> {
  if (!cookieValue || !password || !secret) return false;
  const expected = await operatorSessionTokenHexEdge(password, secret);
  if (cookieValue.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= cookieValue.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
