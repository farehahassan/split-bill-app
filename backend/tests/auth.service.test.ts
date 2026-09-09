import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

import { AuthService } from "../src/modules/auth/auth.service.js";
import { AuthRepository } from "../src/modules/auth/auth.repository.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";
import { hashRefreshToken } from "../src/modules/auth/refresh-token.util.js";
import { hashAuthToken } from "../src/modules/auth/auth-token.util.js";
import { EmailService } from "../src/modules/email/email.service.js";

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
      createUserWithAuthData: vi.fn(),
      createAuthToken: vi.fn(),
      findAuthTokenByHash: vi.fn(),
      consumeVerificationTokenAndVerifyUser: vi.fn(),
      consumePasswordResetTokenAndUpdatePassword: vi.fn(),
    })),
  };
});

vi.mock("../src/modules/email/email.service.js", async () => {
  const actual = await vi.importActual<typeof import("../src/modules/email/email.service.js")>(
    "../src/modules/email/email.service.js",
  );
  return {
    ...actual,
    EmailService: vi.fn(() => ({
      sendVerificationEmail: vi.fn(async () => undefined),
      sendPasswordResetEmail: vi.fn(async () => undefined),
    })),
  };
});

import { loadEnv, resetEnv } from "../src/config/env.js";

const repository = vi.mocked(new AuthRepository());
const emailService = vi.mocked(new EmailService(undefined as never));

function makeService(): AuthService {
  return new AuthService(repository, emailService);
}

