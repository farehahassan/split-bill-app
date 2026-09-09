import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/prisma.js", async () => {
  return {
    prisma: {
      $transaction: vi.fn(),
      user: {
        findUnique: vi.fn(),
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
import { AuthRepository } from "../src/modules/auth/auth.repository.js";
import { hashRefreshToken } from "../src/modules/auth/refresh-token.util.js";

const mockPrisma = vi.mocked(prisma);

const rotatedRecord = {
  id: "rt-2",
  userId: "user-1",
  tokenHash: "b".repeat(64),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  revokedAt: null,
  createdAt: new Date(),
};

function makeTx() {
  return {
    refreshToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue(rotatedRecord),
    },
  };
}

function runTransaction<T>(tx: T) {
  return async (callback: (t: T) => Promise<T>): Promise<T> => callback(tx);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthRepository refresh-token persistence", () => {
  it("looks up refresh tokens by their SHA-256 hash with only safe user fields", async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      tokenHash: "a".repeat(64),
      expiresAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
      user: { id: "user-1", name: "Ahmed Raza", email: "ahmed@example.com" },
    });

    const repository = new AuthRepository();
    const record = await repository.findRefreshTokenByHash(hashRefreshToken("raw-token"));

    expect(mockPrisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken("raw-token") },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    expect(record?.user.passwordHash).toBeUndefined();
  });

  it("persists only the token hash, never the plaintext token", async () => {
    const repository = new AuthRepository();
    const rawToken = "raw-refresh-token";
    await repository.createRefreshToken({
      userId: "user-1",
      tokenHash: hashRefreshToken(rawToken),
      expiresAt: new Date(),
    });

    const stored = mockPrisma.refreshToken.create.mock.calls[0]?.[0].data;
    expect(stored.tokenHash).toBe(hashRefreshToken(rawToken));
    expect(stored.tokenHash).not.toBe(rawToken);
  });

  it("revokes a session idempotently through the revokedAt: null guard", async () => {
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const repository = new AuthRepository();
    await repository.revokeRefreshTokenById("rt-1");

    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "rt-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("AuthRepository refresh-token rotation", () => {
  it("revokes the old session and persists the replacement in one transaction", async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new AuthRepository();
    const result = await repository.rotateRefreshToken("rt-1", {
      userId: "user-1",
      tokenHash: "b".repeat(64),
      expiresAt: new Date(),
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "rt-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        tokenHash: "b".repeat(64),
        expiresAt: expect.any(Date),
      },
    });
    expect(result?.id).toBe("rt-2");
  });

  it("returns null without creating a replacement when the old token was already revoked", async () => {
    const tx = makeTx();
    tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new AuthRepository();
    const result = await repository.rotateRefreshToken("rt-1", {
      userId: "user-1",
      tokenHash: "b".repeat(64),
      expiresAt: new Date(),
    });

    expect(result).toBeNull();
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it("rejects the whole rotation when the replacement write fails", async () => {
    const tx = makeTx();
    tx.refreshToken.create.mockRejectedValue(new Error("db boom"));
    mockPrisma.$transaction.mockImplementation(runTransaction(tx));

    const repository = new AuthRepository();
    await expect(
      repository.rotateRefreshToken("rt-1", {
        userId: "user-1",
        tokenHash: "c".repeat(64),
        expiresAt: new Date(),
      }),
    ).rejects.toThrow("db boom");
  });
});

