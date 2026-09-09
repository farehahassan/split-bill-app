export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface VerificationEmailData {
  appName: string;
  userName: string;
  verificationUrl: string;
  expiresInMinutes: number;
}

export interface PasswordResetEmailData {
  appName: string;
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? "" : "s"}`;
}

function buildHtml(
  appName: string,
  heading: string,
  paragraphs: string[],
  buttonLabel: string,
  buttonUrl: string,
): string {
  const paragraphsHtml = paragraphs.map((p) => `<p>${p}</p>`).join("\n");
  return [
    "<!DOCTYPE html>",
    `<html lang="en">`,
    "  <body style=\"margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f5f7;color:#1f2937\">",
    '    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0">',
    "      <tr>",
    '        <td align="center">',
    '          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:32px;text-align:left">',
    "            <tr>",
    `              <td><h1 style="font-size:20px;margin:0 0 16px 0">${heading}</h1></td>`,
    "            </tr>",
    `            <tr><td>${paragraphsHtml}</td></tr>`,
    "            <tr>",
    `              <td style="padding:24px 0"><a href="${buttonUrl}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;display:inline-block">${buttonLabel}</a></td>`,
    "            </tr>",
    `            <tr><td style="color:#6b7280;font-size:13px;line-height:1.6">If the button above does not work, copy and paste this link into your browser:<br/>${buttonUrl}</td></tr>`,
    `            <tr><td style="color:#9ca3af;font-size:12px;padding-top:16px">&mdash; ${appName}</td></tr>`,
    "          </table>",
    "        </td>",
    "      </tr>",
    "    </table>",
    "  </body>",
    "</html>",
  ].join("\n");
}

export function buildVerificationEmail(data: VerificationEmailData): RenderedEmail {
  const ttl = formatMinutes(data.expiresInMinutes);
  return {
    subject: "Verify your email address",
    text: [
      `Hi ${data.userName},`,
      "",
      `Welcome to ${data.appName}! Please verify your email address by opening the link below.`,
      "",
      `${data.verificationUrl}`,
      "",
      `This link expires in ${ttl}. If you did not create an account, you can safely ignore this email.`,
      "",
      `Thanks,`,
      `${data.appName}`,
    ].join("\n"),
    html: buildHtml(
      data.appName,
      "Verify your email address",
      [
        `Hi ${data.userName},`,
        `Welcome to <strong>${data.appName}</strong>! Please verify your email address to activate your account.`,
        `This link expires in ${ttl}. If you did not create an account, you can safely ignore this email.`,
      ],
      "Verify email",
      data.verificationUrl,
    ),
  };
}

export function buildPasswordResetEmail(data: PasswordResetEmailData): RenderedEmail {
  const ttl = formatMinutes(data.expiresInMinutes);
  return {
    subject: "Reset your password",
    text: [
      `Hi ${data.userName},`,
      "",
      `We received a request to reset the password for your ${data.appName} account. Open the link below to choose a new password.`,
      "",
      `${data.resetUrl}`,
      "",
      `This link expires in ${ttl}. If you did not request a password reset, you can safely ignore this email.`,
      "",
      `Thanks,`,
      `${data.appName}`,
    ].join("\n"),
    html: buildHtml(
      data.appName,
      "Reset your password",
      [
        `Hi ${data.userName},`,
        `We received a request to reset the password for your <strong>${data.appName}</strong> account. Choose a new password using the link below.`,
        `This link expires in ${ttl}. If you did not request a password reset, you can safely ignore this email.`,
      ],
      "Reset password",
      data.resetUrl,
    ),
  };
}