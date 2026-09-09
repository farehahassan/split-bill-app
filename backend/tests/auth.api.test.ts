import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

const JWT_SECRET = "test-secret-that-is-long-enough-for-tests";

function signToken(userId: string): string {
  return jwt.sign({ sub: userId, email: "me@example.com" }, JWT_SECRET, { expiresIn: "1h" });
}

vi.mock("../src/db/prisma.js", async () => {
  return {
    prisma: {
      $transaction: vi.fn(),
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      refreshToken: {
        findUnique: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      authToken: {
        findUnique: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
  };
});

import { prisma } from "../src/db/prisma.js";
import { hashRefreshToken } from "../src/modules/auth/refresh-token.util.js";

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockUpdate = vi.mocked(prisma.user.update);
const mockRefreshFindUnique = vi.mocked(prisma.refreshToken.findUnique);
const mockRefreshUpdateMany = vi.mocked(prisma.refreshToken.updateMany);
const mockAuthTokenFindUnique = vi.mocked(prisma.authToken.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

const existingUser = {
  id: "user-1",
  name: "Ahmed Raza",
  email: "ahmed@example.com",
  passwordHash: "hash",
  emailVerifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const verificationRecord = {
  id: "at-1",
  userId: "user-1",
  purpose: "EMAIL_VERIFICATION",
  tokenHash: "a".repeat(64),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  consumedAt: null,
  createdAt: new Date(),
};

const resetRecord = {
  ...verificationRecord,
  purpose: "PASSWORD_RESET",
};

function mockRegisterTransaction(): void {
  const tx = {
    user: { create: vi.fn().mockResolvedValue({ ...existingUser, passwordHash: "irrelevant" }) },
    refreshToken: { create: vi.fn().mockResolvedValue({ id: "rt-1" }) },
    authToken: { create: vi.fn().mockResolvedValue({ id: "at-1" }) },
  };
  const txUserCreate = vi.mocked(tx.user.create);
  const txRefreshCreate = vi.mocked(tx.refreshToken.create);
  const txAuthCreate = vi.mocked(tx.authToken.create);
  mockTransaction.mockImplementation(async (fn) => fn(tx));

  return () => ({ txUserCreate, txRefreshCreate, txAuthCreate });
}

describe("Authentication API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe("POST /api/v1/auth/register", () => {
    it("should register a new user and return 201 with user and token", async () => {
      mockFindUnique.mockResolvedValue(null);
      const captures = mockRegisterTransaction();

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ name: "Ahmed Raza", email: "ahmed@example.com", password: "password123" });

      expect(res.status).toBe(HTTP_STATUSES.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe("user-1");
      expect(res.body.data.user.email).toBe("ahmed@example.com");
      expect(res.body.data.token).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.password).toBeUndefined();

      const { txUserCreate, txRefreshCreate, txAuthCreate } = captures();
      expect(txUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: expect.any(String) }),
        }),
      );
      const hashedPassword = txUserCreate.mock.calls[0]?.[0].data.passwordHash as string;
      expect(hashedPassword).not.toBe("password123");

      const refreshHash = txRefreshCreate.mock.calls[0]?.[0].data.tokenHash as string;
      expect(refreshHash).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.data.refreshToken).not.toBe(refreshHash);

      const authData = txAuthCreate.mock.calls[0]?.[0].data as {
        purpose: string;
        tokenHash: string;
      };
      expect(authData.purpose).toBe("EMAIL_VERIFICATION");
      expect(authData.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should return 409 when the email is already registered", async () => {
      mockFindUnique.mockResolvedValue(existingUser);

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ name: "Ahmed Raza", email: "ahmed@example.com", password: "password123" });

      expect(res.status).toBe(HTTP_STATUSES.CONFLICT);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("already exists");
    });

    it("should return 400 when validation fails", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ name: "", email: "not-an-email", password: "short" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it("should reject validation failures in middleware before reaching the service", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ name: "", email: "not-an-email", password: "short" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("should return 200 with user and token for valid credentials", async () => {
      const hash = await bcrypt.hash("password123", 10);
      mockFindUnique.mockResolvedValue({ ...existingUser, passwordHash: hash });

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "ahmed@example.com", password: "password123" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe("user-1");
      expect(res.body.data.token).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
    });

    it("should return 401 for invalid credentials", async () => {
      mockFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "ahmed@example.com", password: "password123" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 400 when the body is missing required fields", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    const validRecord = {
      id: "rt-1",
      userId: "user-1",
      tokenHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: null,
      createdAt: new Date(),
      user: { id: "user-1", name: "Ahmed Raza", email: "ahmed@example.com" },
    };

    function mockRotation() {
      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          refreshToken: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({ id: "rt-2" }),
          },
        };
        return fn(tx);
      });
    }

    it("should issue a new access token and rotate the refresh token", async () => {
      mockRefreshFindUnique.mockResolvedValue(validRecord);
      mockRotation();

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "some-valid-token" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe("user-1");
      expect(res.body.data.token).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(mockRefreshFindUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashRefreshToken("some-valid-token") },
        include: expect.any(Object),
      });
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.refreshToken).not.toEqual("some-valid-token");
    });

    it("should return 401 for a nonexistent or malformed token", async () => {
      mockRefreshFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "not-a-real-token" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 401 for a revoked token", async () => {
      mockRefreshFindUnique.mockResolvedValue({ ...validRecord, revokedAt: new Date() });

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "revoked-token" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 401 for an expired token", async () => {
      mockRefreshFindUnique.mockResolvedValue({
        ...validRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "expired-token" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 401 when the session was already rotated (replay)", async () => {
      mockRefreshFindUnique.mockResolvedValue(validRecord);
      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          refreshToken: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn(),
          },
        };
        return fn(tx);
      });

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "replayed-token" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 400 for a missing, empty, or unexpected refresh token", async () => {
      const missing = await request(app).post("/api/v1/auth/refresh").send({});
      const empty = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "" });
      const extra = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "x", userId: "user-1" });

      expect(missing.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(empty.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(extra.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(mockRefreshFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("should revoke the session and return 200", async () => {
      mockRefreshFindUnique.mockResolvedValue({
        id: "rt-1",
        userId: "user-1",
        tokenHash: "a".repeat(64),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: null,
        createdAt: new Date(),
        user: { id: "user-1", name: "Ahmed Raza", email: "ahmed@example.com" },
      });
      mockRefreshUpdateMany.mockResolvedValue({ count: 1 });

      const res = await request(app)
        .post("/api/v1/auth/logout")
        .send({ refreshToken: "session-token" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(mockRefreshUpdateMany).toHaveBeenCalledWith({
        where: { id: "rt-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(res.body.data.token).toBeUndefined();
    });

    it("should be idempotent for an unknown token", async () => {
      mockRefreshFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/logout")
        .send({ refreshToken: "unknown-token" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(mockRefreshUpdateMany).not.toHaveBeenCalled();
    });

    it("should return 400 for an invalid request body", async () => {
      const res = await request(app).post("/api/v1/auth/logout").send({});

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.success).toBe(false);
    });
  });

  describe("POST /api/v1/auth/verify-email", () => {
    it("should verify a valid token and return 200", async () => {
      mockAuthTokenFindUnique.mockResolvedValue(verificationRecord);
      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          authToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          user: { update: vi.fn().mockResolvedValue(existingUser) },
        };
        return fn(tx);
      });

      const res = await request(app)
        .post("/api/v1/auth/verify-email")
        .send({ token: "raw-verification-token" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain("verified");
    });

    it("should return 401 for an unknown token", async () => {
      mockAuthTokenFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/verify-email")
        .send({ token: "raw-verification-token" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("should return 401 for an already-used token", async () => {
      mockAuthTokenFindUnique.mockResolvedValue({ ...verificationRecord, consumedAt: new Date() });

      const res = await request(app)
        .post("/api/v1/auth/verify-email")
        .send({ token: "used-token" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 401 for an expired token", async () => {
      mockAuthTokenFindUnique.mockResolvedValue({
        ...verificationRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      const res = await request(app)
        .post("/api/v1/auth/verify-email")
        .send({ token: "expired-token" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 400 for a missing or malformed token", async () => {
      const missing = await request(app).post("/api/v1/auth/verify-email").send({});
      const malformed = await request(app)
        .post("/api/v1/auth/verify-email")
        .send({ token: "not base64url!!" });

      expect(missing.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(malformed.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(mockAuthTokenFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/resend-verification", () => {
    it("should mint a fresh token for an unverified account and return 200", async () => {
      mockFindUnique.mockResolvedValue(existingUser);
      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          authToken: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({ id: "at-2" }),
          },
        };
        const result = await fn(tx);
        expect(tx.authToken.deleteMany).toHaveBeenCalledWith({
          where: { userId: "user-1", purpose: "EMAIL_VERIFICATION" },
        });
        expect(tx.authToken.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              userId: "user-1",
              purpose: "EMAIL_VERIFICATION",
              tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
              expiresAt: expect.any(Date),
            },
          }),
        );
        return result;
      });

      const res = await request(app)
        .post("/api/v1/auth/resend-verification")
        .send({ email: "ahmed@example.com" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain("verification email is on its way");
    });

    it("should return the generic 200 for an unknown email without minting a token", async () => {
      mockFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/resend-verification")
        .send({ email: "nobody@example.com" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.data.message).toContain("verification email is on its way");
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("should return the generic 200 for an already-verified account", async () => {
      mockFindUnique.mockResolvedValue({ ...existingUser, emailVerifiedAt: new Date() });

      const res = await request(app)
        .post("/api/v1/auth/resend-verification")
        .send({ email: "ahmed@example.com" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.data.message).toContain("verification email is on its way");
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("should return 400 for an invalid email", async () => {
      const res = await request(app)
        .post("/api/v1/auth/resend-verification")
        .send({ email: "not-an-email" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(mockFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/forgot-password", () => {
    it("should mint a fresh reset token for a known account and return 200", async () => {
      mockFindUnique.mockResolvedValue(existingUser);
      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          authToken: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockResolvedValue({ id: "at-2" }),
          },
        };
        const result = await fn(tx);
        expect(tx.authToken.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              userId: "user-1",
              purpose: "PASSWORD_RESET",
              tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
              expiresAt: expect.any(Date),
            },
          }),
        );
        return result;
      });

      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "ahmed@example.com" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain("password reset email is on its way");
    });

    it("should return the generic 200 for an unknown email without minting a token", async () => {
      mockFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "nobody@example.com" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.data.message).toContain("password reset email is on its way");
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("should return 400 for an invalid email", async () => {
      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(mockFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/reset-password", () => {
    function mockResetTransaction() {
      mockTransaction.mockImplementation(async (fn) => {
        const tx = {
          authToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          user: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: vi.fn().mockResolvedValue(existingUser),
          },
          refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        };
        const result = await fn(tx);
        expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
          where: { userId: "user-1", revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        });
        return result;
      });
    }

    it("should update the password and revoke all sessions, returning 200", async () => {
      mockAuthTokenFindUnique.mockResolvedValue(resetRecord);
      mockResetTransaction();

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "raw-reset-token", newPassword: "a-new-secure-password" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain("has been reset");
    });

    it("should return 401 for an unknown token", async () => {
      mockAuthTokenFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "unknown-token", newPassword: "a-new-secure-password" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("should return 401 for an already-used token", async () => {
      mockAuthTokenFindUnique.mockResolvedValue({ ...resetRecord, consumedAt: new Date() });

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "used-token", newPassword: "a-new-secure-password" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 401 for an expired token", async () => {
      mockAuthTokenFindUnique.mockResolvedValue({
        ...resetRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "expired-token", newPassword: "a-new-secure-password" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 400 for a missing token or a weak password", async () => {
      const missingToken = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ newPassword: "a-new-secure-password" });
      const weakPassword = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "raw-reset-token", newPassword: "short" });
      const extraField = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "raw-reset-token", newPassword: "a-new-secure-password", role: "admin" });

      expect(missingToken.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(weakPassword.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(extraField.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(mockAuthTokenFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("should return 401 without a token", async () => {
      const res = await request(app).get("/api/v1/auth/me");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 401 with an invalid token", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer not-a-valid-token");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });
  });

  describe("PATCH /api/v1/auth/me", () => {
    it("should return 401 without a token", async () => {
      const res = await request(app).patch("/api/v1/auth/me").send({ name: "New Name" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should update the name and email and return 200 with the updated profile", async () => {
      mockFindUnique
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValue(existingUser);
      mockUpdate.mockResolvedValue({ ...existingUser, name: "New Name", email: "new@example.com" });

      const res = await request(app)
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${signToken("user-1")}`)
        .send({ name: "New Name", email: "new@example.com" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.name).toBe("New Name");
      expect(res.body.data.user.email).toBe("new@example.com");
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { name: "New Name", email: "new@example.com" } }));
    });

    it("should return 409 when the email belongs to another account", async () => {
      mockFindUnique
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce({ ...existingUser, id: "user-2" });

      const res = await request(app)
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${signToken("user-1")}`)
        .send({ email: "taken@example.com" });

      expect(res.status).toBe(HTTP_STATUSES.CONFLICT);
      expect(res.body.success).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("should allow keeping the current email (same user)", async () => {
      mockFindUnique.mockResolvedValue(existingUser);
      mockUpdate.mockResolvedValue({ ...existingUser, name: "Renamed" });

      const res = await request(app)
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${signToken("user-1")}`)
        .send({ name: "Renamed", email: "ahmed@example.com" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.data.user.name).toBe("Renamed");
    });

    it("should return 404 when the authenticated user no longer exists", async () => {
      mockFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${signToken("missing-user")}`)
        .send({ name: "Ghost" });

      expect(res.status).toBe(HTTP_STATUSES.NOT_FOUND);
      expect(res.body.success).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("should return 400 for an empty body", async () => {
      const res = await request(app)
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${signToken("user-1")}`)
        .send({});

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid fields", async () => {
      const res = await request(app)
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${signToken("user-1")}`)
        .send({ name: "", email: "not-an-email" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.success).toBe(false);
    });

    it("should reject privileged fields outright", async () => {
      const res = await request(app)
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${signToken("user-1")}`)
        .send({ name: "New Name", password: "hacked" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});