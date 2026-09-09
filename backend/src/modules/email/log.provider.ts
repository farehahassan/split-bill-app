import { logger } from "../../utils/logger.js";
import type { EmailMessage, EmailProvider } from "./email.types.js";

const MAX_LOGIN_PROVIDER_BODY_CHARS = 4000;

/**
 * Development log transport. Used when no SMTP provider is configured
 * (`EMAIL_ENABLED=false`), which is the default so the backend never attempts
 * a network connection to a mail server unless explicitly configured.
 *
 * Security contract:
 * - In development (`NODE_ENV=development`) the rendered body is printed in
 *   full because that log stream doubles as the local "inbox" for exercising
 *   the verification/password-recovery flows. Action links are single-use,
 *   short-lived credentials that only reach the configured recipient.
 * - In every other environment the body is never printed — only recipients and
 *   subjects, which are the same operational identifiers the application
 *   already logs for other requests.
 */
export class LogEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    const meta: Record<string, unknown> = {
      from: message.from,
      to: message.to,
      subject: message.subject,
    };

    if (process.env.NODE_ENV === "development") {
      const body = message.text.slice(0, MAX_LOGIN_PROVIDER_BODY_CHARS);
      logger.info("Email dispatch (log transport, development inbox):", {
        ...meta,
        body,
        truncated: message.text.length > MAX_LOGIN_PROVIDER_BODY_CHARS,
      });
      return;
    }

    logger.info("Email would be sent (no SMTP transport configured):", meta);
  }
}