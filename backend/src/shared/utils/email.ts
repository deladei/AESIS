import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

interface EmailPayload {
  to:      string;
  subject: string;
  html:    string;
}

/**
 * Which provider this deployment sends through, or null when it sends nothing.
 *
 * Generic SMTP first: any provider — Brevo, Mailjet, Resend, Gmail — is then a
 * config change rather than a code change. SENDGRID_API_KEY is the older
 * single-provider path, kept so a deployment already sending through SendGrid
 * keeps working until its SMTP_* vars are filled in.
 */
function resolveProvider(): { name: string; options: nodemailer.TransportOptions } | null {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return {
      name: env.SMTP_HOST,
      options: {
        host:   env.SMTP_HOST,
        port:   env.SMTP_PORT,
        // 465 is implicit TLS; 587 starts plaintext and upgrades via STARTTLS.
        // Getting this pair wrong is the usual cause of a hang on connect.
        secure: env.SMTP_PORT === 465,
        auth:   { user: env.SMTP_USER, pass: env.SMTP_PASS },
      } as nodemailer.TransportOptions,
    };
  }
  if (env.SENDGRID_API_KEY) {
    return {
      name: 'smtp.sendgrid.net',
      options: {
        host:   'smtp.sendgrid.net',
        port:   465,
        secure: true,
        auth:   { user: 'apikey', pass: env.SENDGRID_API_KEY },
      } as nodemailer.TransportOptions,
    };
  }
  return null;
}

/**
 * Whether mail can actually leave this server.
 *
 * Outside production nothing is sent even with credentials present — dev logs
 * instead — and the registration flow reads this to decide whether to auto-
 * verify: a user must never be told to check an inbox no message is going to.
 */
export function canSendEmail(): boolean {
  return env.NODE_ENV === 'production' && resolveProvider() !== null;
}

/**
 * Built on first send, not at import: a module loaded before its config is
 * settled would otherwise cache "no mail" for the life of the process.
 * Dev/test never gets a transport at all — those messages go to the log.
 */
let transport: nodemailer.Transporter | null | undefined;

function getTransport(): nodemailer.Transporter | null {
  if (transport === undefined) {
    const provider = canSendEmail() ? resolveProvider() : null;
    transport = provider ? nodemailer.createTransport(provider.options) : null;
  }
  return transport;
}

/**
 * The last send that failed, and why.
 *
 * `sendEmail` deliberately swallows failures — a password-reset request must
 * not 500 because SMTP is down — but swallowing them left NO signal anywhere
 * that mail had stopped working. A user asks for a reset, sees "check your
 * inbox", and nothing arrives; nobody finds out until someone complains. This
 * is what `/health/email` reports.
 */
let lastFailure: { at: string; to: string; subject: string; detail: string } | null = null;
let lastSuccessAt: string | null = null;

/**
 * A misconfiguration worth shouting about ONCE at boot rather than silently
 * per email. In production with no key, every message this system sends —
 * verification, password reset, supervisor invitations — goes to the log and
 * nowhere else.
 */
