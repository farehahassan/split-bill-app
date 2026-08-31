import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

import { createApp } from "../src/app.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

vi.mock("../src/db/prisma.js", async () => {
  const findUnique = vi.fn();
  const create = vi.fn();

  return {
    prisma: {
      user: {
        findUnique,
        create,
      },
    },
  };
});

import { prisma } from "../src/db/prisma.js";

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockCreate = vi.mocked(prisma.user.create);

const existingUser = {
  id: "user-1",
  name: "Ahmed Raza",
  email: "ahmed@example.com",
  passwordHash: "hash",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Authentication API", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe("POST /api/v1/auth/register", () => {
    it("should register a new user and return 201 with user and token", async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        ...existingUser,
        passwordHash: "irrelevant",
      });

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ name: "Ahmed Raza", email: "ahmed@example.com", password: "password123" });

      expect(res.status).toBe(HTTP_STATUSES.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe("user-1");
      expect(res.body.data.user.email).toBe("ahmed@example.com");
      expect(res.body.data.token).toBeTruthy();
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.password).toBeUndefined();
    });

    it("should return 409 when the email is already registered", async () => {
      mockFindUnique.mockResolvedValue(existingUser);

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ name: "Ahmed Raza", email: "ahmed@example.com", password: "password123" });

      expect(res.status).toBe(HTTP_STATUSES.CONFLICT);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("already exists");
    });

    it("should return 400 when validation fails", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ name: "", email: "not-an-email", password: "short" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it("should reject validation failures in middleware before reaching the service", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ name: "", email: "not-an-email", password: "short" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("should return 200 with user and token for valid credentials", async () => {
      const hash = await bcrypt.hash("password123", 10);
      mockFindUnique.mockResolvedValue({ ...existingUser, passwordHash: hash });

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "ahmed@example.com", password: "password123" });

      expect(res.status).toBe(HTTP_STATUSES.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe("user-1");
      expect(res.body.data.token).toBeTruthy();
    });

    it("should return 401 for invalid credentials", async () => {
      mockFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "ahmed@example.com", password: "password123" });

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 400 when the body is missing required fields", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email" });

      expect(res.status).toBe(HTTP_STATUSES.BAD_REQUEST);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("should return 401 without a token", async () => {
      const res = await request(app).get("/api/v1/auth/me");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });

    it("should return 401 with an invalid token", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer not-a-valid-token");

      expect(res.status).toBe(HTTP_STATUSES.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });
  });
});
