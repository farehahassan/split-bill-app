import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

describe("Application", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("should create an Express application", () => {
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
  });

  it("GET /health should return 200 with status ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(HTTP_STATUSES.OK);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /unknown-route should return 404", async () => {
    const res = await request(app).get("/unknown-route");

    expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    expect(res.body).toEqual({
      success: false,
      message: "Endpoint not found.",
    });
  });

  it("GET /api/v1 returns 404 when no feature module is mounted at root", async () => {
    const res = await request(app).get("/api/v1");

    expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    expect(res.body.success).toBe(false);
  });

  it("GET /api/v1/users should return 404 (not implemented yet)", async () => {
    const res = await request(app).get("/api/v1/users");

    expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    expect(res.body.success).toBe(false);
  });

  it("POST /unknown-route should return 404", async () => {
    const res = await request(app).post("/unknown-route");

    expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
    expect(res.body.success).toBe(false);
  });

  it("should handle invalid JSON body gracefully", async () => {
    const res = await request(app)
      .post("/api/v1/auth")
      .set("Content-Type", "application/json")
      .send("{invalid json");

    expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
  });
});
