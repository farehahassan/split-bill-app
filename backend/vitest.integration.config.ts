import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.js";

/**
 * Runs only the real-infrastructure integration suites (PostgreSQL and Redis).
 * The suites themselves skip when not configured, but the CI job provisions the
 * dedicated services and sets the TEST_* variables so they genuinely run there.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});