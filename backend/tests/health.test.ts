import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

vi.mock("../src/db/prisma.js", async () => {
  return {
    isDatabaseReachable: vi.fn(),
  };
});

import { isDatabaseReachable } from "../src/db/prisma.js";

const mockedIsDatabaseReachable = vi.mocked(isDatabaseReachable);

describe("Health readiness", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockedIsDatabaseReachable.mockReset();
    app = createApp();
  });

  it("GET /health/ready returns 200 when the database is reachable", async () => {
    mockedIsDatabaseReachable.mockResolvedValue(true);

    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(HTTP_STATUSES.OK);
    expect(res.body).toEqual({ status: "ready" });
  });

  it("GET /health/ready returns 503 when the database is unavailable", async () => {
    mockedIsDatabaseReachable.mockResolvedValue(false);

    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(HTTP_STATUSES.SERVICE_UNAVAILABLE);
    expect(res.body).toEqual({
      status: "unavailable",
      message: "Service is not ready yet.",
    });
  });
});