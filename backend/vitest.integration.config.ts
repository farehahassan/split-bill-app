import { defineConfig } from "vitest/config";

// Integration configuration. This suite talks to real infrastructure (the
// PostgreSQL + Redis services in docker-compose.yml) and is deliberately kept
// separate from the unit suite so `npm test` never needs a live database.
//
//   - `fileParallelism: false`: test files share one PostgreSQL schema and one
//     Redis database, so they must run sequentially; a global beforeEach
//     truncates tables and flushes Redis between files as well as between tests.
//   - `testTimeout`/`hookTimeout` are raised because real I/O and schema
//     migration (in setup) are slower than in-memory fakes.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});