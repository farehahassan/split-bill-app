import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

import { AuthService } from "../src/modules/auth/auth.service.js";
import { AuthRepository } from "../src/modules/auth/auth.repository.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { hashRefreshToken } from "../src/modules/auth/refresh-token.util.js";

vi.mock("../src/modules/auth/auth.repository.js", async () => {
  const actual = await vi.importActual<typeof import("../src/modules/auth/auth.repository.js")>(
    "../src/modules/auth/auth.repository.js",
  );
  return {
    ...actual,
    AuthRepository: vi.fn(() => ({
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      findRefreshTokenByHash: vi.fn(),
      createRefreshToken: vi.fn(),
      revokeRefreshTokenById: vi.fn(),
      rotateRefreshToken: vi.fn(),
    })),
  };
});

import { loadEnv, resetEnv } from "../src/config/env.js";

const repository = vi.mocked(new AuthRepository());

function makeService(): AuthService {
  return new AuthService(repository);
}

function refreshTokenRecord(
  overrides: {
    revokedAt?: Date | null;
    expiresAt?: Date;
    userId?: string;
  } = {},
) {
  return {
    id: "rt-1",
    userId: overrides.userId ?? "user-1",
    tokenHash: "a".repeat(64),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: overrides.revokedAt ?? null,
    createdAt: new Date(),
    user: { id: overrides.userId ?? "user-1", name: "Ahmed Raza", email: "ahmed@example.com" },
  };
}

function storedUser(overrides: { passwordHash?: string | null } = {}) {
  return {
    id: "user-1",
    name: "Ahmed Raza",
    email: "ahmed@example.com",
    passwordHash: overrides.passwordHash ?? "hash",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdGroups: [],
    memberships: [],
    paidExpenses: [],
    expenseSplits: [],
    settlementsPaid: [],
    settlementsGot: [],
    activities: [],
    refreshTokens: [],
  };
}

async function loginUser(): Promise<Awaited<ReturnType<AuthService["login"]>>> {
  const hash = await bcrypt.hash("password123", 10);
  repository.findByEmail.mockResolvedValue(storedUser({ passwordHash: hash }));
  const service = makeService();
  return service.login({ email: "ahmed@example.com", password: "password123" });
}

