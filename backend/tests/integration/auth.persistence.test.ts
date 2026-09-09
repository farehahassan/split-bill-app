import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "../../src/db/prisma.js";
import { APP_ERRORS } from "../../src/constants/app-errors.js";
import { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import {
  generateAuthToken,
  hashAuthToken,
} from "../../src/modules/auth/auth-token.util.js";
import {
  generateRefreshToken,
  hashRefreshToken,
} from "../../src/modules/auth/refresh-token.util.js";
import { createTestUser, uniqueEmail } from "./helpers/fixtures.js";

const repository = new AuthRepository();
const service = new AuthService(repository);

const REGISTER_PASSWORD = "correct-horse-battery";

describe("auth persistence (PostgreSQL)", () => {
  it("register atomically persists the user, a hashed refresh token, and a verification token", async () => {
    const email = uniqueEmail();
    const result = await service.register({
      name: "Ada",
      email,
      password: REGISTER_PASSWORD,
    });

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.id).toBe(result.user.id);
    expect(user!.email).toBe(email);
    expect(user!.emailVerifiedAt).toBeNull();
    // Only the digest may be stored, never the plaintext password.
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user!.passwordHash).not.toBe(REGISTER_PASSWORD);

    // Refresh token persisted as SHA-256 hash, with a future expiry.
    const refreshTokens = await prisma.refreshToken.findMany({ where: { userId: user!.id } });
    expect(refreshTokens).toHaveLength(1);
    expect(refreshTokens[0]!.tokenHash).toBe(hashRefreshToken(result.refreshToken));
    expect(refreshTokens[0]!.tokenHash).not.toBe(result.refreshToken);
    expect(refreshTokens[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(refreshTokens[0]!.revokedAt).toBeNull();

    // Email-verification token persisted for the same user.
    const authTokens = await prisma.authToken.findMany({ where: { userId: user!.id } });
    expect(authTokens).toHaveLength(1);
    expect(authTokens[0]!.purpose).toBe("EMAIL_VERIFICATION");
    expect(authTokens[0]!.consumedAt).toBeNull();
  });

  it("rejects a second register with the same email without leaving orphan rows", async () => {
    const email = uniqueEmail();
    const first = await service.register({ name: "Ada", email, password: REGISTER_PASSWORD });

    await expect(
      service.register({ name: "Ada Clone", email, password: REGISTER_PASSWORD }),
    ).rejects.toMatchObject({ code: APP_ERRORS.EMAIL_IN_USE });

    const users = await prisma.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    expect((await prisma.refreshToken.count({ where: { userId: first.user.id } }))).toBe(1);
    expect((await prisma.authToken.count({ where: { userId: first.user.id } }))).toBe(1);
  });

  it("login verifies the bcrypt password against the persisted hash and issues a session", async () => {
    const email = uniqueEmail();
    await service.register({ name: "Ada", email, password: REGISTER_PASSWORD });
    const loggedIn = await service.login({ email, password: REGISTER_PASSWORD });
    expect(loggedIn.user.email).toBe(email);

    const wrongPassword = service.login({ email, password: "definitely-wrong" });
    await expect(wrongPassword).rejects.toMatchObject({ code: APP_ERRORS.INVALID_CREDENTIALS });
  });

  it("refresh rotates the session: the old token is revoked, the new one is stored hashed", async () => {
    const { user, refreshToken } = await service.register({
      name: "Ada",
      email: uniqueEmail(),
      password: REGISTER_PASSWORD,
    });
    const oldRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
    });
    expect(oldRecord).not.toBeNull();

    const rotated = await service.refresh(refreshToken);
    const newRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rotated.refreshToken) },
    });
    expect(newRecord).not.toBeNull();
    expect(newRecord!.id).not.toBe(oldRecord!.id);

    // The old token is revoked and cannot be used again.
    const refreshedOld = await prisma.refreshToken.findUnique({ where: { id: oldRecord!.id } });
    expect(refreshedOld!.revokedAt).not.toBeNull();
    await expect(service.refresh(refreshToken)).rejects.toMatchObject({
      code: APP_ERRORS.REFRESH_TOKEN_INVALID,
    });

    // The new token still works.
    const third = await service.refresh(rotated.refreshToken);
    expect(third.user.id).toBe(user.id);
  });

  it("rejects an expired refresh token even though it is still stored", async () => {
    const user = await createTestUser({ email: uniqueEmail() });
    const rawToken = generateRefreshToken();
    await repository.createRefreshToken({
      userId: user.id,
      tokenHash: hashRefreshToken(rawToken),
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(service.refresh(rawToken)).rejects.toMatchObject({
      code: APP_ERRORS.REFRESH_TOKEN_INVALID,
    });
  });

  it("verify-email marks the user verified and makes the token single-use", async () => {
    const user = await createTestUser({ email: uniqueEmail() });
    const rawToken = generateAuthToken();
    await repository.createAuthToken({
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: hashAuthToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const result = await service.verifyEmailAddress(rawToken);
    expect(result.message).toContain("verified");

    const verified = await prisma.user.findUnique({ where: { id: user.id } });
    expect(verified!.emailVerifiedAt).not.toBeNull();

    const token = await prisma.authToken.findUnique({
      where: { tokenHash: hashAuthToken(rawToken) },
    });
    expect(token!.consumedAt).not.toBeNull();

    await expect(service.verifyEmailAddress(rawToken)).rejects.toMatchObject({
      code: APP_ERRORS.VERIFICATION_TOKEN_USED,
    });
  });

  it("re-issuing a verification token replaces the previous one atomically", async () => {
    const user = await createTestUser({ email: uniqueEmail() });
    const firstToken = generateAuthToken();
    const secondToken = generateAuthToken();
    await repository.createAuthToken({
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: hashAuthToken(firstToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await repository.createAuthToken({
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: hashAuthToken(secondToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // Only the newest token exists; the old one was deleted in the same write.
    const tokens = await prisma.authToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.tokenHash).toBe(hashAuthToken(secondToken));

    await expect(service.verifyEmailAddress(firstToken)).rejects.toMatchObject({
      code: APP_ERRORS.VERIFICATION_TOKEN_INVALID,
    });
    await service.verifyEmailAddress(secondToken);
  });

  it("password reset replaces the password hash and revokes every active session", async () => {
    const { user, refreshToken } = await service.register({
      name: "Ada",
      email: uniqueEmail(),
      password: REGISTER_PASSWORD,
    });
    const session = await service.login({ email: user.email, password: REGISTER_PASSWORD });

    const resetToken = generateAuthToken();
    await repository.createAuthToken({
      userId: user.id,
      purpose: "PASSWORD_RESET",
      tokenHash: hashAuthToken(resetToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const result = await service.resetUserPassword({ token: resetToken, newPassword: "new-pass-9" });
    expect(result.message).toContain("reset");

    // The reset token is consumed and the password hash has changed.
    const resetRecord = await prisma.authToken.findUnique({
      where: { tokenHash: hashAuthToken(resetToken) },
    });
    expect(resetRecord!.consumedAt).not.toBeNull();

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const oldHash = updatedUser!.passwordHash;
    expect(await bcrypt.compare("new-pass-9", oldHash!)).toBe(true);

    // The refused reset token cannot be reused.
    await expect(
      service.resetUserPassword({ token: resetToken, newPassword: "another-pass-1" }),
    ).rejects.toMatchObject({ code: APP_ERRORS.RESET_TOKEN_USED });

    // Every refresh-token session (register + login) is revoked.
    const sessions = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(sessions.length).toBeGreaterThan(0);
    for (const sessionToken of [refreshToken, session.refreshToken]) {
      expect(
        (await prisma.refreshToken.findUnique({
          where: { tokenHash: hashRefreshToken(sessionToken) },
        }))!.revokedAt,
      ).not.toBeNull();
    }

    // Old password no longer works; the new one does.
    await expect(service.login({ email: user.email, password: REGISTER_PASSWORD })).rejects.toMatchObject(
      { code: APP_ERRORS.INVALID_CREDENTIALS },
    );
    await service.login({ email: user.email, password: "new-pass-9" });
  });

  it("persists invitations via PostgreSQL unique constraints (email)", async () => {
    // DB-level integrity: the unique email index rejects a raw duplicate write,
    // independent of the service-level pre-check.
    const email = uniqueEmail();
    const user = await createTestUser({ email });
    await expect(
      prisma.user.create({ data: { name: "Dup", email } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((await prisma.user.findMany({ where: { email } }))).toHaveLength(1);
    expect(user.id).toBeTruthy();
  });
});