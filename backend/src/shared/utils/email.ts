import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

interface EmailPayload {
  to:      string;
  subject: string;
  html:    string;
}

type Provider =
  | { kind: 'api';  name: string; apiKey: string }
  | { kind: 'smtp'; name: string; options: nodemailer.TransportOptions };

/**
 * Which provider this deployment sends through, or null when it sends nothing.
 *
 * HTTPS first, and not as a stylistic preference: **Render blocks outbound
 * SMTP**. Port 587 to Brevo never completes the connect, nodemailer waits out
 * its timeout, and the reset request hangs until the browser gives up — which
 * is exactly what happened in production. Port 443 is not blocked anywhere.
 *
 * Generic SMTP stays as the second choice for hosts that do allow it, and any
 * provider — Brevo, Mailjet, Resend, Gmail — is then a config change rather
 * than a code change. SENDGRID_API_KEY is the older single-provider path, kept
 * so a deployment already sending through SendGrid keeps working.
 */
function resolveProvider(): Provider | null {
  if (env.BREVO_API_KEY) {
    return { kind: 'api', name: 'api.brevo.com', apiKey: env.BREVO_API_KEY };
  }
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return {
      kind: 'smtp',
      name: env.SMTP_HOST,
      options: {
        host:   env.SMTP_HOST,
        port:   env.SMTP_PORT,
        // 465 is implicit TLS; 587 starts plaintext and upgrades via STARTTLS.
        // Getting this pair wrong is the usual cause of a hang on connect.
        secure: env.SMTP_PORT === 465,
        auth:   { user: env.SMTP_USER, pass: env.SMTP_PASS },
        // Without these, a blocked port is a two-minute hang rather than an
        // error: the request that is waiting on it times out in the browser
        // first, and the user is told something untrue about the server.
        connectionTimeout: 10_000,
        greetingTimeout:   10_000,
        socketTimeout:     20_000,
      } as nodemailer.TransportOptions,
    };
  }
  if (env.SENDGRID_API_KEY) {
    return {
      kind: 'smtp',
      name: 'smtp.sendgrid.net',
      options: {
        host:   'smtp.sendgrid.net',
        port:   465,
        secure: true,
        auth:   { user: 'apikey', pass: env.SENDGRID_API_KEY },
        connectionTimeout: 10_000,
        greetingTimeout:   10_000,
        socketTimeout:     20_000,
      } as nodemailer.TransportOptions,
    };
  }
  return null;
}

/**
 * Brevo's transactional endpoint. Same account and same verified sender as the
 * SMTP path — a different door into it, over a port nothing blocks.
 */
async function sendViaBrevoApi(apiKey: string, payload: EmailPayload): Promise<void> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      'api-key':      apiKey,
      'content-type': 'application/json',
      accept:         'application/json',
    },
    body: JSON.stringify({
      sender:      { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM },
      to:          [{ email: payload.to }],
      subject:     payload.subject,
      htmlContent: payload.html,
    }),
    // A send must not outlive the request that is waiting on it.
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // Brevo answers a rejection with {code, message} — the message names the
    // actual cause (unverified sender, bad key), so it is worth keeping.
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${body.slice(0, 200)}`);
  }
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
 * settled would otherwise cache "no mail" for the life of the process. Only
 * the SMTP path needs one — the API path is a plain HTTPS request, and
 * dev/test builds nothing at all because those messages go to the log.
 */
let transport: nodemailer.Transporter | undefined;

function getTransport(options: nodemailer.TransportOptions): nodemailer.Transporter {
  if (!transport) transport = nodemailer.createTransport(options);
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
  logger.error('EMAIL DISABLED: no BREVO_API_KEY, no SMTP_HOST/SMTP_USER/SMTP_PASS, no SENDGRID_API_KEY — no mail will be delivered');
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const provider = canSendEmail() ? resolveProvider() : null;
  if (!provider) {
    logger.info('📧 [DEV EMAIL — not sent]', {
      to:      payload.to,
      subject: payload.subject,
      html:    payload.html,
    });
    return;
  }

  try {
    if (provider.kind === 'api') {
      await sendViaBrevoApi(provider.apiKey, payload);
    } else {
      await getTransport(provider.options).sendMail({
        from:    `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`,
        to:      payload.to,
        subject: payload.subject,
        html:    payload.html,
      });
    }
    lastSuccessAt = new Date().toISOString();
    logger.info('Email sent', { to: payload.to, subject: payload.subject });
  } catch (err) {
    // Every provider's most common rejection is on an unverified sender
    // identity — the FROM address, not the key. Their messages say so, and
    // keeping it is the difference between a fixable report and "failed".
    const detail = err instanceof Error ? err.message.split('\n')[0].slice(0, 200) : String(err);
    lastFailure = { at: new Date().toISOString(), to: payload.to, subject: payload.subject, detail };
    logger.error('Failed to send email', { to: payload.to, subject: payload.subject, detail });
    // Still non-fatal: a reset request must not 500 because mail is down.
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
      ? 'BREVO_API_KEY and SMTP_HOST/SMTP_USER/SMTP_PASS are not set — nothing is delivered'
      : 'No mail credentials set: mail is logged, not sent (expected outside production)';
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
