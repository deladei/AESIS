import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

interface EmailPayload {
  to:      string;
  subject: string;
  html:    string;
}

function createTransport() {
  if (env.NODE_ENV === 'production' && env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host:   'smtp.sendgrid.net',
      port:   465,
      secure: true,
      auth:   { user: 'apikey', pass: env.SENDGRID_API_KEY },
    });
  }
  // Dev/test: log emails to console instead of sending
  return null;
}

const transport = createTransport();

export async function sendEmail(payload: EmailPayload): Promise<void> {
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
    logger.info('Email sent', { to: payload.to, subject: payload.subject });
  } catch (err) {
    logger.error('Failed to send email', { to: payload.to, error: err });
    // Email failure is non-fatal — log and continue
  }
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