function refreshTokenRecord(overrides: {
  revokedAt?: Date | null;
  expiresAt?: Date;
  userId?: string;
} = {}) {
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

function storedUser(overrides: {
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
} = {}) {
  return {
    id: "user-1",
    name: "Ahmed Raza",
    email: "ahmed@example.com",
    passwordHash: overrides.passwordHash ?? "hash",
    emailVerifiedAt: overrides.emailVerifiedAt ?? null,
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

function authTokenRecord(overrides: {
  purpose?: "EMAIL_VERIFICATION" | "PASSWORD_RESET";
  consumedAt?: Date | null;
  expiresAt?: Date;
  userId?: string;
} = {}) {
  return {
    id: "at-1",
    userId: overrides.userId ?? "user-1",
    purpose: overrides.purpose ?? "EMAIL_VERIFICATION",
    tokenHash: "h".repeat(64),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    consumedAt: overrides.consumedAt ?? null,
    createdAt: new Date(),
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
    it("should create a user, its tokens, and return an auth result", async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.createUserWithAuthData.mockResolvedValue({
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

      expect(repository.createUserWithAuthData).toHaveBeenCalledWith({
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        passwordHash: expect.any(String),
        refreshTokenHash: hashRefreshToken(result.refreshToken),
        refreshTokenExpiresAt: expect.any(Date),
        verificationTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        verificationTokenExpiresAt: expect.any(Date),
      });
      const createArg = repository.createUserWithAuthData.mock.calls[0]?.[0] as {
        passwordHash: string;
        refreshTokenHash: string;
        verificationTokenHash: string;
      };
      expect(createArg.passwordHash).not.toBe("password123");
      expect(createArg.refreshTokenHash).not.toBe(result.refreshToken);
      expect(result.user).toEqual({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });
      expect(result.token).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        "ahmed@example.com",
        expect.stringContaining("/verify-email?token="),
        "Ahmed Raza",
      );
    });

    it("should not fail registration when the verification email cannot be sent", async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.createUserWithAuthData.mockResolvedValue({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });
      emailService.sendVerificationEmail.mockRejectedValue(new Error("smtp down"));

      const service = makeService();
      const result = await service.register({
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        password: "password123",
      });

      expect(result.user.id).toBe("user-1");
      expect(result.refreshToken).toBeTruthy();
    });

    it("should throw CONFLICT when the email is already registered", async () => {
      repository.findByEmail.mockResolvedValue(storedUser());

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
      expect(repository.createUserWithAuthData).not.toHaveBeenCalled();
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
      repository.findByEmail.mockResolvedValue(storedUser({ passwordHash: hash }));

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
      repository.findById.mockResolvedValue(storedUser());

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

  describe("verifyEmailAddress", () => {
    it("should verify a valid token and mark the user as verified", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(authTokenRecord());
      repository.consumeVerificationTokenAndVerifyUser.mockResolvedValue({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });

      const service = makeService();
      const result = await service.verifyEmailAddress("the-raw-token");

      expect(repository.findAuthTokenByHash).toHaveBeenCalledWith(
        hashAuthToken("the-raw-token"),
      );
      expect(repository.consumeVerificationTokenAndVerifyUser).toHaveBeenCalledWith(
        "at-1",
        "user-1",
        expect.any(Date),
      );
      expect(result).toEqual({ message: expect.any(String) });
    });

    it("should throw UNAUTHORIZED when the token is unknown", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(null);

      const service = makeService();
      await expect(service.verifyEmailAddress("unknown")).rejects.toMatchObject({
        code: APP_ERRORS.VERIFICATION_TOKEN_INVALID,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
      expect(repository.consumeVerificationTokenAndVerifyUser).not.toHaveBeenCalled();
    });

    it("should throw UNAUTHORIZED when the token belongs to another purpose", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(
        authTokenRecord({ purpose: "PASSWORD_RESET" }),
      );

      const service = makeService();
      await expect(service.verifyEmailAddress("wrong-purpose")).rejects.toMatchObject({
        code: APP_ERRORS.VERIFICATION_TOKEN_INVALID,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });

    it("should throw UNAUTHORIZED when the token is expired", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(
        authTokenRecord({ expiresAt: new Date(Date.now() - 1000) }),
      );

      const service = makeService();
      await expect(service.verifyEmailAddress("expired")).rejects.toMatchObject({
        code: APP_ERRORS.VERIFICATION_TOKEN_EXPIRED,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });

    it("should throw UNAUTHORIZED when the token was already used", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(
        authTokenRecord({ consumedAt: new Date() }),
      );

      const service = makeService();
      await expect(service.verifyEmailAddress("used")).rejects.toMatchObject({
        code: APP_ERRORS.VERIFICATION_TOKEN_USED,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });

    it("should throw UNAUTHORIZED when the token was consumed concurrently", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(authTokenRecord());
      repository.consumeVerificationTokenAndVerifyUser.mockResolvedValue(null);

      const service = makeService();
      await expect(service.verifyEmailAddress("race")).rejects.toMatchObject({
        code: APP_ERRORS.VERIFICATION_TOKEN_USED,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });
  });

  describe("resendVerification", () => {
    it("should mint a fresh token and email it for an unverified account", async () => {
      repository.findByEmail.mockResolvedValue(storedUser());
      repository.createAuthToken.mockResolvedValue({ id: "at-2" } as never);

      const service = makeService();
      const result = await service.resendVerification("ahmed@example.com");

      expect(repository.createAuthToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          purpose: "EMAIL_VERIFICATION",
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
        }),
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        "ahmed@example.com",
        expect.stringContaining("/verify-email?token="),
        "Ahmed Raza",
      );
      expect(result.message).toContain("verification email is on its way");
    });

    it("should return the generic message for an unknown email without minting a token", async () => {
      repository.findByEmail.mockResolvedValue(null);

      const service = makeService();
      const result = await service.resendVerification("nobody@example.com");

      expect(result.message).toContain("verification email is on its way");
      expect(repository.createAuthToken).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("should return the generic message for an already-verified account without minting a token", async () => {
      repository.findByEmail.mockResolvedValue(storedUser({ emailVerifiedAt: new Date() }));

      const service = makeService();
      const result = await service.resendVerification("ahmed@example.com");

      expect(result.message).toContain("verification email is on its way");
      expect(repository.createAuthToken).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("should succeed even when the email cannot be sent", async () => {
      repository.findByEmail.mockResolvedValue(storedUser());
      emailService.sendVerificationEmail.mockRejectedValue(new Error("smtp down"));

      const service = makeService();
      const result = await service.resendVerification("ahmed@example.com");

      expect(result.message).toContain("verification email is on its way");
    });
  });

  describe("requestPasswordReset", () => {
    it("should mint a fresh reset token and email it for a known account", async () => {
      repository.findByEmail.mockResolvedValue(storedUser());
      repository.createAuthToken.mockResolvedValue({ id: "at-2" } as never);

      const service = makeService();
      const result = await service.requestPasswordReset("ahmed@example.com");

      expect(repository.createAuthToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          purpose: "PASSWORD_RESET",
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          expiresAt: expect.any(Date),
        }),
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        "ahmed@example.com",
        expect.stringContaining("/reset-password?token="),
        "Ahmed Raza",
      );
      expect(result.message).toContain("password reset email is on its way");
    });

    it("should return the generic message for an unknown email without minting a token", async () => {
      repository.findByEmail.mockResolvedValue(null);

      const service = makeService();
      const result = await service.requestPasswordReset("nobody@example.com");

      expect(result.message).toContain("password reset email is on its way");
      expect(repository.createAuthToken).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("should succeed even when the email cannot be sent", async () => {
      repository.findByEmail.mockResolvedValue(storedUser());
      emailService.sendPasswordResetEmail.mockRejectedValue(new Error("smtp down"));

      const service = makeService();
      const result = await service.requestPasswordReset("ahmed@example.com");

      expect(result.message).toContain("password reset email is on its way");
    });
  });

  describe("resetUserPassword", () => {
    it("should consume the token, update the password hash, and revoke sessions", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(
        authTokenRecord({ purpose: "PASSWORD_RESET" }),
      );
      repository.consumePasswordResetTokenAndUpdatePassword.mockResolvedValue({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });

      const service = makeService();
      const result = await service.resetUserPassword({
        token: "the-raw-token",
        newPassword: "a-new-password",
      });

      expect(repository.consumePasswordResetTokenAndUpdatePassword).toHaveBeenCalledWith(
        "at-1",
        "user-1",
        expect.any(String),
        expect.any(Date),
      );
      const hashArg = repository.consumePasswordResetTokenAndUpdatePassword.mock.calls[0]?.[2];
      expect(hashArg).not.toBe("a-new-password");
      expect(result).toEqual({ message: expect.any(String) });
    });

    it("should throw UNAUTHORIZED when the token is unknown", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(null);

      const service = makeService();
      await expect(
        service.resetUserPassword({ token: "unknown", newPassword: "a-new-password" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.RESET_TOKEN_INVALID,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
      expect(repository.consumePasswordResetTokenAndUpdatePassword).not.toHaveBeenCalled();
    });

    it("should throw UNAUTHORIZED when the token belongs to another purpose", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(authTokenRecord());

      const service = makeService();
      await expect(
        service.resetUserPassword({ token: "verification-token", newPassword: "a-new-password" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.RESET_TOKEN_INVALID,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });

    it("should throw UNAUTHORIZED when the token is expired", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(
        authTokenRecord({ purpose: "PASSWORD_RESET", expiresAt: new Date(Date.now() - 1000) }),
      );

      const service = makeService();
      await expect(
        service.resetUserPassword({ token: "expired", newPassword: "a-new-password" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.RESET_TOKEN_EXPIRED,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });

    it("should throw UNAUTHORIZED when the token was already used", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(
        authTokenRecord({ purpose: "PASSWORD_RESET", consumedAt: new Date() }),
      );

      const service = makeService();
      await expect(
        service.resetUserPassword({ token: "used", newPassword: "a-new-password" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.RESET_TOKEN_USED,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });

    it("should throw UNAUTHORIZED when the token was consumed concurrently", async () => {
      repository.findAuthTokenByHash.mockResolvedValue(
        authTokenRecord({ purpose: "PASSWORD_RESET" }),
      );
      repository.consumePasswordResetTokenAndUpdatePassword.mockResolvedValue(null);

      const service = makeService();
      await expect(
        service.resetUserPassword({ token: "race", newPassword: "a-new-password" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.RESET_TOKEN_USED,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });
  });
});