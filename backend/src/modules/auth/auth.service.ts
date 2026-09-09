import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { getEnv } from "../../config/env.js";
import { APP_ERRORS } from "../../constants/app-errors.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../errors/app.error.js";
import { METRIC, metrics } from "../../metrics/registry.js";
import { AuthRepository, type AuthUser } from "./auth.repository.js";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token.util.js";

const BCRYPT_ROUNDS = 12;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type JwtPayload = {
  sub: string;
  email: string;
};

export interface AuthResult {
  user: AuthUser;
  token: string;
  refreshToken: string;
}

export class AuthService {
  constructor(private repository: AuthRepository) {}

  async register(data: { name: string; email: string; password: string }): Promise<AuthResult> {
    const existing = await this.repository.findByEmail(data.email);
    if (existing) {
      throw new ConflictError(
        APP_ERRORS.EMAIL_IN_USE,
        "An account with this email already exists.",
      );
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const user = await this.repository.create({
      name: data.name,
      email: data.email,
      passwordHash,
    });
    const refreshToken = await this.issueRefreshToken(user.id);

    metrics.increment(METRIC.usersRegisteredTotal);

    return { user, token: this.signToken(user), refreshToken };
  }

  async login(data: { email: string; password: string }): Promise<AuthResult> {
    const user = await this.repository.findByEmail(data.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError(APP_ERRORS.INVALID_CREDENTIALS, "Invalid email or password.");
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError(APP_ERRORS.INVALID_CREDENTIALS, "Invalid email or password.");
    }

    const safeUser = { id: user.id, name: user.name, email: user.email };
    const refreshToken = await this.issueRefreshToken(user.id);

    return { user: safeUser, token: this.signToken(user), refreshToken };
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const record = await this.repository.findRefreshTokenByHash(hashRefreshToken(refreshToken));

    if (!record || record.revokedAt !== null || record.expiresAt <= new Date()) {
      throw new UnauthorizedError(
        APP_ERRORS.REFRESH_TOKEN_INVALID,
        "Invalid or expired refresh token.",
      );
    }

    const nextToken = generateRefreshToken();
    const rotated = await this.repository.rotateRefreshToken(record.id, {
      userId: record.userId,
      tokenHash: hashRefreshToken(nextToken),
      expiresAt: this.refreshTokenExpiry(),
    });

    if (!rotated) {
      throw new UnauthorizedError(
        APP_ERRORS.REFRESH_TOKEN_INVALID,
        "Invalid or expired refresh token.",
      );
    }

    return {
      user: record.user,
      token: this.signToken(record.user),
      refreshToken: nextToken,
    };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    const record = await this.repository.findRefreshTokenByHash(hashRefreshToken(refreshToken));

    if (record) {
      await this.repository.revokeRefreshTokenById(record.id);
    }

    return { message: "Signed out successfully." };
  }

  async getMe(userId: string): Promise<AuthUser> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new NotFoundError(APP_ERRORS.USER_NOT_FOUND, "User not found.");
    }
    return { id: user.id, name: user.name, email: user.email };
  }

  async updateCurrentUser(
    userId: string,
    data: { name?: string; email?: string },
  ): Promise<AuthUser> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new NotFoundError(APP_ERRORS.USER_NOT_FOUND, "User not found.");
    }

    if (data.email) {
      const existing = await this.repository.findByEmail(data.email);
      if (existing && existing.id !== userId) {
        throw new ConflictError(
          APP_ERRORS.EMAIL_IN_USE,
          "An account with this email already exists.",
        );
      }
    }

    const updated = await this.repository.update(userId, {
      name: data.name,
      email: data.email,
    });
    if (!updated) {
      throw new NotFoundError(APP_ERRORS.USER_NOT_FOUND, "User not found.");
    }
    return updated;
  }

  verifyToken(token: string): JwtPayload {
    const env = getEnv();
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      return payload;
    } catch (error) {
      const err = error as jwt.JsonWebTokenError;
      if (err.name === "TokenExpiredError") {
        throw new UnauthorizedError(
          APP_ERRORS.TOKEN_EXPIRED,
          "Your session has expired. Please sign in again.",
        );
      }
      throw new UnauthorizedError(APP_ERRORS.TOKEN_INVALID, "Invalid or malformed token.");
    }
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const rawToken = generateRefreshToken();
    await this.repository.createRefreshToken({
      userId,
      tokenHash: hashRefreshToken(rawToken),
      expiresAt: this.refreshTokenExpiry(),
    });
    return rawToken;
  }

  private refreshTokenExpiry(): Date {
    const env = getEnv();
    return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * MS_PER_DAY);
  }

  private signToken(user: Pick<AuthUser, "id" | "email">): string {
    const env = getEnv();
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }
}
