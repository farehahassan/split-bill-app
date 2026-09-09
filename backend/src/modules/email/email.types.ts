/**
 * Transactional email transport contract. Keeping providers behind this minimal
 * interface lets the auth flow operate identically against a real SMTP server,
 * a local development sink, or a test double without any code changes.
 */

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}