/**
 * Whether mail can actually leave this server.
 *
 * `sendEmail` deliberately swallows failures — a password-reset request must
 * not 500 because SMTP is down — but swallowing them left no signal anywhere
 * that mail had stopped. A user asks for a reset, is told to check their inbox,
 * and nothing arrives. This is what makes that visible.
 */
const mockEnv: Record<string, string | undefined> = {
  NODE_ENV: 'production',
  SENDGRID_API_KEY: 'SG.realkey',
  EMAIL_FROM: 'noreply@cs.ug.edu.gh',
  EMAIL_FROM_NAME: 'AESIS',
};

jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('nodemailer', () => ({
  default: { createTransport: jest.fn(() => ({ sendMail: jest.fn() })) },
  createTransport: jest.fn(() => ({ sendMail: jest.fn() })),
}));

import { emailStatus } from '../email';

describe('emailStatus', () => {
  it('reports a properly configured sender as deliverable', () => {
    const s = emailStatus();
    expect(s).toMatchObject({
      configured: true, deliverable: true, from: 'noreply@cs.ug.edu.gh',
    });
    expect(s.problem).toBeUndefined();
  });

  it('never publishes the API key', () => {
    expect(JSON.stringify(emailStatus())).not.toContain('SG.realkey');
  });

  it('reports the SMTP host it sends through, and prefers it over SendGrid', () => {
    // Both configured is the state a deployment is in mid-switch. The generic
    // SMTP credentials are the ones actually used, so they are the ones the
    // endpoint must name — reporting the old provider would send whoever is
    // debugging to the wrong dashboard.
    mockEnv.SMTP_HOST = 'smtp-relay.brevo.com';
    mockEnv.SMTP_PORT = '587';
    mockEnv.SMTP_USER = '9a1b2c001@smtp-brevo.com';
    mockEnv.SMTP_PASS = 'brevo-smtp-key';

    const s = emailStatus();
    expect(s.configured).toBe(true);
    expect(s.provider).toBe('smtp-relay.brevo.com');
    // The password is a credential exactly like the API key was.
    expect(JSON.stringify(s)).not.toContain('brevo-smtp-key');

    mockEnv.SMTP_HOST = undefined;
    mockEnv.SMTP_USER = undefined;
    mockEnv.SMTP_PASS = undefined;
  });

  it('is not configured by a half-filled SMTP block', () => {
    // A host with no credentials cannot authenticate anywhere. Treating it as
    // configured would report a deployment as healthy while it silently
    // delivers nothing.
    mockEnv.SENDGRID_API_KEY = undefined;
    mockEnv.SMTP_HOST = 'smtp-relay.brevo.com';

    const s = emailStatus();
    expect(s.configured).toBe(false);
    expect(s.provider).toBeNull();

    mockEnv.SMTP_HOST = undefined;
    mockEnv.SENDGRID_API_KEY = 'SG.realkey';
  });

  it('names the placeholder FROM address as the problem', () => {
    // The blueprint default. Every provider rejects a send whose FROM is not a
    // verified sender identity, and this domain is a placeholder nobody owns —
    // so perfectly valid credentials still deliver nothing, and the rejection
    // that says so was being swallowed.
    mockEnv.EMAIL_FROM = 'noreply@aesis.cs.edu';
    const s = emailStatus();

    expect(s.configured).toBe(true);
    // Configured is not the same as working. This is the distinction the
    // endpoint exists to draw.
    expect(s.deliverable).toBe(false);
    expect(s.problem).toMatch(/verified sender/);
  });

  it('reports missing credentials in production as delivering nothing', () => {
    mockEnv.EMAIL_FROM = 'noreply@cs.ug.edu.gh';
    mockEnv.SENDGRID_API_KEY = undefined;

    const s = emailStatus();
    expect(s.configured).toBe(false);
    expect(s.deliverable).toBe(false);
    expect(s.problem).toMatch(/not set/);
  });

  it('treats missing credentials outside production as expected, not broken', () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.SENDGRID_API_KEY = undefined;

    const s = emailStatus();
    expect(s.problem).toMatch(/expected outside production/);
  });
});
