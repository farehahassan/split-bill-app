import * as nodemailer from "nodemailer";

import type { EmailMessage, EmailProvider } from "./email.types.js";

export interface SmtpProviderConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

/**
 * Nodemailer SMTP transport. The provider is deliberately thin: it hands the
 * message to the transport and throws on failure so the email service can apply
 * the "best-effort" policy (log + degrade) at the caller boundary.
 *
 * Credentials are only ever passed to the transport; they are never logged or
 * exposed through errors.
 */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: nodemailer.Transporter;

  constructor(config: SmtpProviderConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.username.length > 0
          ? { user: config.username, pass: config.password }
          : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}