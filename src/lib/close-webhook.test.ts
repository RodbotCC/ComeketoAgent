import { describe, expect, it } from "vitest";
import { createHmac, randomBytes } from "crypto";
import { verifyCloseWebhookSignature } from "./close-webhook";

describe("verifyCloseWebhookSignature", () => {
  it("accepts valid HMAC-SHA256 hex (sig + timestamp + body)", () => {
    const secretHex = randomBytes(16).toString("hex");
    const key = Buffer.from(secretHex, "hex");
    const rawBody = `{"event":{"id":"evt_1"}}`;
    const sigTs = "1715000000";
    const expected = createHmac("sha256", key).update(sigTs + rawBody, "utf8").digest("hex");
    expect(
      verifyCloseWebhookSignature(rawBody, expected, sigTs, secretHex)
    ).toBe(true);
  });

  it("rejects wrong signature", () => {
    const secretHex = randomBytes(12).toString("hex");
    const rawBody = "{}";
    const sigTs = "1715000000";
    const wrong = createHmac("sha256", Buffer.from(secretHex, "hex"))
      .update(sigTs + "other", "utf8")
      .digest("hex");
    expect(verifyCloseWebhookSignature(rawBody, wrong, sigTs, secretHex)).toBe(false);
  });

  it("rejects missing headers or empty secret", () => {
    const secretHex = randomBytes(8).toString("hex");
    expect(verifyCloseWebhookSignature("{}", null, "1", secretHex)).toBe(false);
    expect(verifyCloseWebhookSignature("{}", "ab", null, secretHex)).toBe(false);
    expect(verifyCloseWebhookSignature("{}", "ab", "1", "")).toBe(false);
  });
});
