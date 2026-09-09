import { getEnv, loadEnv } from "../../config/env.js";
import { APP_ERRORS } from "../../constants/app-errors.js";
import { EmailDeliveryError } from "../../errors/app.error.js";
import { METRIC, metrics } from "../../metrics/registry.js";
import { logger } from "../../utils/logger.js";
import { createEmailProvider } from "./provider.js";
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  type RenderedEmail,
} from "./templates.js";
import type { EmailMessage, EmailProvider } from "./email.types.js";

const EMAIL_OPERATION = {
  verification: "email_verification",
  passwordReset: "password_reset",
} as const;

function formatFrom(name: string, address: string): string {
  return `${name} <${address}>`;
}

/**
 * Sends transactional auth emails through the configured provider.
 *
 * Failure policy is at the caller's discretion: `dispatch` turns a provider
 * failure into an `EmailDeliveryError` (HTTP 503) so callers can decide whether
 * the surrounding operation must fail (there is nothing to show the user) or
 * degrade gracefully (registration and password-recovery still succeed, the
 * email can be re-sent later).
 *
 * Only operational information is logged (operation, recipient, subject). Email
 * bodies, tokens, and SMTP credentials are never written to application logs.
 */
export class EmailService {
  constructor(private readonly provider: EmailProvider) {}

  async sendVerificationEmail(
    to: string,
    verificationUrl: string,
    userName: string,
  ): Promise<void> {
    const env = getEnv();
    const rendered = buildVerificationEmail({
      appName: env.APP_NAME,
      userName,
      verificationUrl,
      expiresInMinutes: env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES,
    });
    await this.dispatch(EMAIL_OPERATION.verification, to, rendered);
  }

  async sendPasswordResetEmail(to: string, resetUrl: string, userName: string): Promise<void> {
    const env = getEnv();
    const rendered = buildPasswordResetEmail({
      appName: env.APP_NAME,
      userName,
      resetUrl,
      expiresInMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    });
    await this.dispatch(EMAIL_OPERATION.passwordReset, to, rendered);
  }

  private async dispatch(operation: string, to: string, rendered: RenderedEmail): Promise<void> {
    const env = getEnv();
    const message: EmailMessage = {
      from: formatFrom(env.EMAIL_FROM_NAME, env.EMAIL_FROM),
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    };

    logger.info("Email dispatch attempt", { operation, to, subject: rendered.subject });
    try {
      await this.provider.send(message);
      metrics.increment(METRIC.emailsSentTotal, { operation });
      logger.info("Email dispatched", { operation, to });
    } catch (error) {
      metrics.increment(METRIC.emailSendFailuresTotal, { operation });
      const safeError = error instanceof Error ? error.message : String(error);
      logger.error("Email dispatch failed", { operation, to, error: safeError });
      throw new EmailDeliveryError(
        APP_ERRORS.EMAIL_DELIVERY_FAILED,
        "Email delivery failed. Please try again later.",
      );
    }
  }
}

/**
 * The default service used by the auth flow: driven purely by environment
 * configuration, so no caller needs to wire a provider explicitly.
 */
export function createDefaultEmailService(): EmailService {
  return new EmailService(createEmailProvider(loadEnv()));
}

export { EMAIL_OPERATION };