if (env.NODE_ENV === 'production' && !resolveProvider()) {
  logger.error('EMAIL DISABLED: no SMTP_HOST/SMTP_USER/SMTP_PASS (or SENDGRID_API_KEY) — no mail will be delivered');
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    logger.info('📧 [DEV EMAIL — not sent]', {
      to:      payload.to,
      subject: payload.subject,
      html:    payload.html,
    });
    return;
  }

  try {
    await transport.sendMail({
      from:    `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
      to:      payload.to,
      subject: payload.subject,
      html:    payload.html,
    });
    lastSuccessAt = new Date().toISOString();
    logger.info('Email sent', { to: payload.to, subject: payload.subject });
  } catch (err) {
    // Every provider's most common rejection is on an unverified sender
    // identity — the FROM address, not the key. Their messages say so, and
    // keeping it is the difference between a fixable report and "failed".
    const detail = err instanceof Error ? err.message.split('\n')[0].slice(0, 200) : String(err);
    lastFailure = { at: new Date().toISOString(), to: payload.to, subject: payload.subject, detail };
    logger.error('Failed to send email', { to: payload.to, subject: payload.subject, detail });
    // Still non-fatal: a reset request must not 500 because SMTP is down.
  }
}

/**
 * Whether mail can actually leave this server, and what went wrong last time.
 *
 * Publishes the sender identity — which is the setting that is usually wrong —
 * and never the API key. Mirrors `mongoTarget()`.
 */
export function emailStatus(): {
  configured: boolean; deliverable: boolean; provider: string | null;
  from: string; fromName: string;
  problem?: string; lastSuccessAt: string | null;
  lastFailure: typeof lastFailure;
} {
  const provider = resolveProvider();
  const configured = provider !== null;
  const from = env.EMAIL_FROM;

  let problem: string | undefined;
  if (!configured) {
    problem = env.NODE_ENV === 'production'
      ? 'SMTP_HOST/SMTP_USER/SMTP_PASS are not set (and no SENDGRID_API_KEY) — nothing is delivered'
      : 'No SMTP credentials set: mail is logged, not sent (expected outside production)';
  } else if (from.endsWith('@aesis.cs.edu')) {
    // The blueprint default. Every provider rejects a send whose FROM is not a
    // verified sender identity, and this domain is a placeholder nobody owns,
    // so every message fails with an error that used to be swallowed.
    problem = `EMAIL_FROM is still the placeholder ${from} — the provider will reject it unless that exact address is a verified sender`;
  }

  return {
    configured,
    // The host mail leaves through — never the credential. Publishing it is
    // what makes a stale or half-switched provider visible from outside.
    provider: provider?.name ?? null,
    // Configured is not the same as working: a key with an unverified sender
    // sends nothing at all.
    deliverable: configured && !problem,
    from,
    fromName: env.EMAIL_FROM_NAME,
    problem,
    lastSuccessAt,
    lastFailure,
  };
}

// ── Email templates ───────────────────────────────────────────

export function buildVerificationEmail(name: string, token: string): EmailPayload['html'] {
  const url = `${env.FRONTEND_URL}/auth/verify-email?token=${token}`;
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1e40af;">Verify your AESIS account</h2>
      <p>Hello ${name},</p>
      <p>Please click the link below to verify your email address and activate your account.</p>
      <p style="margin:24px 0;">
        <a href="${url}" style="background:#1e40af;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
          Verify Email
        </a>
      </p>
      <p style="color:#64748b;font-size:14px;">This link expires in 24 hours. If you did not register for AESIS, ignore this email.</p>
      <p style="color:#64748b;font-size:12px;">Or copy this URL: ${url}</p>
    </div>
  `;
}

export function buildWeeklyCommentInviteEmail(
  supervisorName: string,
  studentName: string,
  companyName: string | null,
  weekNumber: number,
  url: string,
): EmailPayload['html'] {
  const org = companyName ? ` at ${companyName}` : '';
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1e40af;">Weekly comment — ${studentName}, week ${weekNumber}</h2>
      <p>Hello ${supervisorName},</p>
      <p>You are invited to leave a short weekly comment on <strong>${studentName}</strong>'s
         internship${org} for <strong>week ${weekNumber}</strong>. Your comment is shared with
         the trainee and their university supervisor.</p>
      <p style="margin:24px 0;">
        <a href="${url}" style="background:#1e40af;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
          Leave week ${weekNumber} comment
        </a>
      </p>
      <p style="color:#64748b;font-size:14px;">This is a single-use link — it works once and then expires. No account or password is needed.</p>
      <p style="color:#64748b;font-size:12px;">Or copy this URL: ${url}</p>
    </div>
  `;
}

export function buildAssessmentInviteEmail(
  supervisorName: string,
  studentName: string,
  companyName: string | null,
  url: string,
): EmailPayload['html'] {
  const org = companyName ? ` at ${companyName}` : '';
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1e40af;">Industry assessment — ${studentName}</h2>
      <p>Hello ${supervisorName},</p>
      <p>You are invited to complete the confidential end-of-placement assessment for
         <strong>${studentName}</strong>'s internship${org}.</p>
      <p style="margin:24px 0;">
        <a href="${url}" style="background:#1e40af;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
          Complete assessment
        </a>
      </p>
      <p style="color:#64748b;font-size:14px;">This is a single-use link — it works once and then expires. No account or password is needed.</p>
      <p style="color:#64748b;font-size:12px;">Or copy this URL: ${url}</p>
    </div>
  `;
}

export function buildPasswordResetEmail(name: string, token: string): EmailPayload['html'] {
  const url = `${env.FRONTEND_URL}/auth/reset-password/confirm?token=${token}`;
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1e40af;">Reset your AESIS password</h2>
      <p>Hello ${name},</p>
      <p>We received a request to reset your password. Click the link below to set a new password.</p>
      <p style="margin:24px 0;">
        <a href="${url}" style="background:#1e40af;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
          Reset Password
        </a>
      </p>
      <p style="color:#64748b;font-size:14px;">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
      <p style="color:#64748b;font-size:12px;">Or copy this URL: ${url}</p>
    </div>
  `;
}
