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
});
