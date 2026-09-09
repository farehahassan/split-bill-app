import { createHash, randomBytes } from "node:crypto";

// Like refresh tokens, email-verification and password-recovery tokens are
// high-entropy opaque strings. Only their SHA-256 digest is persisted in the
// AuthToken table, so a database leak does not expose re-usable credentials and
// a raw token can never be reconstructed from storage.
const AUTH_TOKEN_BYTES = 32;

/**
 * Generates a new opaque auth token (256 bits of entropy, base64url encoded).
 * The plaintext value is returned exactly once, used to build the e-mail action
 * link, and never stored or logged.
 */
export function generateAuthToken(): string {
  return randomBytes(AUTH_TOKEN_BYTES).toString("base64url");
}

/**
 * Returns the SHA-256 hex digest of an auth token. Used for database lookup and
 * persistence; the raw token is never stored or logged.
 */
export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}