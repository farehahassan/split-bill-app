import { describe, it, expect } from "vitest";

import {
  generateAuthToken,
  hashAuthToken,
} from "../src/modules/auth/auth-token.util.js";

describe("auth token utility", () => {
  it("generates unique high-entropy opaque tokens", () => {
    const token = generateAuthToken();
    expect(token.length).toBe(43);
    expect(token).not.toMatch(/[+/=]/);
    expect(generateAuthToken()).not.toBe(token);
  });

  it("hashes tokens deterministically to a 64-char hex digest", () => {
    const token = generateAuthToken();
    const digest = hashAuthToken(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAuthToken(token)).toBe(digest);
  });

  it("never stores the plaintext token", () => {
    const token = generateAuthToken();
    expect(hashAuthToken(token)).not.toBe(token);
    expect(hashAuthToken(token)).not.toContain(token);
  });

  it("produces different digests for different tokens", () => {
    const a = hashAuthToken(generateAuthToken());
    const b = hashAuthToken(generateAuthToken());
    expect(a).not.toBe(b);
  });
});