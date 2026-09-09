import type { Env } from "../../config/env.js";
import type { EmailProvider } from "./email.types.js";
import { LogEmailProvider } from "./log.provider.js";
import { SmtpEmailProvider } from "./smtp.provider.js";

/**
 * Builds the email provider from configuration. SMTP is only used when
 * explicitly enabled (`EMAIL_ENABLED=true`); otherwise the backend falls back
 * to the log transport so local development and automated tests never depend on
 * a live mail server.
 */
export function createEmailProvider(env: Env): EmailProvider {
  if (env.EMAIL_ENABLED === "true") {
    return new SmtpEmailProvider({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_SECURE === "true",
      username: env.EMAIL_USERNAME,
      password: env.EMAIL_PASSWORD,
    });
  }
  return new LogEmailProvider();
}