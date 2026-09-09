import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // The integration suite lives under tests/integration/ and uses its own
    // config (vitest.integration.config.ts). It requires live PostgreSQL +
    // Redis, so it must never run inside the default unit run.
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/integration/**"],
    testTimeout: 10000,
    setupFiles: ["tests/setup.ts"],
  },
});
