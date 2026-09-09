import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { getEnv } from "../../config/env.js";
import { APP_ERRORS } from "../../constants/app-errors.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../errors/app.error.js";
import { METRIC, metrics } from "../../metrics/registry.js";
import { logger } from "../../utils/logger.js";
import { createDefaultEmailService, EmailService } from "../email/email.service.js";
import { generateAuthToken, hashAuthToken } from "./auth-token.util.js";
import { AuthRepository, type AuthUser } from "./auth.repository.js";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token.util.js";

const BCRYPT_ROUNDS = 12;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

// Precomputed 12-round bcrypt hash used only to equalize the response time of
// the "unknown email" branch of the resend/forgot-password endpoints. This is
// not a credential and must never be treated as one.
const DUMMY_COMPARE_HASH =
  "$2b$12$x5qweLqykfv/TYZEjzdcL.CPyTAZX5/0ZwMm7fzxG3QJDlXlSjyMq";

// Both branches of resend-verification and forgot-password return the same
// message so the endpoint never reveals whether an email belongs to an account.
const GENERIC_VERIFICATION_MESSAGE =
  "If that email address belongs to an account, a verification email is on its way.";
const GENERIC_RESET_MESSAGE =
  "If that email address belongs to an account, a password reset email is on its way.";

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
  private readonly emailService: EmailService;

  constructor(
    private repository: AuthRepository,
    emailService: EmailService = createDefaultEmailService(),
  ) {
    this.emailService = emailService;
  }

  async register(data: { name: string; email: string; password: string }): Promise<AuthResult> {
    const existing = await this.repository.findByEmail(data.email);
    if (existing) {
      throw new ConflictError(
        APP_ERRORS.EMAIL_IN_USE,
        "An account with this email already exists.",
      );
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const refreshToken = generateRefreshToken();
    const verificationToken = generateAuthToken();

    const user = await this.repository.createUserWithAuthData({
      name: data.name,
      email: data.email,
      passwordHash,
      refreshTokenHash: hashRefreshToken(refreshToken),
      refreshTokenExpiresAt: this.refreshTokenExpiry(),
      verificationTokenHash: hashAuthToken(verificationToken),
      verificationTokenExpiresAt: this.verificationTokenExpiry(),
    });

    metrics.increment(METRIC.usersRegisteredTotal);
    await this.trySendVerificationEmail(user, verificationToken);

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

    // Changing the email address invalidates the previous verification: the
    // new address must be verified again, so the stored marker is cleared.
    const emailChanged =
      data.email !== undefined && data.email.toLowerCase() !== user.email.toLowerCase();

    const updated = await this.repository.update(userId, {
      name: data.name,
      email: data.email,
      ...(emailChanged ? { emailVerifiedAt: null } : {}),
    });
    if (!updated) {
      throw new NotFoundError(APP_ERRORS.USER_NOT_FOUND, "User not found.");
    }
    return updated;
  }

  async verifyEmailAddress(token: string): Promise<{ message: string }> {
    const record = await this.repository.findAuthTokenByHash(hashAuthToken(token));
    const now = new Date();

    if (!record || record.purpose !== "EMAIL_VERIFICATION") {
      throw new UnauthorizedError(
        APP_ERRORS.VERIFICATION_TOKEN_INVALID,
        "This verification link is invalid.",
      );
    }
    if (record.consumedAt !== null) {
      throw new UnauthorizedError(
        APP_ERRORS.VERIFICATION_TOKEN_USED,
        "This verification link has already been used.",
      );
    }
    if (record.expiresAt <= now) {
      throw new UnauthorizedError(
        APP_ERRORS.VERIFICATION_TOKEN_EXPIRED,
        "This verification link has expired.",
      );
    }

    const verified = await this.repository.consumeVerificationTokenAndVerifyUser(
      record.id,
      record.userId,
      now,
    );
    if (!verified) {
      throw new UnauthorizedError(
        APP_ERRORS.VERIFICATION_TOKEN_USED,
        "This verification link has already been used.",
      );
    }

    return { message: "Email verified successfully." };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.repository.findByEmail(email);

    if (!user) {
      await this.dummyAuthWork();
      return { message: GENERIC_VERIFICATION_MESSAGE };
    }

    if (user.emailVerifiedAt !== null) {
      // Already verified: report the same success message without revealing
      // the account state and without minting a new token.
      return { message: GENERIC_VERIFICATION_MESSAGE };
    }

    const token = generateAuthToken();
    await this.repository.createAuthToken({
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: hashAuthToken(token),
      expiresAt: this.verificationTokenExpiry(),
    });
    await this.trySendVerificationEmail(
      { id: user.id, name: user.name, email: user.email },
      token,
    );

    return { message: GENERIC_VERIFICATION_MESSAGE };
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const user = await this.repository.findByEmail(email);

    if (!user) {
      await this.dummyAuthWork();
      return { message: GENERIC_RESET_MESSAGE };
    }

    const token = generateAuthToken();
    await this.repository.createAuthToken({
      userId: user.id,
      purpose: "PASSWORD_RESET",
      tokenHash: hashAuthToken(token),
      expiresAt: this.passwordResetTokenExpiry(),
    });
    await this.trySendPasswordResetEmail(
      { id: user.id, name: user.name, email: user.email },
      token,
    );

    return { message: GENERIC_RESET_MESSAGE };
  }

  async resetUserPassword(data: {
    token: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const record = await this.repository.findAuthTokenByHash(hashAuthToken(data.token));
    const now = new Date();

    if (!record || record.purpose !== "PASSWORD_RESET") {
      throw new UnauthorizedError(
        APP_ERRORS.RESET_TOKEN_INVALID,
        "This password reset link is invalid.",
      );
    }
    if (record.consumedAt !== null) {
      throw new UnauthorizedError(
        APP_ERRORS.RESET_TOKEN_USED,
        "This password reset link has already been used.",
      );
    }
    if (record.expiresAt <= now) {
      throw new UnauthorizedError(
        APP_ERRORS.RESET_TOKEN_EXPIRED,
        "This password reset link has expired.",
      );
    }

    const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    const updated = await this.repository.consumePasswordResetTokenAndUpdatePassword(
      record.id,
      record.userId,
      passwordHash,
      now,
    );
    if (!updated) {
      throw new UnauthorizedError(
        APP_ERRORS.RESET_TOKEN_USED,
        "This password reset link has already been used.",
      );
    }

    return { message: "Your password has been reset. Please sign in with your new password." };
  }

  verifyToken(token: string): JwtPayload {
    const env = getEnv();
    try {
      // The algorithm is pinned to HS256 so a token signed with a different
      // (e.g. asymmetric) algorithm is rejected outright instead of being
      // interpreted with the symmetric secret as attacker-chosen algorithm.
      const payload = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ["HS256"],
      }) as jwt.JwtPayload;

      // A valid JWT does not imply a meaningful subject: require exactly the
      // shape we sign (string sub + email) so a token with a missing/odd sub
      // can never be confused with an authenticated user.
      if (
        typeof payload.sub !== "string" ||
        payload.sub.length === 0 ||
        typeof payload.email !== "string" ||
        payload.email.length === 0
      ) {
        throw new UnauthorizedError(
          APP_ERRORS.TOKEN_INVALID,
          "Invalid or malformed token.",
        );
      }

      return { sub: payload.sub, email: payload.email };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
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

  private verificationTokenExpiry(): Date {
    const env = getEnv();
    return new Date(Date.now() + env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * MS_PER_MINUTE);
  }

  private passwordResetTokenExpiry(): Date {
    const env = getEnv();
    return new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * MS_PER_MINUTE);
  }

  private signToken(user: Pick<AuthUser, "id" | "email">): string {
    const env = getEnv();
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
      algorithm: "HS256",
    } as jwt.SignOptions);
  }

  /**
   * Sends a verification email on a best-effort basis. A delivery failure must
   * not fail registration: the account is already created and verified-safe
   * (verification is not required to sign in), and the user can resend later.
   */
  private async trySendVerificationEmail(
    user: Pick<AuthUser, "id" | "name" | "email">,
    rawToken: string,
  ): Promise<void> {
    try {
      await this.emailService.sendVerificationEmail(
        user.email,
        this.emailVerificationUrl(rawToken),
        user.name,
      );
    } catch (error) {
      const safeError = error instanceof Error ? error.message : String(error);
      logger.warn("Verification email could not be sent; the user can resend it", {
        userId: user.id,
        error: safeError,
      });
    }
  }

  /**
   * Sends a password-reset email on a best-effort basis. A delivery failure
   * must not leak whether the account exists: the request already returns the
   * generic success message, and the user can request the email again.
   */
  private async trySendPasswordResetEmail(
    user: Pick<AuthUser, "id" | "name" | "email">,
    rawToken: string,
  ): Promise<void> {
    try {
      await this.emailService.sendPasswordResetEmail(
        user.email,
        this.passwordResetUrl(rawToken),
        user.name,
      );
    } catch (error) {
      const safeError = error instanceof Error ? error.message : String(error);
      logger.warn("Password reset email could not be sent; the user can request it again", {
        userId: user.id,
        error: safeError,
      });
    }
  }

  /**
   * Baseline bcrypt cost applied on the "unknown email" branch of the
   * resend/forgot endpoints so both branches spend comparable time before
   * returning the same response. Best-effort only; the dominant variable (SMTP
   * latency) is deliberately not compensated.
   */
  private async dummyAuthWork(): Promise<void> {
    await bcrypt.compare(generateAuthToken(), DUMMY_COMPARE_HASH);
  }

  private emailVerificationUrl(token: string): string {
    return `${this.appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  }

  private passwordResetUrl(token: string): string {
    return `${this.appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  }

  private appBaseUrl(): string {
    return getEnv().APP_BASE_URL.replace(/\/+$/, "");
  }
}