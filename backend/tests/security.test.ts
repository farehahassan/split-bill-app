import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { EDGE_MAX_BODY_BYTES } from "../src/edge/requestGuard.js";
import { createApp } from "../src/app.js";
import { resetEnv } from "../src/config/env.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { setSilent } from "../src/utils/logger.js";

const JWT_SECRET = "test-secret-that-is-long-enough-for-tests";

const USER_ID = "55555555-5555-4555-8555-555555555555";
const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "66666666-6666-4666-8666-666666666666";

function validToken(sub = USER_ID): string {
  return jwt.sign({ sub, email: "me@example.com" }, JWT_SECRET, { expiresIn: "1h" });
}

function expiredToken(): string {
  return jwt.sign(
    { sub: USER_ID, email: "me@example.com", exp: Math.floor(Date.now() / 1000) - 60 },
    JWT_SECRET,
  );
}

function tokenWithAlgorithm(algorithm: jwt.Algorithm): string {
  return jwt.sign({ sub: USER_ID, email: "me@example.com" }, JWT_SECRET, {
    algorithm,
    expiresIn: "1h",
  });
}

function tokenWithoutSubject(): string {
  return jwt.sign({ email: "me@example.com" }, JWT_SECRET, { expiresIn: "1h" });
}

vi.mock("../src/db/prisma.js", async () => {
  return {
    prisma: {
      $transaction: vi.fn(),
      group: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      groupMember: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      refreshToken: {
        findUnique: vi.fn(),
      },
      expense: {
        findMany: vi.fn(),
      },
    },
  };
});

import { prisma } from "../src/db/prisma.js";

const mockPrisma = vi.mocked(prisma);

function setRateLimitEnv(max: string): void {
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  process.env.RATE_LIMIT_MAX = max;
  process.env.AUTH_RATE_LIMIT_MAX = "100";
}

function clearRateLimitEnv(): void {
  delete process.env.RATE_LIMIT_WINDOW_MS;
  delete process.env.RATE_LIMIT_MAX;
  delete process.env.AUTH_RATE_LIMIT_MAX;
}

