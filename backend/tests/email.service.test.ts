import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import { loadEnv, resetEnv } from "../src/config/env.js";
import { resetMetrics } from "../src/metrics/registry.js";
import { APP_ERRORS } from "../src/constants/app-errors.js";
import { logger, setSilent } from "../src/utils/logger.js";
import { EmailService } from "../src/modules/email/email.service.js";
import { LogEmailProvider } from "../src/modules/email/log.provider.js";
import type { EmailMessage, EmailProvider } from "../src/modules/email/email.types.js";

const captured: EmailMessage[] = [];

function capturingProvider(): EmailProvider {
  return {
    send: vi.fn().mockImplementation(async (message: EmailMessage) => {
      captured.push(message);
    }),
  };
}

function failingProvider(): EmailProvider {
  return {
    send: vi.fn().mockRejectedValue(new Error("smtp connection refused")),
  };
}

beforeEach(() => {
  resetEnv();
  loadEnv();
  resetMetrics();
  captured.length = 0;
  vi.restoreAllMocks();
  setSilent(true);
});

afterEach(() => {
  process.env.NODE_ENV = "test";
});

describe("EmailService verification email", () => {
  it("sends a well-formed verification message to the configured recipient", async () => {
    const service = new EmailService(capturingProvider());

    await service.sendVerificationEmail(
      "ahmed@example.com",
      "http://localhost:3000/verify-email?token=abc",
      "Ahmed",
    );

    expect(captured).toHaveLength(1);
    const message = captured[0];
    expect(message.to).toBe("ahmed@example.com");
    expect(message.from).toBe("Hisab <no-reply@localhost>");
    expect(message.subject).toBe("Verify your email address");
    expect(message.text).toContain("Hi Ahmed,");
    expect(message.text).toContain("http://localhost:3000/verify-email?token=abc");
    expect(message.text).toContain("Hisab Split Bill");
    expect(message.html).toContain("Verify email");
  });
});

describe("EmailService password-reset email", () => {
  it("sends a well-formed reset message to the configured recipient", async () => {
    const service = new EmailService(capturingProvider());

    await service.sendPasswordResetEmail(
      "ahmed@example.com",
      "http://localhost:3000/reset-password?token=xyz",
      "Ahmed",
    );

    expect(captured).toHaveLength(1);
    const message = captured[0];
    expect(message.to).toBe("ahmed@example.com");
    expect(message.subject).toBe("Reset your password");
    expect(message.text).toContain("http://localhost:3000/reset-password?token=xyz");
    expect(message.text).toContain("choose a new password");
    expect(message.html).toContain("Reset password");
  });
});

describe("EmailService delivery failures", () => {
  it("maps a provider failure to EmailDeliveryError without leaking internals", async () => {
    const service = new EmailService(failingProvider());

    await expect(
      service.sendVerificationEmail("ahmed@example.com", "http://localhost:3000/v", "Ahmed"),
    ).rejects.toMatchObject({
      code: APP_ERRORS.EMAIL_DELIVERY_FAILED,
      statusCode: 503,
    });
  });
});

describe("LogEmailProvider", () => {
  it("logs recipient metadata only when not in development", async () => {
    process.env.NODE_ENV = "test";
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});

    const provider = new LogEmailProvider();
    await provider.send({
      from: "Hisab <no-reply@localhost>",
      to: "ahmed@example.com",
      subject: "Verify your email address",
      text: "super-secret-verification-url",
      html: "<p>super-secret-verification-url</p>",
    });

    expect(info).toHaveBeenCalledTimes(1);
    const [message, fields] = info.mock.calls[0];
    expect(message).toBe("Email would be sent (no SMTP transport configured):");
    expect(fields).toEqual({
      from: "Hisab <no-reply@localhost>",
      to: "ahmed@example.com",
      subject: "Verify your email address",
    });
  });

  it("never writes email bodies to logs outside development", async () => {
    process.env.NODE_ENV = "test";
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});

    const provider = new LogEmailProvider();
    await provider.send({
      from: "Hisab <no-reply@localhost>",
      to: "ahmed@example.com",
      subject: "Reset your password",
      text: "http://localhost:3000/reset-password?token=secret",
      html: "<p>secret</p>",
    });

    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("reset-password?token");
  });

  it("prints the body in development to double as the local inbox", async () => {
    process.env.NODE_ENV = "development";
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});

    const provider = new LogEmailProvider();
    await provider.send({
      from: "Hisab <no-reply@localhost>",
      to: "ahmed@example.com",
      subject: "Verify your email address",
      text: "http://localhost:3000/verify-email?token=abc",
      html: "<p>abc</p>",
    });

    const [message, fields] = info.mock.calls[0];
    expect(message).toBe("Email dispatch (log transport, development inbox):");
    expect(fields?.body).toContain("verify-email?token=abc");
    expect(fields?.truncated).toBe(false);
  });
});