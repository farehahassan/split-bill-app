import { describe, it, expect } from "vitest";

import { generateRefreshToken, hashRefreshToken } from "../src/modules/auth/refresh-token.util.js";

describe("refresh token utility", () => {
  it("generates unique high-entropy opaque tokens", () => {
    const token = generateRefreshToken();
    expect(token.length).toBe(43);
    expect(token).not.toMatch(/[+/=]/);
    expect(generateRefreshToken()).not.toBe(token);
  });

  it("hashes tokens deterministically to a 64-char hex digest", () => {
    const token = generateRefreshToken();
    const digest = hashRefreshToken(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(digest);
  });

  it("never stores the plaintext token", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).not.toBe(token);
    expect(hashRefreshToken(token)).not.toContain(token);
  });

  it("produces different digests for different tokens", () => {
    const a = hashRefreshToken(generateRefreshToken());
    const b = hashRefreshToken(generateRefreshToken());
    expect(a).not.toBe(b);
  });
});