describe("Security hardening", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.group.findMany.mockReset();
    mockPrisma.user.findUnique.mockReset();
    app = createApp();
  });

  afterEach(() => {
    clearRateLimitEnv();
  });

  describe("input validation", () => {
    it("rejects a non-UUID group id with 400", async () => {
      const res = await request(app)
        .get("/api/v1/groups/not-a-uuid")
        .set("Authorization", `Bearer ${validToken()}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
      expect(mockPrisma.group.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a blank (whitespace) group id with 400", async () => {
      const res = await request(app)
        .get("/api/v1/groups/%20%20")
        .set("Authorization", `Bearer ${validToken()}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("rejects a non-UUID member id in the member delete path with 400", async () => {
      const res = await request(app)
        .delete(`/api/v1/groups/${GROUP_ID}/members/not-a-uuid`)
        .set("Authorization", `Bearer ${validToken()}`);

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(mockPrisma.groupMember.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a non-UUID user id in the add-member body with 400", async () => {
      const res = await request(app)
        .post(`/api/v1/groups/${GROUP_ID}/members`)
        .set("Authorization", `Bearer ${validToken()}`)
        .send({ userId: "not-a-uuid" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a non-UUID payer id in an expense body with 400", async () => {
      const res = await request(app)
        .post(`/api/v1/groups/${GROUP_ID}/expenses`)
        .set("Authorization", `Bearer ${validToken()}`)
        .send({
          description: "Lunch",
          amountMinorUnits: 1000,
          payerId: "not-a-uuid",
          splitType: "EQUAL",
          participants: [{ userId: MEMBER_ID }],
        });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });

    it("rejects a non-UUID payer id in a settlement body with 400", async () => {
      const res = await request(app)
        .post(`/api/v1/groups/${GROUP_ID}/settlements`)
        .set("Authorization", `Bearer ${validToken()}`)
        .set("Idempotency-Key", "settlement-security-key-001")
        .send({ payerId: "not-a-uuid", payeeId: USER_ID, amountMinorUnits: 500 });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
    });
  });

  describe("authentication tokens", () => {
    it("returns 401 for a missing Authorization header", async () => {
      const res = await request(app).get("/api/v1/groups");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 401 for a malformed multi-token Bearer header", async () => {
      const res = await request(app)
        .get("/api/v1/groups")
        .set("Authorization", "Bearer abc def");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.message).toBe("Bearer token is required.");
    });

    it("returns 401 for a lone Bearer keyword", async () => {
      const res = await request(app).get("/api/v1/groups").set("Authorization", "Bearer");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("returns 401 for a non-Bearer scheme", async () => {
      const res = await request(app)
        .get("/api/v1/groups")
        .set("Authorization", "Basic abc");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("accepts a case-insensitive bearer scheme", async () => {
      mockPrisma.group.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get("/api/v1/groups")
        .set("Authorization", `bearer ${validToken()}`);

      expect(res.status).toBe(HTTP_STATUSES.OK);
    });

    it("returns 401 for an expired token", async () => {
      const res = await request(app)
        .get("/api/v1/groups")
        .set("Authorization", `Bearer ${expiredToken()}`);

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.message).toContain("expired");
    });

    it("rejects a token signed with a different algorithm", async () => {
      const res = await request(app)
        .get("/api/v1/groups")
        .set("Authorization", `Bearer ${tokenWithAlgorithm("HS384")}`);

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
    });

    it("rejects a validly-signed token without a subject", async () => {
      const res = await request(app)
        .get("/api/v1/groups")
        .set("Authorization", `Bearer ${tokenWithoutSubject()}`);

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.message).toBe("Invalid or malformed token.");
    });
  });

  describe("CORS", () => {
    it("reflects an allowlisted origin", async () => {
      const res = await request(app).get("/health").set("Origin", "http://localhost:3000");

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    });

    it("serves no CORS headers for a disallowed origin", async () => {
      const res = await request(app).get("/health").set("Origin", "https://evil.example");

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("HTTP hardening", () => {
    it("sets the helmet security headers on every response", async () => {
      const res = await request(app).get("/health");

      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBeDefined();
      expect(res.headers["content-security-policy"]).toBeDefined();
      expect(res.headers["referrer-policy"]).toBeDefined();
      expect(res.headers["strict-transport-security"]).toBeDefined();
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("does not leak error internals on a generic 500", async () => {
      mockPrisma.group.findMany.mockRejectedValue(new Error("secret-db-boom"));

      const res = await request(app)
        .get("/api/v1/groups")
        .set("Authorization", `Bearer ${validToken()}`);

      expect(res.status).toBe(HTTP_STATUSES.INTERNAL_SERVER_ERROR);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain("secret-db-boom");
      expect(JSON.stringify(res.body)).not.toContain(" at ");
    });

    it("never logs access or refresh tokens from requests", async () => {
      const accessToken = validToken();
      const refreshToken = "refresh-token-that-must-never-reach-logs-001";
      mockPrisma.group.findMany.mockResolvedValue([]);
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      setSilent(false);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        await request(app)
          .get("/api/v1/groups")
          .set("Authorization", `Bearer ${accessToken}`);
        await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
      } finally {
        setSilent(true);
      }
      const logged = logSpy.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
      logSpy.mockRestore();

      expect(logged).not.toContain(accessToken);
      expect(logged).not.toContain(refreshToken);
    });

    it("rejects an oversized request body with 413 before it is parsed", async () => {
      const oversized = String(EDGE_MAX_BODY_BYTES + 1);

      const res = await request(app).get("/health").set("Content-Length", oversized);

      expect(res.status).toBe(HTTP_STATUSES.PAYLOAD_TOO_LARGE);
      expect(res.body.message).toBe("Request body too large.");
    });

    it("returns 429 once the API rate limit is exceeded", async () => {
      setRateLimitEnv("3");
      resetEnv();
      app = createApp();

      for (let i = 0; i < 3; i++) {
        expect((await request(app).get("/health")).status).toBe(HTTP_STATUSES.OK);
      }

      const blocked = await request(app).get("/health");
      expect(blocked.status).toBe(HTTP_STATUSES.TOO_MANY_REQUESTS);
      expect(blocked.body).toEqual({ success: false, message: "Too many requests" });
    });
  });

  describe("account enumeration", () => {
    it("returns an identical error message for an unknown email and a wrong password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const unknownEmail = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "nobody@example.com", password: "whatever-password" });

      expect(unknownEmail.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(unknownEmail.body.message).toBe("Invalid email or password.");

      const passwordHash = await bcrypt.hash("correct-password", 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        passwordHash,
        emailVerifiedAt: null,
      } as never);

      const wrongPassword = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "ahmed@example.com", password: "wrong-password" });

      expect(wrongPassword.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(wrongPassword.body.message).toBe("Invalid email or password.");
    });
  });
});