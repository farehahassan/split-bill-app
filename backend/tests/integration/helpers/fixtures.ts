import { randomUUID } from "node:crypto";

import type { Group, Settlement, User } from "@prisma/client";

import { prisma } from "../../../src/db/prisma.js";
import { AuthRepository } from "../../../src/modules/auth/auth.repository.js";
import { AuthService } from "../../../src/modules/auth/auth.service.js";

/**
 * Inserts a fully-formed user row directly through Prisma. Useful for tests
 * that need a user as a prerequisite (group member, payer, ...) without going
 * through the registration flow/bcrypt, but kept deliberately distinct from
 * the auth flows which are unit-tested elsewhere.
 */
export async function createTestUser(overrides: Partial<Pick<User, "name" | "email">> = {}): Promise<User> {
  const unique = randomUUID().replaceAll("-", "").slice(0, 12);
  return prisma.user.create({
    data: {
      name: overrides.name ?? `User ${unique.slice(0, 6)}`,
      email: overrides.email ?? `user-${unique}@example.com`,
    },
  });
}

/**
 * Creates a group owned by `ownerId`. Direct persistence — mirrors what the
 * app itself commits through `createGroupWithOwner` (group + owner membership).
 */
export async function createTestGroup(ownerId: string, overrides: { name?: string } = {}): Promise<Group> {
  const name = overrides.name ?? `Group ${randomUUID().slice(0, 8)}`;
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.create({ data: { name, createdById: ownerId } });
    await tx.groupMember.create({ data: { groupId: group.id, userId: ownerId } });
    return group;
  });
}

/** Adds an arbitrary user to a group via the membership table. */
export async function addTestMember(groupId: string, userId: string): Promise<void> {
  await prisma.groupMember.create({ data: { groupId, userId } });
}

/**
 * Creates a settlement between two existing group members. Returns the created
 * row so balances/idempotency tests can build on real persisted data.
 */
export async function createTestSettlement(input: {
  groupId: string;
  payerId: string;
  payeeId: string;
  amountMinorUnits: bigint;
}): Promise<Settlement> {
  return prisma.settlement.create({
    data: {
      groupId: input.groupId,
      payerId: input.payerId,
      payeeId: input.payeeId,
      amountMinorUnits: input.amountMinorUnits,
      currencyCode: "PKR",
      settledAt: new Date(),
    },
  });
}

/** Returns a fresh email that is unique per call, for registering users. */
export function uniqueEmail(): string {
  return `integration-${randomUUID()}@example.com`;
}

export interface RegisteredTestUser {
  user: { id: string; name: string; email: string };
  token: string;
  refreshToken: string;
}

/**
 * Registers and logs in a real user through the auth service (bcrypt + tokens)
 * and returns the session, for HTTP-layer tests that need valid credentials.
 */
export async function registerAuthenticatedUser(name = "Test User"): Promise<RegisteredTestUser> {
  const service = new AuthService(new AuthRepository());
  const email = uniqueEmail();
  const result = await service.register({ name, email, password: "password-123" });
  return { user: result.user, token: result.token, refreshToken: result.refreshToken };
}