import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";

import { getEnv } from "../../src/config/env.js";
import { buildTestApp, testAgent, bearer } from "./helpers/http.js";
import {
  createTestGroup,
  uniqueEmail,
} from "./helpers/fixtures.js";

const app = buildTestApp();
const api = testAgent(app);

const API = "/api/v1";

interface Session {
  user: { id: string; name: string; email: string };
  token: string;
  refreshToken: string;
}

async function registerViaHttp(): Promise<Session> {
  const res = await api
    .post(`${API}/auth/register`)
    .send({ name: "Security Tester", email: uniqueEmail(), password: "password-123" })
    .expect(201);
  return res.body.data as Session;
}

function expiredToken(sub: string): string {
  return jwt.sign({ sub, email: "me@example.com" }, getEnv().JWT_SECRET, { expiresIn: "-1s" });
}

describe("Security hardening against real PostgreSQL + Redis", () => {
  describe("authentication", () => {
    it("rejects an expired access token with 401", async () => {
      const account = await registerViaHttp();

      const res = await api
        .get(`${API}/auth/me`)
        .set("Authorization", bearer(expiredToken(account.user.id)));

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("expired");
    });

    it("does not reuse a refresh token after logout", async () => {
      const account = await registerViaHttp();

      const loggedOut = await api
        .post(`${API}/auth/logout`)
        .send({ refreshToken: account.refreshToken })
        .expect(200);
      expect(loggedOut.body.success).toBe(true);

      const replay = await api
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: account.refreshToken });

      expect(replay.status).toBe(401);
      expect(replay.body.message).toBe("Invalid or expired refresh token.");
    });

    it("returns an identical message for an unknown email and a wrong password", async () => {
      const account = await registerViaHttp();

      const unknownEmail = await api
        .post(`${API}/auth/login`)
        .send({ email: uniqueEmail(), password: "password-123" })
        .expect(401);
      const wrongPassword = await api
        .post(`${API}/auth/login`)
        .send({ email: account.user.email, password: "not-the-password" })
        .expect(401);

      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
      expect(unknownEmail.body.message).toBe("Invalid email or password.");
    });

    it("never returns password or refresh-token hashes", async () => {
      const account = await registerViaHttp();

      const me = await api
        .get(`${API}/auth/me`)
        .set("Authorization", bearer(account.token))
        .expect(200);

      expect(JSON.stringify(me.body)).not.toContain("passwordHash");
      expect(JSON.stringify(me.body)).not.toContain("password");
      expect(JSON.stringify(me.body)).not.toContain(account.refreshToken);
    });
  });

  describe("authorization", () => {
    it("returns 403 when a user reads another user's group they do not belong to", async () => {
      const owner = await registerViaHttp();
      const stranger = await registerViaHttp();
      const group = await createTestGroup(owner.user.id);

      const res = await api
        .get(`${API}/groups/${group.id}`)
        .set("Authorization", bearer(stranger.token));

      expect(res.status).toBe(403);
    });

    it("returns 404 for a well-formed UUID that does not exist", async () => {
      const account = await registerViaHttp();
      const ghostId = "00000000-0000-4000-8000-000000000099";

      const res = await api.get(`${API}/groups/${ghostId}`).set("Authorization", bearer(account.token));

      expect(res.status).toBe(404);
    });

    it("rejects a malformed UUID with 400 at the HTTP boundary", async () => {
      const account = await registerViaHttp();

      const res = await api
        .get(`${API}/groups/not-a-uuid`)
        .set("Authorization", bearer(account.token));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("privacy of data at rest", () => {
    it("only stores the bcrypt hash of a password", async () => {
      const name = "Hash Check";
      const email = uniqueEmail();
      await api
        .post(`${API}/auth/register`)
        .send({ name, email, password: "password-123" })
        .expect(201);

      const { prisma } = await import("../../src/db/prisma.js");
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(user!.passwordHash).not.toBe("password-123");
    });

    it("clears email verification when the email address changes", async () => {
      const account = await registerViaHttp();

      const { prisma } = await import("../../src/db/prisma.js");
      await prisma.user.update({
        where: { id: account.user.id },
        data: { emailVerifiedAt: new Date() },
      });

      const updated = await api
        .patch(`${API}/auth/me`)
        .set("Authorization", bearer(account.token))
        .send({ email: uniqueEmail() })
        .expect(200);

      expect(updated.body.success).toBe(true);

      const row = await prisma.user.findUnique({ where: { id: account.user.id } });
      expect(row!.emailVerifiedAt).toBeNull();
    });

    it("keeps verification intact when only the name changes", async () => {
      const account = await registerViaHttp();

      const { prisma } = await import("../../src/db/prisma.js");
      const verified = new Date();
      await prisma.user.update({
        where: { id: account.user.id },
        data: { emailVerifiedAt: verified },
      });

      await api
        .patch(`${API}/auth/me`)
        .set("Authorization", bearer(account.token))
        .send({ name: "Renamed" })
        .expect(200);

      const row = await prisma.user.findUnique({ where: { id: account.user.id } });
      expect(row!.emailVerifiedAt?.getTime()).toBe(verified.getTime());
    });
  });
});