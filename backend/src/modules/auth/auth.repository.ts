import type { AuthToken, AuthTokenPurpose, Prisma, RefreshToken, User } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface CreateRefreshTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  user: AuthUser;
}

export interface AuthTokenRecord {
  id: string;
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface CreateAuthTokenData {
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
}

export interface CreateUserWithAuthData {
  name: string;
  email: string;
  passwordHash: string;
  refreshTokenHash: string;
  refreshTokenExpiresAt: Date;
  verificationTokenHash: string;
  verificationTokenExpiresAt: Date;
}

function toAuthUser(user: User): AuthUser {
  return { id: user.id, name: user.name, email: user.email };
}

function toAuthToken(record: AuthToken): AuthTokenRecord {
  return {
    id: record.id,
    userId: record.userId,
    purpose: record.purpose,
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt,
    consumedAt: record.consumedAt,
    createdAt: record.createdAt,
  };
}

const refreshTokenInclude = {
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.RefreshTokenInclude;

export class AuthRepository {
  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async create(data: CreateUserData): Promise<AuthUser> {
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
      },
    });
    return toAuthUser(user);
  }

  /**
   * Updates the user's public profile fields. Returns `null` instead of
   * throwing when the user no longer exists, so the service can produce a
   * `USER_NOT_FOUND` error without leaking a Prisma failure code.
   */
  async update(id: string, data: { name?: string; email?: string }): Promise<AuthUser | null> {
    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return null;
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
      },
    });
    return toAuthUser(user);
  }

  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: refreshTokenInclude,
    });
  }

  async createRefreshToken(data: CreateRefreshTokenData): Promise<void> {
    await prisma.refreshToken.create({ data });
  }

  /**
   * Revokes a specific refresh-token session. The `revokedAt: null` guard makes
   * the operation idempotent and prevents re-revoking an already-rotated token.
   */
  revokeRefreshTokenById(id: string): Promise<{ count: number }> {
    return prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Rotates a refresh token atomically: revokes the old session (guarded by
   * `revokedAt: null`, so a concurrent/late replay cannot win) and persists the
   * replacement in the same transaction. Returns the new record, or `null` when
   * the old token was already revoked.
   */
  rotateRefreshToken(
    oldId: string,
    data: CreateRefreshTokenData,
  ): Promise<RefreshToken | null> {
    return prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: oldId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 0) {
        return null;
      }
      return tx.refreshToken.create({ data });
    });
  }

  /**
   * Creates the user and its initial session credentials in a single
   * transaction: user record, refresh token, and the email-verification token
   * are all committed together or not at all.
   */
  async createUserWithAuthData(data: CreateUserWithAuthData): Promise<AuthUser> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: data.passwordHash,
        },
      });

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: data.refreshTokenHash,
          expiresAt: data.refreshTokenExpiresAt,
        },
      });

      await tx.authToken.create({
        data: {
          userId: user.id,
          purpose: "EMAIL_VERIFICATION",
          tokenHash: data.verificationTokenHash,
          expiresAt: data.verificationTokenExpiresAt,
        },
      });

      return toAuthUser(user);
    });
  }

  /**
   * Creates a fresh auth token for a user/purpose. Any previous token for the
   * same pair is deleted first, atomically, so re-issued links stop working and
   * the `@@unique([userId, purpose])` constraint can never be violated by a
   * consumed row.
   */
  async createAuthToken(data: CreateAuthTokenData): Promise<AuthTokenRecord> {
    return prisma.$transaction(async (tx) => {
      await tx.authToken.deleteMany({
        where: { userId: data.userId, purpose: data.purpose },
      });
      const created = await tx.authToken.create({ data });
      return toAuthToken(created);
    });
  }

  async findAuthTokenByHash(tokenHash: string): Promise<AuthTokenRecord | null> {
    const record = await prisma.authToken.findUnique({ where: { tokenHash } });
    return record ? toAuthToken(record) : null;
  }

  /**
   * Consumes a verification token and marks the user's email as verified in the
   * same transaction. Returns the verified user, or `null` when the token was
   * already consumed (the token cannot be used twice).
   */
  async consumeVerificationTokenAndVerifyUser(
    tokenId: string,
    userId: string,
    now: Date,
  ): Promise<AuthUser | null> {
    return prisma.$transaction(async (tx) => {
      const consumed = await tx.authToken.updateMany({
        where: { id: tokenId, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count === 0) {
        return null;
      }
      const user = await tx.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: now },
      });
      return toAuthUser(user);
    });
  }

  /**
   * Consumes a password-recovery token, replaces the password hash, and revokes
   * every active refresh-token session for the user — atomically, so a leaked
   * recovery link can never be replayed and all existing sessions end with the
   * password change. Returns the updated user, or `null` when the token was
   * already consumed.
   */
  async consumePasswordResetTokenAndUpdatePassword(
    tokenId: string,
    userId: string,
    passwordHash: string,
    now: Date,
  ): Promise<AuthUser | null> {
    return prisma.$transaction(async (tx) => {
      const consumed = await tx.authToken.updateMany({
        where: { id: tokenId, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count === 0) {
        return null;
      }
      const userUpdated = await tx.user.updateMany({
        where: { id: userId },
        data: { passwordHash },
      });
      if (userUpdated.count === 0) {
        return null;
      }
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      return toAuthUser(user);
    });
  }
}
