import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

import { AuthService } from "../src/modules/auth/auth.service.js";
import { AuthRepository } from "../src/modules/auth/auth.repository.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { HTTP_STATUSES } from "../src/constants/http-statuses.js";

vi.mock("../src/modules/auth/auth.repository.js", async () => {
  const actual = await vi.importActual<typeof import("../src/modules/auth/auth.repository.js")>(
    "../src/modules/auth/auth.repository.js",
  );
  return {
    ...actual,
    AuthRepository: vi.fn(() => ({
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    })),
  };
});

import { loadEnv, resetEnv } from "../src/config/env.js";

const repository = vi.mocked(new AuthRepository());

function makeService(): AuthService {
  return new AuthService(repository);
}

describe("AuthService", () => {
  beforeEach(() => {
    resetEnv();
    loadEnv();
    vi.clearAllMocks();
  });

  describe("register", () => {
    it("should create a user and return an auth result with a token", async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockResolvedValue({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });

      const service = makeService();
      const result = await service.register({
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        password: "password123",
      });

      expect(repository.create).toHaveBeenCalledWith({
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        passwordHash: expect.any(String),
      });
      expect(repository.create.mock.calls[0]?.[0].passwordHash).not.toBe("password123");
      expect(result.user).toEqual({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });
      expect(result.token).toBeTruthy();
    });

    it("should throw CONFLICT when the email is already registered", async () => {
      repository.findByEmail.mockResolvedValue({
        id: "existing",
        name: "Existing",
        email: "ahmed@example.com",
        passwordHash: "hash",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdGroups: [],
        memberships: [],
        paidExpenses: [],
        expenseSplits: [],
        settlementsPaid: [],
        settlementsGot: [],
        activities: [],
        refreshTokens: [],
      });

      const service = makeService();
      await expect(
        service.register({
          name: "Ahmed Raza",
          email: "ahmed@example.com",
          password: "password123",
        }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.EMAIL_IN_USE,
        statusCode: HTTP_STATUSES.CONFLICT,
      });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("should return a token for valid credentials", async () => {
      const hash = await bcrypt.hash("password123", 10);
      repository.findByEmail.mockResolvedValue({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        passwordHash: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdGroups: [],
        memberships: [],
        paidExpenses: [],
        expenseSplits: [],
        settlementsPaid: [],
        settlementsGot: [],
        activities: [],
        refreshTokens: [],
      });

      const service = makeService();
      const result = await service.login({
        email: "ahmed@example.com",
        password: "password123",
      });

      expect(result.user.email).toBe("ahmed@example.com");
      expect(result.token).toBeTruthy();
    });

    it("should throw UNAUTHORIZED for an unregistered email", async () => {
      repository.findByEmail.mockResolvedValue(null);

      const service = makeService();
      await expect(
        service.login({ email: "nobody@example.com", password: "password123" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.INVALID_CREDENTIALS,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });

    it("should throw UNAUTHORIZED for a wrong password", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      repository.findByEmail.mockResolvedValue({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        passwordHash: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdGroups: [],
        memberships: [],
        paidExpenses: [],
        expenseSplits: [],
        settlementsPaid: [],
        settlementsGot: [],
        activities: [],
        refreshTokens: [],
      });

      const service = makeService();
      await expect(
        service.login({ email: "ahmed@example.com", password: "wrong-password" }),
      ).rejects.toMatchObject({
        code: APP_ERRORS.INVALID_CREDENTIALS,
        statusCode: HTTP_STATUSES.UNAUTHORIZED,
      });
    });
  });

  describe("getMe", () => {
    it("should return the user when found", async () => {
      repository.findById.mockResolvedValue({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
        passwordHash: "hash",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdGroups: [],
        memberships: [],
        paidExpenses: [],
        expenseSplits: [],
        settlementsPaid: [],
        settlementsGot: [],
        activities: [],
        refreshTokens: [],
      });

      const service = makeService();
      const user = await service.getMe("user-1");

      expect(user).toEqual({
        id: "user-1",
        name: "Ahmed Raza",
        email: "ahmed@example.com",
      });
    });

    it("should throw NOT_FOUND when the user does not exist", async () => {
      repository.findById.mockResolvedValue(null);

      const service = makeService();
      await expect(service.getMe("missing")).rejects.toMatchObject({
        code: APP_ERRORS.USER_NOT_FOUND,
        statusCode: HTTP_STATUSES.NOT_FOUND,
      });
    });
  });
});
