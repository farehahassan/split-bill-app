import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { getEnv } from "../../config/env.js";
import { APP_ERRORS } from "../../constants/app-errors.js";
import { createAppError } from "../../middleware/errorHandler.js";
import { HTTP_STATUSES } from "../../constants/http-statuses.js";
import { AuthRepository, type AuthUser } from "./auth.repository.js";

const BCRYPT_ROUNDS = 12;

type JwtPayload = {
  sub: string;
  email: string;
};

export interface AuthResult {
  user: AuthUser;
  token: string;
}

export class AuthService {
  constructor(private repository: AuthRepository) {}

  async register(data: { name: string; email: string; password: string }): Promise<AuthResult> {
    const existing = await this.repository.findByEmail(data.email);
    if (existing) {
      throw createAppError(
        HTTP_STATUSES.CONFLICT,
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

    return { user, token: this.signToken(user) };
  }

  async login(data: { email: string; password: string }): Promise<AuthResult> {
    const user = await this.repository.findByEmail(data.email);
    if (!user || !user.passwordHash) {
      throw createAppError(
        HTTP_STATUSES.UNAUTHORIZED,
        APP_ERRORS.INVALID_CREDENTIALS,
        "Invalid email or password.",
      );
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      throw createAppError(
        HTTP_STATUSES.UNAUTHORIZED,
        APP_ERRORS.INVALID_CREDENTIALS,
        "Invalid email or password.",
      );
    }

    return {
      user: { id: user.id, name: user.name, email: user.email },
      token: this.signToken(user),
    };
  }

  async getMe(userId: string): Promise<AuthUser> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw createAppError(HTTP_STATUSES.NOT_FOUND, APP_ERRORS.USER_NOT_FOUND, "User not found.");
    }
    return { id: user.id, name: user.name, email: user.email };
  }

  verifyToken(token: string): JwtPayload {
    const env = getEnv();
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      return payload;
    } catch (error) {
      const err = error as jwt.JsonWebTokenError;
      if (err.name === "TokenExpiredError") {
        throw createAppError(
          HTTP_STATUSES.UNAUTHORIZED,
          APP_ERRORS.TOKEN_EXPIRED,
          "Your session has expired. Please sign in again.",
        );
      }
      throw createAppError(
        HTTP_STATUSES.UNAUTHORIZED,
        APP_ERRORS.TOKEN_INVALID,
        "Invalid or malformed token.",
      );
    }
  }

  private signToken(user: Pick<AuthUser, "id" | "email">): string {
    const env = getEnv();
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }
}
