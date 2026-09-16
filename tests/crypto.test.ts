import { describe, expect, it } from "vitest";

import {
  createSignedValue,
  hashToken,
  safeEqual,
  verifySignedValue,
} from "@/lib/server/crypto";

describe("access and workspace cryptography", () => {
  it("round-trips a signed cookie and rejects tampering", () => {
    const secret = "a-secure-test-secret-that-is-long-enough";
    const signed = createSignedValue("payload", secret);
    expect(verifySignedValue(signed, secret)).toBe("payload");
    expect(verifySignedValue(`${signed}x`, secret)).toBeNull();
  });

  it("compares equal values safely and hashes raw workspace tokens", () => {
    expect(safeEqual("same", "same")).toBe(true);
    expect(safeEqual("short", "different-length")).toBe(false);
    expect(hashToken("raw-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken("raw-token")).not.toContain("raw-token");
  });
});
