import { beforeEach } from "vitest";
import { resetEnv } from "../src/config/env.js";
import { setSilent } from "../src/utils/logger.js";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
process.env.CORS_ORIGIN = "http://localhost:3000";

beforeEach(() => {
  resetEnv();
  setSilent(true);
});