describe("AuthService", () => {
  beforeEach(() => {
    resetEnv();
    loadEnv();
    vi.clearAllMocks();
  });

  describe("register", () => {
    it("should create a user and return an auth result with a token", async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockResolvedValue({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });

      const service = makeService();
      const result = await service.register({
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        password: "password123",
      });

      expect(repository.create).toHaveBeenCalledWith({
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        passwordHash: expect.any(String),
      });
      expect(repository.create.mock.calls[0]?.[0].passwordHash).not.toBe("password123");
      expect(repository.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
        }),
      );
      expect(result.user).toEqual({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });
      expect(result.token).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(
        (repository.createRefreshToken.mock.calls[0]?.[0] as { tokenHash: string }).tokenHash,
      ).not.toBe(result.refreshToken);
    });

    it("should throw CONFLICT when the email is already registered", async () => {
      repository.findByEmail.mockResolvedValue({
        id: "existing",
        name: "Existing",
        email: "ahmed@example.com",
        passwordHash: "hash",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdGroups: [],
        memberships: [],
        paidExpenses: [],
        expenseSplits: [],
        settlementsPaid: [],
        settlementsGot: [],
        activities: [],
        refreshTokens: [],
      });

      const service = makeService();
      await expect(
        service.register({
          name: "Ahmed Raza",
          email: "ahmed@example.com",
          password: "password123",
        }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.EMAIL_IN_USE,
        statusCode: HTTP_STATUSES.CONFLICT,
      });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("should return a token for valid credentials", async () => {
      const hash = await bcrypt.hash("password123", 10);
      repository.findByEmail.mockResolvedValue(storedUser({ passwordHash: hash }));

      const service = makeService();
      const result = await service.login({
        email: "ahmed@example.com",
        password: "password123",
      });

      expect(result.user.email).toBe("ahmed@example.com");
      expect(result.token).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it("should store the refresh token as a hash, never the plaintext", async () => {
      const result = await loginUser();
      const stored = repository.createRefreshToken.mock.calls[0]?.[0];

      expect(result.refreshToken).toBeTruthy();
      expect(stored).toBeDefined();
      expect((stored as { tokenHash: string }).tokenHash).not.toBe(result.refreshToken);
      expect((stored as { tokenHash: string }).tokenHash).toBe(
        hashRefreshToken(result.refreshToken),
      );
    });

    it("should throw UNAUTHORIZED for an unregistered email", async () => {
      repository.findByEmail.mockResolvedValue(null);

      const service = makeService();
      await expect(
        service.login({ email: "nobody@example.com", password: "password123" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.INVALID_CREDENTIALS,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });

    it("should throw UNAUTHORIZED for a wrong password", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      repository.findByEmail.mockResolvedValue({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        passwordHash: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdGroups: [],
        memberships: [],
        paidExpenses: [],
        expenseSplits: [],
        settlementsPaid: [],
        settlementsGot: [],
        activities: [],
        refreshTokens: [],
      });

      const service = makeService();
      await expect(
        service.login({ email: "ahmed@example.com", password: "wrong-password" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.INVALID_CREDENTIALS,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });
  });

  describe("refresh", () => {
    it("should issue a new access and refresh token and rotate the session", async () => {
      repository.findRefreshTokenByHash.mockResolvedValue(refreshTokenRecord());
      repository.rotateRefreshToken.mockResolvedValue({
        id: "rt-2",
        userId: "user-1",
        tokenHash: "b".repeat(64),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        createdAt: new Date(),
      });

      const service = makeService();
      const result = await service.refresh("some-refresh-token");

      expect(result.user).toEqual({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });
      expect(result.token).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(repository.findRefreshTokenByHash).toHaveBeenCalledWith(
        hashRefreshToken("some-refresh-token"),
      );
      expect(repository.rotateRefreshToken).toHaveBeenCalledWith(
        "rt-1",
        expect.objectContaining({
          userId: "user-1",
          tokenHash: hashRefreshToken(result.refreshToken),
          expiresAt: expect.any(Date),
        }),
      );
      expect(result.refreshToken).not.toBe("some-refresh-token");
    });

    it("should throw UNAUTHORIZED for a nonexistent token", async () => {
      repository.findRefreshTokenByHash.mockResolvedValue(null);

      const service = makeService();
      await expect(service.refresh("unknown-token")).rejects.toMatchObject({
        code: APP_ERRORS.REFRESH_TOKEN_INVALID,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
      expect(repository.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it("should throw UNAUTHORIZED for a revoked token", async () => {
      repository.findRefreshTokenByHash.mockResolvedValue(
        refreshTokenRecord({ revokedAt: new Date() }),
      );

      const service = makeService();
      await expect(service.refresh("revoked-token")).rejects.toMatchObject({
        code: APP_ERRORS.REFRESH_TOKEN_INVALID,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
      expect(repository.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it("should throw UNAUTHORIZED for an expired token", async () => {
      repository.findRefreshTokenByHash.mockResolvedValue(
        refreshTokenRecord({ expiresAt: new Date(Date.now() - 1000) }),
      );

      const service = makeService();
      await expect(service.refresh("expired-token")).rejects.toMatchObject({
        code: APP_ERRORS.REFRESH_TOKEN_INVALID,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
      expect(repository.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it("should throw UNAUTHORIZED when the session was already rotated (replay)", async () => {
      repository.findRefreshTokenByHash.mockResolvedValue(refreshTokenRecord());
      repository.rotateRefreshToken.mockResolvedValue(null);

      const service = makeService();
      await expect(service.refresh("replayed-token")).rejects.toMatchObject({
        code: APP_ERRORS.REFRESH_TOKEN_INVALID,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });
  });

  describe("logout", () => {
    it("should revoke the session identified by the presented refresh token", async () => {
      repository.findRefreshTokenByHash.mockResolvedValue(refreshTokenRecord());

      const service = makeService();
      const result = await service.logout("session-refresh-token");

      expect(repository.findRefreshTokenByHash).toHaveBeenCalledWith(
        hashRefreshToken("session-refresh-token"),
      );
      expect(repository.revokeRefreshTokenById).toHaveBeenCalledWith("rt-1");
      expect(result).toEqual({ message: expect.any(String) });
    });

    it("should be idempotent for an unknown token", async () => {
      repository.findRefreshTokenByHash.mockResolvedValue(null);

      const service = makeService();
      const result = await service.logout("missing-token");

      expect(repository.revokeRefreshTokenById).not.toHaveBeenCalled();
      expect(result).toEqual({ message: expect.any(String) });
    });

    it("should be idempotent for an already-revoked token", async () => {
      repository.findRefreshTokenByHash.mockResolvedValue(
        refreshTokenRecord({ revokedAt: new Date() }),
      );

      const service = makeService();
      const result = await service.logout("again-token");

      expect(repository.revokeRefreshTokenById).toHaveBeenCalled();
      expect(result).toEqual({ message: expect.any(String) });
    });
  });

  describe("getMe", () => {
    it("should return the user when found", async () => {
      repository.findById.mockResolvedValue({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        passwordHash: "hash",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdGroups: [],
        memberships: [],
        paidExpenses: [],
        expenseSplits: [],
        settlementsPaid: [],
        settlementsGot: [],
        activities: [],
        refreshTokens: [],
      });

      const service = makeService();
      const user = await service.getMe("user-1");

      expect(user).toEqual({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });
    });

    it("should throw NOT_FOUND when the user does not exist", async () => {
      repository.findById.mockResolvedValue(null);

      const service = makeService();
      await expect(service.getMe("missing")).rejects.toMatchObject({
        code: APP_ERRORS.USER_NOT_FOUND,
        statusCode: HTTP_STATUSES.NOT_FOUND,
      });
    });
  });
});
