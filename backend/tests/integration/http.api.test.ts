import { describe, expect, it } from "vitest";

import { buildTestApp, testAgent, bearer } from "./helpers/http.js";
import { createTestGroup, createTestUser, registerAuthenticatedUser } from "./helpers/fixtures.js";

const app = buildTestApp();
const api = testAgent(app);

const API = "/api/v1";

interface RegisterResult {
  user: { id: string; name: string; email: string };
  token: string;
  refreshToken: string;
}

async function registerViaHttp(name: string): Promise<RegisterResult> {
  const res = await api
    .post(`${API}/auth/register`)
    .send({ name, email: `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}${Date.now()}@example.test`, password: "password-123" })
    .expect(201);
  return res.body.data as RegisterResult;
}

describe("HTTP API against real PostgreSQL + Redis", () => {
  describe("health", () => {
    it("liveness is always ok", async () => {
      const res = await api.get("/health").expect(200);
      expect(res.body.status).toBe("ok");
    });

    it("readiness reflects the real database connection", async () => {
      const res = await api.get("/health/ready").expect(200);
      expect(res.body.status).toBe("ready");
    });
  });

  describe("auth", () => {
    it("registers, authenticates, and reads the current user", async () => {
      const email = `auth-flow-${Date.now()}@example.test`;
      const res = await api
        .post(`${API}/auth/register`)
        .send({ name: "Auth Flow", email, password: "password-123" })
        .expect(201);

      const data = res.body.data;
      expect(data.user.email).toBe(email);
      expect(data.token).toBeDefined();
      expect(data.refreshToken).toBeDefined();

      // The password is persisted as a hash, never in the clear.
      const { prisma } = await import("../../src/db/prisma.js");
      const row = await prisma.user.findUnique({ where: { id: data.user.id } });
      expect(row!.passwordHash).not.toBe("password-123");

      const me = await api.get(`${API}/auth/me`).set("Authorization", bearer(data.token)).expect(200);
      expect(me.body.data.user.email).toBe(email);

      // Protected routes reject missing credentials.
      await api.get(`${API}/auth/me`).expect(401);
    });

    it("rejects bad credentials with 401", async () => {
      const { user: { email } } = await registerViaHttp("Bad Creds");
      const res = await api
        .post(`${API}/auth/login`)
        .send({ email, password: "wrong-password" })
        .expect(401);
      expect(res.body.success).toBe(false);
    });

    it("rotates refresh tokens atomically and invalidates replayed tokens", async () => {
      const account = await registerViaHttp("Refresh Rotation");

      const refreshed = await api
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: account.refreshToken })
        .expect(200);
      const next = refreshed.body.data;
      expect(next.token).toBeDefined();
      expect(next.refreshToken).not.toBe(account.refreshToken);
      expect(next.user.email).toBe(account.user.email);

      // The new access token works...
      await api.get(`${API}/auth/me`).set("Authorization", bearer(next.token)).expect(200);

      // ...while the rotated-away refresh token no longer authenticates.
      await api
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: account.refreshToken })
        .expect(401);
    });

    it("verifies an email address with its single-use token over HTTP", async () => {
      const account = await registerViaHttp("Verification");
      const { prisma } = await import("../../src/db/prisma.js");
      const { generateAuthToken, hashAuthToken } = await import(
        "../../src/modules/auth/auth-token.util.js"
      );

      // Mint the token exactly like the email flow does, then present the raw
      // value to the endpoint (the DB only ever stores the hash).
      // Register already mints an EMAIL_VERIFICATION token; replace it so the
      // single-use verification proves out against OUR freshly minted token.
      await prisma.authToken.deleteMany({
        where: { userId: account.user.id, purpose: "EMAIL_VERIFICATION" },
      });
      const rawToken = generateAuthToken();
      await prisma.authToken.create({
        data: {
          userId: account.user.id,
          purpose: "EMAIL_VERIFICATION",
          tokenHash: hashAuthToken(rawToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      const verified = await api
        .post(`${API}/auth/verify-email`)
        .send({ token: rawToken })
        .expect(200);
      expect(verified.body.data.message).toContain("verified");

      // The single-use token cannot be redeemed twice.
      const replay = await api
        .post(`${API}/auth/verify-email`)
        .send({ token: rawToken });
      expect(replay.status).toBeGreaterThanOrEqual(400);
      expect(replay.body.success).toBe(false);

      const row = await prisma.authToken.findUnique({
        where: { tokenHash: hashAuthToken(rawToken) },
      });
      expect(row!.consumedAt).not.toBeNull();
    });
  });

  describe("groups", () => {
    it("creates, lists, reads, updates, and removes members via the API", async () => {
      const me = await registerViaHttp("Group Owner");
      const friend = await registerAuthenticatedUser("Group Friend");
      const header = { Authorization: bearer(me.token) };

      const created = await api
        .post(`${API}/groups`)
        .set(header)
        .send({ name: "Trip to the North" })
        .expect(201);
      const groupId = created.body.data.group.id;
      expect(created.body.data.group.name).toBe("Trip to the North");

      const groups = await api.get(`${API}/groups`).set(header).expect(200);
      expect(groups.body.data.groups.map((g: { id: string }) => g.id)).toContain(groupId);

      const detail = await api.get(`${API}/groups/${groupId}`).set(header).expect(200);
      expect(detail.body.data.group.members.map((m: { id: string }) => m.id)).toContain(me.user.id);

      const added = await api
        .post(`${API}/groups/${groupId}/members`)
        .set(header)
        .send({ userId: friend.user.id })
        .expect(201);
      expect(added.body.data.member.userId).toBe(friend.user.id);

      // The new member can see the group too.
      const friendDetail = await api
        .get(`${API}/groups/${groupId}`)
        .set("Authorization", bearer(friend.token))
        .expect(200);
      expect(friendDetail.body.data.group.members).toHaveLength(2);

      // Removing the member strips their access.
      await api
        .delete(`${API}/groups/${groupId}/members/${friend.user.id}`)
        .set(header)
        .expect(204);
      const denied = await api
        .get(`${API}/groups/${groupId}`)
        .set("Authorization", bearer(friend.token));
      expect([401, 403, 404]).toContain(denied.status);
    });

    it("renames a group and deletes it through the API", async () => {
      const me = await registerViaHttp("Group Lifecycle");
      const header = { Authorization: bearer(me.token) };

      const created = await api
        .post(`${API}/groups`)
        .set(header)
        .send({ name: "Before" })
        .expect(201);
      const groupId = created.body.data.group.id;

      const updated = await api
        .put(`${API}/groups/${groupId}`)
        .set(header)
        .send({ name: "After" })
        .expect(200);
      expect(updated.body.data.group.name).toBe("After");

      await api.delete(`${API}/groups/${groupId}`).set(header).expect(204);
      await api.get(`${API}/groups/${groupId}`).set(header).expect(404);
    });

    it("applies request validation to group bodies", async () => {
      const me = await registerViaHttp("Validation Owner");
      const res = await api
        .post(`${API}/groups`)
        .set("Authorization", bearer(me.token))
        .send({})
        .expect(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe("expenses", () => {
    it("creates, lists, updates, and deletes an expense through the API", async () => {
      const me = await registerViaHttp("Expense Owner");
      const friend = await createTestUser();
      const header = { Authorization: bearer(me.token) };
      const group = await createTestGroup(me.user.id);

      await api
        .post(`${API}/groups/${group.id}/members`)
        .set(header)
        .send({ userId: friend.id })
        .expect(201);

      const created = await api
        .post(`${API}/groups/${group.id}/expenses`)
        .set(header)
        .send({
          description: "Groceries",
          amountMinorUnits: 6000,
          payerId: me.user.id,
          splitType: "EQUAL",
          participants: [{ userId: me.user.id }, { userId: friend.id }],
        })
        .expect(201);
      const expenseId = created.body.data.expense.id;
      expect(created.body.data.expense.amountMinorUnits).toBe(6000);
      expect(created.body.data.expense.splits).toHaveLength(2);

      const listed = await api
        .get(`${API}/groups/${group.id}/expenses`)
        .set(header)
        .expect(200);
      expect(listed.body.data.expenses.map((e: { id: string }) => e.id)).toContain(expenseId);

      const fetched = await api
        .get(`${API}/expenses/${expenseId}`)
        .set(header)
        .expect(200);
      expect(fetched.body.data.expense.description).toBe("Groceries");

      // PATCH replaces the splits to match the new amount.
      const patched = await api
        .patch(`${API}/expenses/${expenseId}`)
        .set(header)
        .send({
          description: "Groceries (split)",
          amountMinorUnits: 3000,
          participants: [{ userId: me.user.id }, { userId: friend.id }],
        })
        .expect(200);
      expect(patched.body.data.expense.amountMinorUnits).toBe(3000);
      expect(patched.body.data.expense.splits).toHaveLength(2);

      await api.delete(`${API}/expenses/${expenseId}`).set(header).expect(204);
      await api.get(`${API}/expenses/${expenseId}`).set(header).expect(404);
    });

    it("rejects invalid amounts with a validation error", async () => {
      const me = await registerViaHttp("Expense Validation");
      const group = await createTestGroup(me.user.id);
      const res = await api
        .post(`${API}/groups/${group.id}/expenses`)
        .set("Authorization", bearer(me.token))
        .send({
          description: "Broken",
          amountMinorUnits: -5,
          payerId: me.user.id,
          splitType: "EQUAL",
          participants: [{ userId: me.user.id }],
        })
        .expect(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe("settlements", () => {
    it("creates a settlement idempotently and replays return the same result", async () => {
      const me = await registerViaHttp("Settlement Owner");
      const friend = await createTestUser();
      const header = { Authorization: bearer(me.token) };
      const group = await createTestGroup(me.user.id);

      await api
        .post(`${API}/groups/${group.id}/members`)
        .set(header)
        .send({ userId: friend.id })
        .expect(201);

      await api
        .post(`${API}/groups/${group.id}/expenses`)
        .set(header)
        .send({
          description: "Shared dinner",
          amountMinorUnits: 6000,
          payerId: me.user.id,
          splitType: "EQUAL",
          participants: [{ userId: me.user.id }, { userId: friend.id }],
        })
        .expect(201);

      const key = "http-api-key-0001";
      const body = { payerId: friend.id, payeeId: me.user.id, amountMinorUnits: 1500 };

      const first = await api
        .post(`${API}/groups/${group.id}/settlements`)
        .set(header)
        .set("Idempotency-Key", key)
        .send(body)
        .expect(201);
      const settlementId = first.body.data.settlement.id;

      // Sequential retry after a network hiccup: the controller answers 201
      // (POST semantics) but returns the ORIGINAL settlement, no duplicate.
      const replay = await api
        .post(`${API}/groups/${group.id}/settlements`)
        .set(header)
        .set("Idempotency-Key", key)
        .send(body)
        .expect(201);
      expect(replay.body.data.settlement.id).toBe(settlementId);

      // Reusing the key for a different amount is a conflict.
      await api
        .post(`${API}/groups/${group.id}/settlements`)
        .set(header)
        .set("Idempotency-Key", key)
        .send({ ...body, amountMinorUnits: 5000 })
        .expect(409);

      const { prisma } = await import("../../src/db/prisma.js");
      expect((await prisma.settlement.count({ where: { groupId: group.id } }))).toBe(1);
    });

    it("requires a well-formed Idempotency-Key header", async () => {
      const me = await registerViaHttp("Key Validation");
      const group = await createTestGroup(me.user.id);
      const header = { Authorization: bearer(me.token) } as Record<string, string>;
      const body = { payerId: me.user.id, payeeId: me.user.id, amountMinorUnits: 1 };

      // Intentionally malformed: payer === payee is also invalid, but the header
      // logic runs first, so this must fail with the header message.
      const missing = await api
        .post(`${API}/groups/${group.id}/settlements`)
        .set(header)
        .send(body)
        .expect(400);
      expect(missing.body.message).toContain("Idempotency-Key header is required");

      const short = await api
        .post(`${API}/groups/${group.id}/settlements`)
        .set(header)
        .set("Idempotency-Key", "tiny")
        .send(body)
        .expect(400);
      expect(short.body.message).toContain("Idempotency-Key");
    });

    it("exposes balances and settlement details over HTTP", async () => {
      const me = await registerViaHttp("Balances Owner");
      const friend = await createTestUser();
      const header = { Authorization: bearer(me.token) };
      const group = await createTestGroup(me.user.id);

      await api
        .post(`${API}/groups/${group.id}/members`)
        .set(header)
        .send({ userId: friend.id })
        .expect(201);

      await api
        .post(`${API}/groups/${group.id}/expenses`)
        .set(header)
        .send({
          description: "Uber",
          amountMinorUnits: 6000,
          payerId: me.user.id,
          splitType: "EQUAL",
          participants: [{ userId: me.user.id }, { userId: friend.id }],
        })
        .expect(201);

      const settled = await api
        .post(`${API}/groups/${group.id}/settlements`)
        .set(header)
        .set("Idempotency-Key", "http-api-key-0002")
        .send({ payerId: friend.id, payeeId: me.user.id, amountMinorUnits: 1500 })
        .expect(201);

      const balances = await api
        .get(`${API}/groups/${group.id}/balances`)
        .set(header)
        .expect(200);
      const byUser = new Map(
        balances.body.data.balances.map((b: { userId: string; amountMinorUnits: number }) => [
          b.userId,
          b.amountMinorUnits,
        ]),
      );
      // Owner: +6000 (expense) - 3000 (equal split) - 1500 (payee on settlement) = +1500.
      expect(byUser.get(me.user.id)).toBe(1500);
      // Friend: -3000 (split) + 1500 (payer on settlement) = -1500.
      expect(byUser.get(friend.id)).toBe(-1500);

      const detail = await api
        .get(`${API}/settlements/${settled.body.data.settlement.id}`)
        .set(header)
        .expect(200);
      expect(detail.body.data.settlement.amountMinorUnits).toBe(1500);
      expect(detail.body.data.settlement.payer.id).toBe(friend.id);
    });
  });
});