describe("AuthRepository email-verification / password-recovery persistence", () => {
  function makeAuthTx() {
    return {
      user: {
        create: vi.fn().mockResolvedValue({
          id: "user-1",
          name: "Ahmed Raza",
          email: "ahmed@example.com",
          passwordHash: "hash",
          emailVerifiedAt: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: "user-1",
          name: "Ahmed Raza",
          email: "ahmed@example.com",
          emailVerifiedAt: new Date(),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "user-1",
          name: "Ahmed Raza",
          email: "ahmed@example.com",
        }),
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({ id: "rt-1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      authToken: {
        create: vi.fn().mockResolvedValue({ id: "at-1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  describe("createUserWithAuthData", () => {
    it("creates the user, the refresh token, and the verification token in one transaction", async () => {
      const tx = makeAuthTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      const repository = new AuthRepository();
      const user = await repository.createUserWithAuthData({
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        passwordHash: "hash",
        refreshTokenHash: "a".repeat(64),
        refreshTokenExpiresAt: new Date(),
        verificationTokenHash: "b".repeat(64),
        verificationTokenExpiresAt: new Date(),
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.user.create).toHaveBeenCalledWith({
        data: { name: "Ahmed Raza", email: "ahmed@example.com", passwordHash: "hash" },
      });
      expect(tx.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          tokenHash: "a".repeat(64),
          expiresAt: expect.any(Date),
        },
      });
      expect(tx.authToken.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          purpose: "EMAIL_VERIFICATION",
          tokenHash: "b".repeat(64),
          expiresAt: expect.any(Date),
        },
      });
      expect(user).toEqual({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });
    });
  });

  describe("createAuthToken (reissue)", () => {
    it("deletes the previous token for the same user/purpose before creating the new one", async () => {
      const tx = makeAuthTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      const repository = new AuthRepository();
      await repository.createAuthToken({
        userId: "user-1",
        purpose: "EMAIL_VERIFICATION",
        tokenHash: "c".repeat(64),
        expiresAt: new Date(),
      });

      expect(tx.authToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", purpose: "EMAIL_VERIFICATION" },
      });
      expect(tx.authToken.create).toHaveBeenCalledTimes(1);
      expect(tx.authToken.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          purpose: "EMAIL_VERIFICATION",
          tokenHash: "c".repeat(64),
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe("consumeVerificationTokenAndVerifyUser", () => {
    it("consumes the token and marks the user verified in one transaction", async () => {
      const tx = makeAuthTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));
      const now = new Date();

      const repository = new AuthRepository();
      const user = await repository.consumeVerificationTokenAndVerifyUser("at-1", "user-1", now);

      expect(tx.authToken.updateMany).toHaveBeenCalledWith({
        where: { id: "at-1", consumedAt: null },
        data: { consumedAt: now },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { emailVerifiedAt: now },
      });
      expect(user?.email).toBe("ahmed@example.com");
    });

    it("returns null without touching the user when the token was already consumed", async () => {
      const tx = makeAuthTx();
      tx.authToken.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      const repository = new AuthRepository();
      const user = await repository.consumeVerificationTokenAndVerifyUser(
        "at-1",
        "user-1",
        new Date(),
      );

      expect(user).toBeNull();
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });

  describe("consumePasswordResetTokenAndUpdatePassword", () => {
    it("consumes the token, replaces the password, and revokes all sessions in one transaction", async () => {
      const tx = makeAuthTx();
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));
      const now = new Date();

      const repository = new AuthRepository();
      const user = await repository.consumePasswordResetTokenAndUpdatePassword(
        "at-1",
        "user-1",
        "new-hash",
        now,
      );

      expect(tx.authToken.updateMany).toHaveBeenCalledWith({
        where: { id: "at-1", consumedAt: null },
        data: { consumedAt: now },
      });
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { passwordHash: "new-hash" },
      });
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", revokedAt: null },
        data: { revokedAt: now },
      });
      expect(tx.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "user-1" } });
      expect(user?.email).toBe("ahmed@example.com");
    });

    it("returns null without revoking sessions when the token was already consumed", async () => {
      const tx = makeAuthTx();
      tx.authToken.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      const repository = new AuthRepository();
      const user = await repository.consumePasswordResetTokenAndUpdatePassword(
        "at-1",
        "user-1",
        "new-hash",
        new Date(),
      );

      expect(user).toBeNull();
      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("returns null without revoking sessions when the user no longer exists", async () => {
      const tx = makeAuthTx();
      tx.user.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.$transaction.mockImplementation(runTransaction(tx));

      const repository = new AuthRepository();
      const user = await repository.consumePasswordResetTokenAndUpdatePassword(
        "at-1",
        "user-1",
        "new-hash",
        new Date(),
      );

      expect(user).toBeNull();
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("findAuthTokenByHash", () => {
    it("returns the token record for a matching hash", async () => {
      mockPrisma.authToken.findUnique.mockResolvedValue({
        id: "at-1",
        userId: "user-1",
        purpose: "EMAIL_VERIFICATION",
        tokenHash: "a".repeat(64),
        expiresAt: new Date(),
        consumedAt: null,
        createdAt: new Date(),
      });

      const repository = new AuthRepository();
      const record = await repository.findAuthTokenByHash("a".repeat(64));

      expect(mockPrisma.authToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: "a".repeat(64) },
      });
      expect(record?.purpose).toBe("EMAIL_VERIFICATION");
      expect(record?.consumedAt).toBeNull();
    });

    it("returns null for a hash without a stored token", async () => {
      mockPrisma.authToken.findUnique.mockResolvedValue(null);

      const repository = new AuthRepository();
      const record = await repository.findAuthTokenByHash("z".repeat(64));

      expect(record).toBeNull();
    });
  });
});
