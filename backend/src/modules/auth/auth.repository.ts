import type { Prisma, RefreshToken, User } from "@prisma/client";
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

function toAuthUser(user: User): AuthUser {
  return { id: user.id, name: user.name, email: user.email };
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
  rotateRefreshToken(oldId: string, data: CreateRefreshTokenData): Promise<RefreshToken | null> {
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
}
