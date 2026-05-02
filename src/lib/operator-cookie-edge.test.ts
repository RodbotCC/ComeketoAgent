import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { operatorSessionTokenHexEdge } from "./operator-cookie-edge";

describe("operator cookie edge HMAC", () => {
  it("matches Node crypto.createHmac", async () => {
    const secret = "test-secret";
    const password = "op-password";
    const edge = await operatorSessionTokenHexEdge(password, secret);
    const node = createHmac("sha256", secret).update(password).digest("hex");
    expect(edge).toBe(node);
    expect(edge.length).toBe(64);
  });
});
