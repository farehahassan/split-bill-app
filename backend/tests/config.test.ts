import { describe, it, expect, beforeEach } from "vitest";
import { loadEnv, resetEnv } from "../src/config/env.js";

describe("Configuration", () => {
  beforeEach(() => {
    resetEnv();
  });

  it("should load valid environment variables", () => {
    const env = loadEnv();

    expect(env.NODE_ENV).toBe("test");
    expect(env.DATABASE_URL).toBe("postgresql://test:test@localhost:5432/test_db");
    expect(env.JWT_SECRET).toBe("test-secret-that-is-long-enough-for-tests");
  });

  it("should use defaults for optional fields", () => {
    const env = loadEnv();

    expect(env.CORS_ORIGIN).toBeDefined();
  });

  it("should throw on missing DATABASE_URL", () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    expect(() => loadEnv()).toThrow("DATABASE_URL");

    if (original) process.env.DATABASE_URL = original;
  });

  it.each([
    ["short JWT_SECRET", ["JWT_SECRET", "weak"], "JWT_SECRET"],
    ["unset CORS_ORIGIN", ["CORS_ORIGIN", "http://localhost:3000"], "CORS_ORIGIN"],
  ])("production should reject %s", (_name, [key, value]: string[], path) => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalKey = process.env[key];

    process.env.NODE_ENV = "production";
    process.env[key] = value;

    try {
      expect(() => loadEnv()).toThrow(path);
    } finally {
      process.env.NODE_ENV = originalNodeEnv ?? "test";
      if (originalKey === undefined) delete process.env[key];
      else process.env[key] = originalKey;
    }
  });

  it("should accept a strong production configuration", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "a".repeat(48);
    process.env.CORS_ORIGIN = "https://app.hisab.example.com";

    try {
      const env = loadEnv();
      expect(env.NODE_ENV).toBe("production");
      expect(env.JWT_SECRET).toBe("a".repeat(48));
      expect(env.CORS_ORIGIN).toBe("https://app.hisab.example.com");
    } finally {
      process.env.NODE_ENV = originalNodeEnv ?? "test";
    }
  });
});
